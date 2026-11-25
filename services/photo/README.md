# Photo processing component

Local processing only. No network endpoint, credentials, Storage writes, publication, face detection or moderation decision. Do not expose this function directly to uploads.

Python 3.13 with `pip install -r services/photo/requirements.txt`, then `python -m unittest discover -s tests/photo -v`. Use an isolated environment. The tested dependency is Pillow 13.0.0; older versions are rejected. Keep codec security and the runtime image under review.

`process_image(bytes, crop=None, redactions=())` accepts at most 8 MiB, 12 million decoded pixels and 30 opaque redaction rectangles. Rectangles are pixel coordinates `[left, top, right, bottom]` on the EXIF-oriented full image. Apply redactions before cropping. Client percentage coordinates need a validated conversion at the trusted broker; never accept client-only redaction as evidence of safety. Unsupported types, animation, corrupt images, excess dimensions and invalid rectangles fail closed. HEIC is currently unsupported and needs a clear conversion flow or a separately reviewed decoder before real-phone acceptance.

The output holds JPEG bytes for thumb/display, dimensions, content hashes and processor version. It contains no original filename, location, EXIF or original metadata. Hashes are for private byte integrity, never public cross-account tracking. The output explicitly requires human review. The processor cannot recognize people, text, payment information or authenticity.

## Trusted broker contract to implement and test

1. Authenticate a scoped participant session. Check current invitation, photo permission, parent controls, posting status and target visibility. Never accept a client-supplied age, consent success, object key, publication flag or processing-complete flag.
2. Reserve capacity through the idempotent SQL function. Return an opaque reservation ID. Bound per-account connections, byte stream, wall time and cumulative storage before decoding; daily reservation limits alone do not prevent connection abuse.
3. Run this processor in a separate process/container with hard memory and CPU/wall-time limits, no outbound network, no credentials and restricted filesystem. Disable core dumps. Do not log input data, filenames, tokens or metadata. Kill on timeout; do not return decoder internals to clients.
4. Write only sanitized variants to private object keys assigned by the server. Recheck consent/target/deletion/revision after processing. Atomic finalization records processor version/digest and changes reserved to pending only when every variant is committed and size checked. A retry returns the same finalized evidence; it does not duplicate blobs. Clean orphan writes after a crash. No originals need persistent staging.
5. Queue human review. Never approve a reservation directly or trust a browser's prepared JPEG as sanitized. Review corrected revisions afresh. Moderators cannot verify parental consent merely by approving a food photo.
6. Serve only through a checked broker that revalidates current consent, publication revision, blocks, account state and linked-content visibility. Do not mint durable public URLs for child evidence. Short-lived links still need an explicit revocation/cache design.
7. Run scheduled cleanup with retry and measured purge completion. Erasure queue rows alone do not erase Storage or backups. Deleting an auth account must also invalidate effective access and replay erasure after a backup restore. No service_role credential in the browser.

The production adapter is deliberately absent until runtime, consent, serving and operational decisions pass their tests. No production Supabase connection is necessary for the next isolated implementation work. See docs/participation-photo/PLAN.md for acceptance and retention decisions.
