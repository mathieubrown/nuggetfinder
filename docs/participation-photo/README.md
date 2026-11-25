# Review packet: all ages and Day Zero photography

2026-11-25, development foundation. Based on correction candidate PR #36. No production changes or new services enabled.

Start with [the governing directive](../FOUNDER_DIRECTIVE.md), [the build plan and exact release gaps](PLAN.md), [resolved contradictions](CONTRADICTIONS.md) and [legal drafts for counsel](LEGAL_DRAFTS.md).

## New migrations, in order

Both follow the six PR #36 correction migrations. Neither has been applied live. Existing applied migrations were not edited.

1. [20261125000700_participant_capabilities.sql](../../supabase/migrations/20261125000700_participant_capabilities.sql): individual private participant identities, independently verified operation permissions, readiness gates, own-profile controls and revocation events. All 33 age/operation readiness flags are false. No provisioning or public child profile APIs.
2. [20261125000800_photo_evidence_foundation.sql](../../supabase/migrations/20261125000800_photo_evidence_foundation.sql): shared evidence records, links, variant metadata, review events/report table foundation, serialized/idempotent reservation, private status/export, deletion requests and account-erasure queue hook. No public reads, uploads, approval endpoint, bucket or Storage settings.

## Test evidence

- [Integrated TAP](evidence/integrated-tests.tap): 56 checks pass, zero failures/skips. Includes native PostgreSQL and real local PostgREST/JWT tests. New cases cover closed gates, independent identities, consent expiry/revocation, foreign-account denial, direct table denial, request replay/conflict, concurrent quota enforcement, export minimization and erasure queueing.
- [Image processing](evidence/image-tests.txt): six Python tests pass on Pillow 13.0.0. Metadata/orientation, irreversible redaction/crop, malformed/truncated/unsupported images, animation, byte/pixel limits and transparency. Dependency review and limits in PLAN.md.
- [Browser flows](evidence/browser.txt): 390px/1280px against actual isolated SQL functions. Simulated auth/transport, transparent map tiles, synthetic image labeled LOCAL TEST IMAGE. Both motion preferences checked; no console errors or horizontal overflow; existing correction flows retained. Inline composer opening preserves text. Browser tests do not exercise a real phone camera or upload service.
- [Read-only database verification](evidence/verification.json): 47 public tables, all RLS, 109 security-definer functions checked against explicit allowlists, no unexpected table/column privileges. Catalog remains 25 products, 83 places, 189 links. All 33 new readiness flags disabled.

Reproduce with local PostgreSQL only using the existing tests/support/local-postgres.cjs fixture. Required modules are pg, PGlite and Playwright. Set NUGGETFINDER_LOCAL_PG_URL to loopback, NUGGETFINDER_PG and NUGGETFINDER_PGLITE to installed modules, and NUGGETFINDER_TEST_REST=1, then run `node --test tests/*.cjs`. Run Python 3.13 in an isolated environment with services/photo/requirements.txt and `python -m unittest discover -s tests/photo -v`. Browser runner: tests/browser/local-database.cjs, using the environment described in the correction packet and a fresh NUGGETFINDER_CAPTURE_DIR.

## Visual review, needs design review

New screens have no supplied mockup. They use Archivo Black, cream/yellow/pink, hard shadows and a Court-style exhibit sticker. No production photos, claims or children appear in fixtures.

| Screen | Mobile | Desktop |
|---|---|---|
| Evidence entry | [390px](../screenshots/participation-photo/photo/390.png) | [1280px](../screenshots/participation-photo/photo/1280.png) |
| Prepared image preview | [390px](../screenshots/participation-photo/photo-preview/390.png) | [1280px](../screenshots/participation-photo/photo-preview/1280.png) |
| Redaction and private draft controls | [390px](../screenshots/participation-photo/photo-details/390.png) | [1280px](../screenshots/participation-photo/photo-details/1280.png) |
| Family participation controls | [390px](../screenshots/participation-photo/participation/390.png) | [1280px](../screenshots/participation-photo/participation/1280.png) |

Other refreshed foundation screenshots are in the same screenshot directory. Internal scrolling is captured at explicit positions; these are normal viewports, not a resized/stitched pretend mobile layout.

Review observations: the editor keeps NuggetFinder's personality and uses explicit privacy words. Percentage-based rectangles work with keyboards but are less intuitive than drag handles on phones; add accessible drag/resize before the pilot. Development hold messaging is intentionally prominent and should be replaced by actual server capability state once adapters exist. Family controls show an empty state because no participant is provisioned without verification. More playful illustrated avatars, language-safe response choices and private competition screens remain implementation work, not polished shipped features.

## Not proven or complete

No real child/parent consent, trusted session broker, participant contribution cutover, private competitions, age-safe social filtering, real uploads, Storage authorization, human photo queue, public serving, cleanup worker, complete account deletion, image-byte export, production backup/restore, actual phones or live sign-in were tested. Current third-party fonts/scripts/maps need child privacy review. No claim of legal compliance or public readiness. See PLAN.md for the exact implementation order, acceptance conditions, costs and founder/counsel decisions.

Existing security corrections and Court rules remain unchanged. The VS navigation direction remains. All production SQL, merges, deployments, settings and participation changes remain held. No paid service, provider account or LLM call was introduced. Existing GitHub access is retained as requested.
