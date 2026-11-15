# Wave 1

## Products and where to buy

- Search products by name, brand, category or store. A product page lists places to check.
- Added 15 starter products and the five existing sample map pins. The seed contains no stock reports or allergen claims.
- Needs design review: product search and product detail. The existing Spot mockup informed the place cards.
- The supplied snapshot did not include docs/FULL_VISION.md. New screens follow the palette, typography and outlines in CODEX_BRIEF.md and the supplied mockups.

## Stock reports

- Signed-in users can tap Seen it or Sold out. Cards show dated sightings and reports without identifying reporters.
- Two people must agree for a confirmed status. Reports count for two hours and remain visible as stale for up to 24 hours. Stock and map reports share the 10-minute cooldown per spot and 60-report rolling limit. Banned accounts cannot submit.
- Needs design review: stock reporting controls on the product page. The report buttons follow the Spot mockup.
- Ran automated stock classification tests. The live database migration is pending approval.

## Status stamps

- Status labels stamp into place when the displayed status changes. Reduced motion skips the animation.

## Profile and points

- My profile shows your username, points, level and sticker shelf. It explains how points and stickers are earned.
- A confirmed stock report can earn one point whether it says Seen it or Sold out. Points are capped at 10 awards per UTC day. Level thresholds are 1, 10 and 30.
- Needs design review: profile, levels and stickers.
- Ran automated tests for levels and stickers. Live awards and sign-in are pending database approval and a signed-in session.

## Share card

- Download a 1080 × 1920 PNG from any product and place card. It includes the Nuggetfinder logo, product, location and current status. The browser draws the image locally.
- Needs design review: portrait share card.

## Verification

- Ran both JavaScript tests and applied all migrations to a local PostgreSQL test database. Verified anonymous read access, private report rows, agreement by distinct users, cooldown shared with map reports, the 60-report limit, bans, two-hour and 24-hour expiration, and the daily points cap.
- Live Supabase migrations, live sign-in, and production data remain untested.
- Playwright captured each item at 390px and 1280px. All ten runs checked console errors and horizontal overflow. The stamp ran only with motion enabled. The downloaded PNG measured 1080 × 1920. Browser runs used a simulated Supabase session and stock responses.

## Wave 1 polish

- Product and profile screens use thicker Spot-style cards, hard shadows, status stamps and a mascot for empty states. Community discovery cards get a foil treatment. The starter spots have no verified rarity data.
- Sticker buttons replay their peel and slap. The product screen celebrates when it detects a signed-in account's first confirmed stock report. The celebration can be dismissed. Motion respects the device setting.
- Share cards wait for Archivo Black, show the site address and the signed-in username when available, and use the same status wording as the product page. Removed the sample pin label from both.
- Automated tests confirmed that one report draws UNCONFIRMED on the PNG and that drawing waits for the font. Playwright checked the product and profile at 390px and 1280px with simulated data. Live Supabase and real rarity data remain untested.

## Real store IDs

- Replaced invented starter pins with 31 locations from an OpenStreetMap snapshot. The catalog links 15 products to stores of the same brand.
- Product cards link to their map spot. The map includes the same snapshot even when its live location search fails. Both screens show the OpenStreetMap credit.
- Only the unapplied product seed migration changed. The live database remains pending review.

## Wave 2 moderation

- Added a private review desk, a four-step strike ladder, appeals, username resets, account blocks and content reports.
- Moderator access is granted through SQL. The browser cannot grant it. Future automated triage can fill the queue's AI fields server-side. A moderator makes every strike decision.
- This migration is for review and local testing. The live database was untouched.

## Account basics

- Added an export for your own account and report data, plus draft terms, privacy and copyright contact screens.
- Added reusable report and block controls. Account deletion is documented for a server function and awaits deployment and testing with a disposable account.

## Text takes

- Users can post up to 280 characters about a catalog place or product. Matchup support connects when Beef is added.
- Accounts need a moderator-approved take before later takes appear immediately. Blocked terms are managed in SQL and hits are hidden for review. Each account can send up to ten takes per rolling day.

## Takes feed

- Added a grid and a swipe view with Hot, Recent and Following. Follow buttons populate the Following tab. Blocked accounts are filtered in both directions.
- Hot gives fresh responses more weight when the Respond migration is present. Before that, it falls back to recent posts.

## Respond

- Added two changeable reactions and short replies. Replies go through moderator review before appearing.
- Both reactions count equally in Hot. Replies can be reported, and blocked authors are hidden.

## Beef matchups

- Seeded ten starter matchups. The matchup screen shows two sides, a vote meter and a link to post a take. Each account gets one vote and can switch sides.
- A signed-in member can copy a challenge link with their handle. Visitor links open the selected matchup.

## Take and Beef share cards

- Takes and matchup results have downloadable 9:16 images. They reuse the stock card's logo, type, outline and result stamp. Longer takes wrap across lines.

## Weekly Beef results

- Shows the previous completed UTC week and the last side each voter picked during that week. Later vote changes leave those weekly picks in history.
- Each result links to its matchup and has a share image. No scheduler or paid service is needed.
- Wave 2 screen previews use simulated sign-in and content. Local PostgreSQL applied all migrations and checked moderation roles and appeals. Live sign-in, deletion and production deployment are outside these reviews.
