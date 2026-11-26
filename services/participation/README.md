# Private participation service

Development candidate only. Read [the release report](../../docs/participation-runtime/README.md) first. The frontend remains plain HTML/CSS/JS. Node dependencies belong to this separate server/test service.

## Isolated reproduction

Use Node 22+, Docker Desktop, Python 3.13 with `services/photo/requirements.txt`, and a dedicated loopback PostgreSQL container. Never use production credentials or a production database URL. The fixture rejects non-loopback PostgreSQL and creates/drops random test databases.

1. Run `npm ci` in this directory and install the Playwright Chromium browser with this package's Playwright CLI.
2. From the repository root, build `docker build -t nuggetfinder-photo:review services/photo`. The image decoder runs as a non-root user. Docker must also have these isolated-test images: `public.ecr.aws/supabase/postgres:17.6.1.171`, `public.ecr.aws/supabase/postgrest:v16.3`, `public.ecr.aws/supabase/storage-api:v1.98.6`, `public.ecr.aws/supabase/gotrue:v2.198.0`.
3. Start your dedicated PostgreSQL container with a loopback-only port and a local development authentication configuration. Set `NUGGETFINDER_LOCAL_PG_URL` and `NUGGETFINDER_LOCAL_PG_CONTAINER` to that container. Set `NUGGETFINDER_PYTHON` to the isolated Python interpreter. No production secrets are needed.
4. Run `sh scripts/test-participation-runtime.sh` from the repository root. A missing dependency or unavailable image fails the run; it does not skip integration tests. `PLAYWRIGHT_BROWSERS_PATH` may point to an existing browser cache.
5. To reproduce the legacy browser compatibility check, run `node tests/browser/local-database.cjs` with the same PostgreSQL and Playwright variables, `NUGGETFINDER_BROWSER_ASSETS` pointing to a directory containing `leaflet.js`, `leaflet.css` and `markercluster.js`, and `NUGGETFINDER_CAPTURE_DIR` pointing to a review output folder.

`tests/support/participant-fixture.cjs` deliberately creates synthetic verified permissions in disposable databases. Never run that fixture as onboarding, against a live database, or as evidence of actual parental consent. Production provisioning is intentionally absent.

## Boundaries

`start.cjs` is a loopback-only preview with parent authentication unconfigured. It fails closed rather than allowing a fake development login. The browser integration test injects a synthetic verifier into its own ephemeral server; the real Auth adapter has separate GoTrue tests.

`server.cjs` is the HTTP factory. `runtime.cjs` supplies restricted database calls, real Auth/Storage adapters, private serving, export and erasure. The broker may use only the dedicated broker database role and needs a separate server-only Auth admin credential for actual account erasure. No privileged credential belongs in HTML, browser storage, logs or a repository file.

`image-worker.cjs` is the private worker launcher. Only that isolated launcher may access the Docker socket. The web broker uses `remoteProcessor` over a mode-0600 Unix socket with a separate in-memory secret. Decoder containers have no network, secrets or mounted volumes. `processor` runs a host subprocess only for local tests and is not a production sandbox.

`maintenance.cjs` is an explicit one-shot local cleanup/erasure rehearsal. It does not register a scheduler or expose an HTTP administration route. Production scheduling, durable retries, capacity, metrics, encrypted deletion-journal storage and alerts require release review and approval.
