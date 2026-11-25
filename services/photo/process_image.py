"""Isolated image processor. No HTTP endpoint, credentials, uploads or public storage.
Production broker must authenticate, reserve capacity and use an OS memory/time sandbox.
Only sanitized JPEG variants are returned. Original bytes never leave this function.
"""
from io import BytesIO
import hashlib
import math
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError, __version__ as pillow_version

if tuple(int(part) for part in pillow_version.split('.')[:2]) < (13, 0):
    raise RuntimeError('Pillow 13.0.0 or later is required; see the security review')

MAX_INPUT = 8 * 1024 * 1024
MAX_PIXELS = 12_000_000
VERSION = 'nugget-photo-1'
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

class PhotoRejected(ValueError):
    pass

# LOGIC-START: validate every coordinate before changing any pixels.
def rectangle(value, width, height):
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise PhotoRejected('invalid_rectangle')
    if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in value):
        raise PhotoRejected('invalid_rectangle')
    left, top, right, bottom = value
    if not 0 <= left < right <= width or not 0 <= top < bottom <= height:
        raise PhotoRejected('invalid_rectangle')
    return math.floor(left), math.floor(top), math.ceil(right), math.ceil(bottom)


def process_image(raw, crop=None, redactions=()):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= MAX_INPUT:
        raise PhotoRejected('file_size_limit')
    if len(redactions) > 30:
        raise PhotoRejected('redaction_limit')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=('JPEG', 'PNG', 'WEBP')) as probe:
                if probe.format not in ('JPEG', 'PNG', 'WEBP'):
                    raise PhotoRejected('use_jpeg_png_or_webp')
                if getattr(probe, 'n_frames', 1) != 1:
                    raise PhotoRejected('animation_not_supported')
                if probe.width * probe.height > MAX_PIXELS:
                    raise PhotoRejected('pixel_limit')
                probe.verify()
            with Image.open(BytesIO(raw), formats=('JPEG', 'PNG', 'WEBP')) as decoded:
                decoded.load()
                oriented = ImageOps.exif_transpose(decoded)
                # Flatten transparency and rebuild a metadata-free RGB raster.
                rgba = oriented.convert('RGBA')
                clean = Image.new('RGB', rgba.size, 'white')
                clean.paste(rgba, mask=rgba.getchannel('A'))
        width, height = clean.size
        crop_box = rectangle(crop, width, height) if crop is not None else (0, 0, width, height)
        boxes = [rectangle(box, width, height) for box in redactions]
        # Opaque fill, never reversible blur. Coordinates refer to oriented full image.
        for box in boxes:
            clean.paste((0, 0, 0), box)
        clean = clean.crop(crop_box)
        variants = {}
        for name, bound, quality in [('thumb', 320, 75), ('display', 1600, 82)]:
            image = clean.copy()
            image.thumbnail((bound, bound), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, 'JPEG', quality=quality, optimize=True)
            data = output.getvalue()
            if len(data) > 1_500_000:
                raise PhotoRejected('output_size_limit')
            variants[name] = {'bytes': data, 'width': image.width, 'height': image.height,
                              'sha256': hashlib.sha256(data).hexdigest(), 'mime': 'image/jpeg'}
        return {'processor_version': VERSION, 'variants': variants,
                'publication': 'requires_human_review'}
    except PhotoRejected:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
            Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
        raise PhotoRejected('invalid_or_unsafe_image') from error
# LOGIC-END
