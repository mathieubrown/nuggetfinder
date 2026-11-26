# Complete current build review

This is a review environment for the whole current code candidate, stacked on PR #38. It opens the original NuggetFinder app, rather than only the private crew screen. It does not declare the product finished or authorize production changes.

## Try it

On the development Mac, open http://127.0.0.1:4175/ . The collapsed yellow **Review build** menu at the top links every implemented screen. **What works & what is unfinished** opens the inventory. The app starts at the original map.

Original map, product, feed, composer, Showdown, Court, price, profile, sticker, list, Field Guide, trail, taste, weekly, account and legal screens run against the isolated real PostgreSQL database. Switch between Player A and Player B to test independent reports and votes. Switch to Moderator to approve text and inspect Court review. The main app uses the legacy compatibility path with those synthetic accounts; it does not bypass converted-account restrictions.

The same menu opens new family controls, food evidence, private crews, protected public takes and photo moderation. In parent controls choose **Play as this participant** to enter a family player's private session. Those identities remain separate from the compatibility accounts. The new pipeline supports private upload, server re-encoding, human review, revision and removal; synthetic consent receipts are test fixtures only.

Two clearly labeled sample takes and a private crew are created for review. No stock or price reports are seeded. Real products and stores come from the catalog snapshot; location/product leads are not assertions of availability. All contributions stay in a disposable database. Stopping the review removes that database and private review files. Production Supabase is never contacted. Browser assets and fonts are local. Map tiles are requested server-side from OpenStreetMap; if unavailable, the map clearly labels unavailable imagery while retaining real catalog pins and credit.

## Boundaries visible in the app

- The original UI and the new private UI are now reachable in one review environment, but they are not a finished production identity cutover. Family players must use the private surface. This is specifically exposed in the inventory, not hidden behind a success claim.
- The original composer prepares images but does not upload them. The working food-photo upload/review flow is on the private surface. Integration across the original screens remains required.
- Actual consent verification, legal approval, hosting/durable jobs, staffed moderation, actual iOS/Android testing, production restore and catalog verification remain release gates. No real email delivery is simulated.
- Later roadmap items, including video, paid promotions and recall alerts, are not represented as implemented.

## Reproduce safely

Use the existing isolated setup described in `services/participation/README.md`. Set `NUGGETFINDER_REVIEW_ONLY=1`, a loopback-only `NUGGETFINDER_LOCAL_PG_URL`, `NUGGETFINDER_PG` pointing to the pg module, and `NUGGETFINDER_BROWSER_ASSETS` pointing to a directory with `leaflet.js`, `leaflet.css`, `markercluster.js`. Have the `nuggetfinder-photo:review` image available. Run `node scripts/review-server.cjs`. Default port is 4175; `PORT` may select another loopback port.

Never expose this server through a public tunnel, LAN binding or production host. Synthetic local role selection is deliberately not real authentication. The server binds only 127.0.0.1, validates Host and Origin, permits only fixed fixture identities, checks actual browser RPC grants and runs table/RPC access under anon/authenticated RLS. It refuses private paths and broker/verifier helpers. The production frontend and broker security settings were not changed.

## Validation

- 69 Node tests plus six Python image tests pass with zero skips. The new transport test checks cross-origin denial, role restrictions, private-file/internal-function denial, permitted profile columns and that one stock report earns no confirmed-action points.
- Browser review checks run at 390px and 1280px. Both use the same real server and disposable database, check console errors, horizontal overflow and reduced motion, and exercise independent stock quorum, family controls, private crews, photos and moderation. The browser makes no requests outside the review origin. Deterministic map tile fixtures are labeled in screenshots; live tile availability is not certified by those screenshots.
- Screenshots are in `docs/screenshots/complete-preview/`; test output is beside this file. Source hashes are recorded in `source-manifest.json`.
- Initial runs exposed two test-harness assumptions: the restore command relied on the container's default database username, and Chromium's single-process mode did not survive closing then reopening a context. The restore test now uses the explicit URL username; browser checks launch a fresh browser per viewport. Final reruns pass.
- No migrations were added or edited. No SQL, settings, merges or deployments ran against production. Existing untracked machine files were left untouched.
