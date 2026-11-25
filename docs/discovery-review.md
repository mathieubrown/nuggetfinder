# Discovery feature review

The new review branches add four connected flows.

- My discoveries keeps private Want to Try and Tried It lists for products, catalog places, Showdowns, published court cases and trails.
- Nugget Court accepts a proper food name and an argument, routes them to moderation, then runs a seven-day vote. The proposed threshold is 20 distinct people and a 60% winner. Food names remain intact. A concluded Nugget or Nugget-adjacent decision enters the public Field Guide. Votes and trail stamps do not earn stock-confirmation points.
- Taste profiles show approved takes and public subject links. Following uses the existing Following feed. Private saved lists are excluded.
- Trails are user-curated collections of 1 to 20 real catalog places. New trails and edits go to review. Private visit stamps survive a reorder of retained stops. Removing a stop also removes the stamps for that stop.

The new migrations are numbered 20261124000100 through 20261124000400 and remain unapplied. They depend on the previously reviewed username and Showdown rename migrations in PR #21. The application branches depend on the Main screen review in PR #22. Review and merge the stack in order after the SQL review.

## Local testing

Run JavaScript and local database tests with Node. Install @electric-sql/pglite in a separate local tools directory and set NUGGETFINDER_PGLITE to that installed package path. Then run:

```sh
NUGGETFINDER_PGLITE=/absolute/path/to/@electric-sql/pglite node --test tests/*.cjs
```

The database tests create an in-memory PostgreSQL instance with a simulated Auth schema, apply every migration, and exercise moderator and member entry points. They cover blocked accounts, review visibility, votes, private data, edits, exports and role grants.

Browser screenshots are under docs/screenshots/discovery-lists, court-home, nugget-court, court-nomination, field-guide, taste-profiles, find-tastes, discovery-trails, trail-builder and trails-home. They use a simulated sign-in session and local content fixtures with real catalog place IDs. Each directory contains 390px and 1280px images.

## Pending dependencies

Photo nominations and shelf-photo evidence need the private upload, metadata stripping and moderation workflow before publication. Store-owner claims, brand inventory tools and live stock integrations are separate pending work. The six original screen fidelity passes, ratings, rebuttal schema and price ledger are implemented in PRs #27 through #32, with SQL still unapplied. Account deletion remains part of the wider build.
