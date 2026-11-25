import importlib.util
from io import BytesIO
from pathlib import Path
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('processor', Path(__file__).parents[2] / 'services/photo/process_image.py')
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)

class PhotoTests(unittest.TestCase):
    def image(self, kind='JPEG', size=(200, 100), **options):
        out = BytesIO()
        Image.new('RGB', size, 'red').save(out, kind, **options)
        return out.getvalue()

    def test_metadata_removed_and_orientation_applied(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = 'private address'
        result = processor.process_image(self.image(exif=exif))
        self.assertEqual(result['publication'], 'requires_human_review')
        for variant in result['variants'].values():
            image = Image.open(BytesIO(variant['bytes']))
            self.assertEqual(image.size, (100, 200))
            self.assertEqual(dict(image.getexif()), {})
            self.assertNotIn(b'private address', variant['bytes'])
            self.assertNotIn('icc_profile', image.info)

    def test_crop_redaction_and_limits(self):
        result = processor.process_image(self.image(size=(2000,1000)), [0,0,1000,1000], [[0,0,500,500]])
        thumb = Image.open(BytesIO(result['variants']['thumb']['bytes']))
        self.assertEqual(thumb.size, (320,320))
        self.assertLess(max(thumb.getpixel((40,40))), 10)
        self.assertLessEqual(result['variants']['display']['width'],1600)

    def test_bytes_not_filename_determine_type(self):
        for data in [b'<svg><script>alert(1)</script></svg>', b'not a jpeg', self.image()[:30]]:
            with self.assertRaises(processor.PhotoRejected): processor.process_image(data)
        self.assertEqual(processor.process_image(self.image('PNG'))['variants']['thumb']['mime'],'image/jpeg')

    def test_bad_coordinates(self):
        for box in [[-1,0,30,30],[0,0,201,30],[10,0,5,30],[0,0,float('nan'),30],[False,0,30,30]]:
            with self.assertRaises(processor.PhotoRejected): processor.process_image(self.image(),redactions=[box])

    def test_animation_and_byte_pixel_bombs(self):
        a=Image.new('RGB',(10,10),'red'); b=Image.new('RGB',(10,10),'blue'); out=BytesIO()
        a.save(out,'PNG',save_all=True,append_images=[b])
        with self.assertRaises(processor.PhotoRejected): processor.process_image(out.getvalue())
        with self.assertRaises(processor.PhotoRejected): processor.process_image(b'x'*(processor.MAX_INPUT+1))
        with self.assertRaises(processor.PhotoRejected): processor.process_image(self.image('PNG',(4000,4000)))

    def test_transparency_flattened(self):
        out=BytesIO(); Image.new('RGBA',(20,20),(0,0,0,0)).save(out,'PNG')
        result=processor.process_image(out.getvalue())
        self.assertGreater(min(Image.open(BytesIO(result['variants']['thumb']['bytes'])).getpixel((1,1))),245)

if __name__ == '__main__': unittest.main()
