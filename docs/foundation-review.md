# Six-screen foundation review

The supplied six PNG references are preserved in design/reference. The six screens share one responsive web app, with layouts checked at 390px and 1280px. This is not a native phone app.

Review the existing discovery stack first, then these pull requests in order:

| Screen | Pull request | Added behavior |
| --- | --- | --- |
| Main | https://github.com/mathieubrown/nuggetfinder/pull/27 | Map overlays, labeled pins, reporting entry points and shared navigation |
| Spot | https://github.com/mathieubrown/nuggetfinder/pull/28 | Private ratings, scores after three raters, linked Showdowns and approved takes |
| Showdown | https://github.com/mathieubrown/nuggetfinder/pull/29 | Actual vote blocks, team labels, stamps and moderated rebuttals |
| Take | https://github.com/mathieubrown/nuggetfinder/pull/30 | Text composer, stamps, account tags, place attachment and parent context |
| Badges | https://github.com/mathieubrown/nuggetfinder/pull/31 | Shared source, allergen and paid-placement components |
| Prices | https://github.com/mathieubrown/nuggetfinder/pull/32 | Append-only price history, comparable units, source verification and product links |

The final Prices branch includes refreshed screenshots for all six screens after font loading and shared navigation refinements. Each docs/screenshots/foundation-* directory has 390.png, 1280.png and comparison-390.png. Comparisons show the supplied reference on the left and the implemented screen on the right. Illustrative people, scores and prices from the reference are not seeded into the app.

## New SQL, unapplied

1. 20261124000500_place_scores.sql adds private place ratings and curated place-to-Showdown links.
2. 20261124000600_take_stamps_and_rebuttals.sql adds moderated take context, stamps and visible threads. The Prices PR also includes its final tagged-account ID field so links use account IDs rather than handles.
3. 20261124000700_price_ledger.sql adds price history and empty curator-only source tables for business verification and allergen evidence.

These follow the earlier pending username, Showdown naming and discovery migrations. No migration from this review stack was applied live. The complete SQL is included in the relevant PR descriptions. Review the entire stack before deployment; deploying the frontend without its matching migrations would leave its new functions unavailable.

## What was checked

18 automated tests passed, including migrations applied from scratch to local PostgreSQL through PGlite. Tests exercise role permissions, moderation visibility, blocks, private exports, rating thresholds, parent threads, actual vote labels, source-derived verification, revoked verification, price history and one-report stock counts. All JavaScript files passed syntax checks.

Playwright checked all six screens at 390px and 1280px with reduced motion enabled, no console errors and no sideways scroll. Composer and price submission controls were checked using simulated RPC responses. Screenshots use a local test session and the real catalog targets, with empty contribution counts. Map tiles are fetched from OpenStreetMap with a transparent fallback if unavailable. Fonts load before screenshots.

## What is pending

Live sign-in, email delivery, live submissions and the Supabase-hosted execution environment were not tested for these unapplied migrations. Local tests simulate Auth roles; production deployment remains held for SQL review.

Record, Upload and Add photo clearly explain their upcoming workflows. They do not upload media. Private photo storage, metadata removal, moderation and store-owner claims remain pending. Verification can currently be curated only through SQL after review. No business verification, allergen claim, sponsorship, price report or user contribution was seeded.

Store inventory integrations, alerts, a native mobile app and account deletion remain wider work. No paid service or LLM call was made. GitHub access remains in place as requested.
