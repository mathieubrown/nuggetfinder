# Hardening review and deployment plan

2026-11-25: [All-age and photo release gates](participation-photo/PLAN.md) now apply in addition to these correction gates. Photos are Day Zero and all-age participation is the launch objective. This historical report does not certify the new requirements.

Current correction candidate: [corrections/REVIEW.md](corrections/REVIEW.md). That report supersedes the earlier Court, voting and price-priority behavior below. This document remains the baseline review record; it is not deployment approval.

Everything here is for review. No SQL was applied to live Supabase and no frontend was merged or deployed during this pass. The main branch checked at the start was 5752a75.

## Findings fixed

- Legacy grants could retain TRUNCATE on profiles, reports and the private username terms table. TRUNCATE does not use row security. The new migration explicitly revokes all direct privileges, then restores only the four public profile columns.
- Temporary moderation locks did not cover map and product stock reports. The shared reporting trigger now enforces the lock while preserving cooldowns, daily limits and two-person confirmation.
- Concurrent username changes could both pass the 30-day check. The function now locks the account before reading that check. Existing name filtering rules are unchanged.
- A lost response could make a take retry create another take. Takes and prices now use a random request ID, saved atomically with the result. Retrying the same draft returns its saved result. Reusing its ID with different content is rejected. Receipts are private and included in own-data exports. Existing entry points remain available for older clients.
- An active form keeps edits made while a submission is in progress. Double submission events are ignored until the current operation finishes.
- Added keyboard focus after route changes, useful page titles, a skip-to-content control, visible focus outlines, 44px controls and map zoom links, descriptive marker names and long-name wrapping. Reduced motion suppresses animations and transitions.

## New migration

20261124000800_release_hardening.sql is the only migration added in this pass. It changes permissions, report lock enforcement, username serialization and submission receipts. It contains no catalog, stock, price, allergen or business verification seed claims. Existing applied migrations were not edited.

## What passed

- 34 automated checks with no failures or skips when all local suites are enabled. These include native PostgreSQL 17 concurrency tests, real PostgREST with locally signed test JWTs, and the existing PGlite suite.
- Native tests deliberately start with broad inherited grants to reproduce older Supabase environments. They check all public tables for row security and private table grants, private exports, moderator access, bans, verification forgery, simultaneous daily limits, stock confirmation and receipts.
- An upgrade fixture begins with existing Wave 2 takes and votes before applying the pending stack. Those records remain readable through the new functions. Catalog totals are 25 products, 83 places and 189 links in the full local migration chain.
- Real PostgREST tests verify JWT role handling, protected profile columns, direct table denial, pending content, authenticated-only writes, replayed requests and rejected foreign export parameters.
- Browser checks passed at 390px and 1280px against the actual local PostgreSQL functions. They exercise take submission, a lost response after commit, safe retry, moderator approval, reactions, rebuttals, blocking, one-report UNCONFIRMED, two-person confirmation, price retry and vote cooldowns. They also check keyboard focus, touch-target height and a 180-character unbroken product name at 320px.
- Each of the six foundation screens has both screenshots in docs/screenshots/hardening/. These contain explicitly local test contributions. They are not production claims. Browser sessions and the transport adapter are simulated; the SQL functions and role checks are real. Separate PostgREST tests exercise the actual HTTP/JWT boundary. Tiles in the browser suite are transparent test fixtures; OpenStreetMap attribution remains visible. Fonts finish loading before screenshots.
- No browser console errors or horizontal overflow occurred. All browser checks used reduced motion. Every application JavaScript file passed syntax checking.

## Reproduce locally

Install pg, @electric-sql/pglite and playwright in a separate tools directory. Keep credentials and generated dependency folders out of this repository. Point these variables at those installed packages:

```
NUGGETFINDER_PG=/absolute/path/to/node_modules/pg
NUGGETFINDER_PGLITE=/absolute/path/to/node_modules/@electric-sql/pglite
NUGGETFINDER_PLAYWRIGHT=/absolute/path/to/node_modules/playwright
NUGGETFINDER_LOCAL_PG_URL=postgresql://postgres@127.0.0.1:LOCAL_PORT/postgres
```

Use a disposable local PostgreSQL server, not a forwarded production database. The harness requires a loopback hostname, creates its own randomly named database, then drops only that database. Its roles are the normal anon and authenticated test roles. Native Docker tests use a dedicated container, published on loopback, and remove it afterward. Never point the harness at shared development or production infrastructure.

```
node --test tests/*.cjs
```

Set NUGGETFINDER_TEST_REST=1 to enable the real REST suite. Docker must have public.ecr.aws/supabase/postgrest:v16.3 cached. The fixture generates a temporary signing secret in memory. It never uses a production token.

For screenshots and browser flows, set NUGGETFINDER_BROWSER_ASSETS to a local directory containing leaflet.js, leaflet.css and markercluster.js for the versions in index.html, and PLAYWRIGHT_BROWSERS_PATH to the installed browser location. Then run:

```
node tests/browser/local-database.cjs
```

Missing native database or REST settings cause those suites to report skipped checks. A release verification run must enable both, and must have zero skips.

## Ordered review stack

Review and merge PRs #21 through #33 in order. The new hardening PR is based on #32. Review the resulting combined frontend and SQL, not just each branch in isolation. The pending migration order is:

| Migration | Purpose |
| --- | --- |
| 20261115001000_handle_substrings.sql | Reviewed username protections |
| 20261115001100_showdown_names.sql | Showdown names and compatibility entry points |
| 20261124000100_personal_lists.sql | Private Want to Try and Tried It lists |
| 20261124000200_nugget_court.sql | Moderated Court, votes and location suggestions |
| 20261124000300_taste_profiles.sql | Taste profiles, follows and block visibility |
| 20261124000400_discovery_trails.sql | Reviewed trails and private progress |
| 20261124000500_place_scores.sql | Private ratings and scores after three people |
| 20261124000600_take_stamps_and_rebuttals.sql | Take context, stamps and moderated threads |
| 20261124000700_price_ledger.sql | Price history and empty source tables |
| 20261124000800_release_hardening.sql | Permissions, locks and retry protection |

Confirm live migration history and actual schema again before deciding what is pending. Do not rerun a migration solely because its CLI history is absent. Do not use an unrestricted db push on the live project.

## Deployment steps, after explicit SQL approval

1. Confirm the exact reviewed commit and migration file contents. Recheck live history using read-only queries. If history and schema disagree, resolve that before any write.
2. Obtain a private backup covering database data, schema and required roles, using credentials from the environment. Keep it outside git. Check its contents and rehearse restoration into an isolated local database. A backup is not verified until restoration succeeds. No live backup or restore was performed during this pass.
3. Keep GitHub Pages on its existing frontend while applying the approved database files, in timestamp order, one transaction per file. Stop on the first error. Do not repair history, change auth settings or apply unapproved SQL as a workaround.
4. Run scripts/verify-release.sql read only. Expected catalog totals are 25/83/189, unless separately reviewed catalog changes explain a difference. Every public table must have row security. Direct writes must be false for both browser roles. Only products, places and place_products have whole-table SELECT; profiles expose only id, handle, handle_set and created_at. Private tables have no policies. Public catalog read policies and the profile read policy are expected.
5. Compare function grants against the local verified output. Write functions and own-data exports are authenticated only. Moderator functions additionally check moderator status. Internal helpers, review synchronization triggers and export wrappers are not browser-callable. The old public read and write entry points intentionally remain for compatibility.
6. Check the older live frontend against the expanded schema. Then merge the reviewed stack and wait for GitHub Pages to finish. Smoke-test the new frontend at both widths, sign-in, a controlled report, a take review, a vote, exports and console errors. Use designated test accounts and clearly identified test content, with approval for any live writes.
7. If frontend deployment fails, restore the previous frontend commit using a new revert commit. Keep the added schema in place and fix forward. Do not drop new tables or erase reports. A database restore is a separate incident action requiring explicit approval because it could overwrite submissions received since the backup.

## Remaining launch gates and limits

Account deletion remains pending. Terms, privacy and DMCA details remain draft and need lawyer review. These are unresolved launch gates before opening posting to strangers. Photo/video publication and owner claims also remain pending. There is no paid service, LLM, advertiser seed or brand analytics in this pass.

Live sign-in, email delivery, live submissions, actual production upgrade data, hosted Supabase behavior, a backup restoration rehearsal and a physical iPhone/Android check were not tested. Keyboard checks do not replace a human screen-reader review. Slow and lost responses were simulated locally; there was no production load test. Receipt retention and operational cleanup need a documented retention policy before scale.

GitHub access stays in place as requested. No new account or production credential is needed for this review.
