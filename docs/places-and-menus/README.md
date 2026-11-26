# Places and menu evidence

Development candidate, stacked on PR #39. Production SQL, merges, settings and deployment remain held.

## Try the updated review

Open http://127.0.0.1:4175/ . Type in the map search and press **Go** or **Enter**. Try `Krispy Krunchy`, `3950 24th Street`, or `mcdonalds`. The first query finds three dated OSM candidates beyond the original approved chain catalog. The address returns the existing store. Punctuation no longer hides McDonald's.

Choose an existing result to open its place page. Choose **Use this place** on an OSM candidate to fill the submission map. For a missing business, **Add a place** lets you click a public business location on the map, fill its name/address and send it to review. The coordinate fields can be filled by the pin rather than typed. Additions are not published immediately. Hours and menu-link/address corrections use the same review flow.

In the review menu, switch to Moderator, then the private review desk to inspect location suggestions. Check the business/source before approval. Return to Player A/B, search again and open the approved place. It now uses one canonical ID on the map and report/menu pages, including independent restaurants outside the old chain list. Nothing is marked in stock by approval.

On a place page choose **View or upload a menu**. Crop/redact a JPEG, PNG or WebP menu image, attest that you took it and send it for human review. In production, contributors must connect an eligible scoped player with an existing one-time pairing code. The local review automatically connects its labeled synthetic family player. The submitting identity is shown explicitly. No fake consent is used outside disposable review fixtures. For a complete local photo-review demonstration only, `NUGGETFINDER_REVIEW_PUBLISH_PHOTOS=1` provisions synthetic disclosure permissions and enables serving approved test images in that disposable database. This does not change production or migration defaults. It is never an onboarding method for real users.

Photo review is separate from place review. Approval alone cannot override a closed publication gate or missing/revoked disclosure permission. Own pending previews remain private. Public menus have no contributor/guardian/age IDs and use day-level dates. Reports go to human review. Replace/correct withdraws the old revision and requires another review; deletion withdraws access immediately and queues physical erasure through the existing retry worker.

## Unapplied migration

`supabase/migrations/20261126000100_places_and_menus.sql` runs after all previously written migrations, including 20261125001900_release_entry.sql. It has one transaction and has not run on live Supabase.

- `place_search_cache`: private, short-lived trusted OSM source records. There is no user/query history column. Known IDs and coordinates cannot be invented or changed by the browser.
- `place_submissions`: private additions and corrections, with own contributor identity, request ID/fingerprint, review status, source date and base detail version. Ten submissions per rolling day; pending admissions stop at 100.
- `place_information`: approved category, reported hours and menu link, with review date and revision. It makes no availability, ownership or allergen claims.
- `place_submission_events`: private submission/review audit. Human review uses an expected version and checked-source acknowledgement; a moderator cannot approve their own managed player's submission. Rejection stays available after permission withdrawal. Stale corrections cannot overwrite a newer approved version.
- Public read-only search/detail functions expose only approved places and eligible menu photos. Submission/cache/review functions are broker-only. All four new tables have RLS, no browser table access or direct writes, and no PUBLIC function execution. Inherited grants are checked.
- Parent exports include their own player submissions. Deletion cascades the private contribution/audit links. The approved public business can remain without an identifiable contributor, like other canonical catalog data. Retention and legal review are still launch gates.

OSM candidates retain real OSM IDs. A genuinely missing, manually submitted business gets a stable `community/<submission UUID>` ID only after approval, with a community-reviewed source label. Exact source IDs and matching manual submissions are deduplicated. Nearby stores with distinct OSM IDs remain separate; reviewers see nearby-name warnings instead of an automatic merge. This is user-contributed catalog expansion, not an invented seed. Product/store links, stock reports, prices and allergens are not created automatically.

## Search and source limits

The 4,609 search candidates come from the existing BBBike PBF with a November 7, 2026 replication timestamp, verified from its header. They are not 4,609 newly approved stores. The JSON records its input hash, date, bounds and approximate way centers. See [attribution](../../data/ATTRIBUTION.md). Search is case/punctuation tolerant and covers names plus public street addresses. It is not a general home-address geocoder, and does not cover the entire world. The launch bounds remain the existing SF/Daly City/South City area.

Default search requires no external request, paid account, key or LLM. An optional configurable Overpass adapter performs explicit bounded food-business searches, not autocomplete. It serializes requests, caps them at 90/day and 8 MiB/day per instance, bounds response size and caches results. Live availability could not be verified reliably here; it is not required for local snapshot search or manual submission. Production multi-instance budgets, monitoring and any provider choice require review before activation. The public Nominatim endpoint was deliberately not adopted as a generic geocoder.

Policy sources checked November 25, 2026: [Overpass operator guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [OSM tile requirements](https://operations.osmfoundation.org/policies/tiles/), [Nominatim restrictions](https://operations.osmfoundation.org/policies/nominatim/). Confidence is high about the cited documented restrictions; ongoing availability and suitability for production remain unproven. Tile requests carry the application identity and origin-only Referer, preserve cache headers, revalidate expired tiles and have a seven-day fallback TTL. Only human-requested view tiles are fetched; browser tests use labeled fixtures. Private crew referrer protections remain unchanged.

## Evidence and limits

- `integrated-tests.tap`: 81 Node tests, no failures/skips. Includes RLS/function allowlists, source spoofing, duplicate/pending/retry behavior, source filtering, bounds, withdrawal, stale correction guards, own exports/deletion, snapshot searches, tile caching and existing trust/account/photo/restore tests.
- `image-tests.txt`: six passing image tests. No production credentials or real child data.
- `browser.txt`: 390px and 1280px with a deterministic OSM response, real local PostgreSQL/HTTP, sandboxed image processing and human-review interactions. Covers source-ID preservation, non-chain pin visibility, menu publication gates, safety reporting and correction withdrawal. No console errors, overflow or short controls; reduced motion checked.
- `complete-browser.txt`: existing full review journeys rerun. `private-browser.txt` also reruns the private participation interface. New and compatibility screenshots are under `docs/screenshots/places-and-menus/`.
- `verification.json`: fresh default schema still has 25 products, 83 approved places and 189 product leads. All 76 public tables have RLS; 162 security-definer functions checked. All 36 readiness gates and public-photo/cutover controls are off. Source candidates do not change those seed counts.
- `local-search-check.json`: actual local service checks against the real source snapshot, separately from the synthetic browser-provider fixture.

Needs design review: new search/add/edit/menu/reviewer screens. Actual iOS/Android camera/HEIC behavior, real sign-in/consent, production hosting/scheduling/backup restore, staffed moderation and business/menu accuracy remain unproven. Only image uploads are supported; PDFs can be linked through an HTTPS menu URL but are not uploaded or fetched by the server. Broader original/private identity cutover and photo attachment in the original take composer remain separate known gaps. No production migrations, settings, merges or deployments were performed.
