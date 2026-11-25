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

## Shopper data

- Added a grocery snapshot and ten product records with official source URLs. Store brands link to their own chain. National-brand links are places to check.
- The extract had no matching Walmart in the area. No stock or allergen claims were added.
- Local PostgreSQL also checked first-take visibility, reaction totals, reply review, own-data export, block filtering, Beef votes, weekly history and store-brand links.

## Migration review changes

- Public profile queries can read only the ID, handle, handle setup flag and creation date. The browser uses only those columns.
- Take and username checks share whole-word and phrase matching, with common character swaps. The public source list is stored outside Git. The local import added 403 terms to each table.
- Authors cannot react to their own take. Grocery leads say “Might be here. Not confirmed.” Empty addresses are omitted.
- Local PostgreSQL checked matching, restricted profile reads and the own-take rejection. Browser previews checked the shopper copy at both sizes. Live deployment remains on hold.

- Researched Map data and tiles. The note lists official sources, open questions and what still needs verification.

- Researched Open Food Facts seed options. The note lists official sources, open questions and what still needs verification.

- Researched FDA and USDA recall feeds. The note lists official sources, open questions and what still needs verification.

- Researched Supabase quotas and custom sign-in email. The note lists official sources, open questions and what still needs verification.

- Researched Video hosting, transcription and moderation costs. The note lists official sources, open questions and what still needs verification.

- Researched Child safety and media launch. The note lists official sources, open questions and what still needs verification.

- Researched FTC endorsements and review rules. The note lists official sources, open questions and what still needs verification.

- Researched California privacy and aggregate data. The note lists official sources, open questions and what still needs verification.

- Researched Stripe billing for brand customers. The note lists official sources, open questions and what still needs verification.

- Researched Static SEO and share previews. The note lists official sources, open questions and what still needs verification.

## Main screen fidelity pass

- Rebuilt the mobile map overlay and bottom sheet from Main.dc.html. The four category chips toggle independently back to the complete list. The lower sheet uses live counts and dates.
- Navigation sits at the bottom on the mobile map. OpenStreetMap credit remains on the map. Desktop retains the map and list split.
- The original HTML is rendered for the review comparison because design/reference is absent. Reference artwork contains illustrative status counts. The app uses actual records.
- Playwright passed at 390px and 1280px with reduced motion enabled, category-toggle checks, no browser errors and no sideways scroll. The preview uses the real OSM snapshot with simulated map tiles and sign-in. Existing JavaScript tests also passed.

## Private discovery lists

- Added Want to Try and Tried It lists for products, catalog places and Showdowns. Tap a selected button again to remove the item. These lists belong to the signed-in account and do not affect stock or scores.
- Added lists to account export. Database writes check sign-in, age, bans and posting restrictions. The migration is for local testing and SQL review.
- Design review needed for the list screen and save buttons. They use the existing paper, ink, pink and hard-shadow components.

## Nugget Court and Field Guide

- Added moderated food nominations, three-way voting, case arguments and rebuttals, reviewed location suggestions, personal saves and portrait ruling cards. A food keeps its proper name alongside its community classification.
- Proposed voting rules for review: seven days, at least 20 distinct voters and a 60% winning answer. Changeable votes use the existing account checks and daily limits. No reward points are granted for voting.
- Field Guide shows concluded Nugget and Nugget-adjacent rulings. Locations can be proposed while voting is open. No availability or allergen claims come from a court vote.
- Photo nominations await the photo upload and moderation work. New text is reviewed before publication. Report and block controls cover nominations, arguments and location suggestions.
- New screens need design review. The migration remains unapplied and is included in the PR.
- Local PostgreSQL tests passed for voting boundaries, changeable votes, closed rounds, duplicate nominations, review visibility, location review, blocked accounts, hidden-case arguments and exports. Browser checks passed at 390px and 1280px for the court, nomination and Field Guide screens with reduced motion and no browser errors or horizontal overflow. Screenshots use local test content.

## Follow a taste

- Added public taste profiles containing approved takes and their real subject links. Private Want to Try and Tried It lists stay private.
- Reused Following and the existing follow graph. Added handle search, a follows directory and links from take authors. Blocking removes both follow directions and hides the profile.
- Added no popularity score, purchase inference or sentiment rewards. Needs design review. SQL remains for review and local testing.
- Local PostgreSQL and browser checks passed for taste profiles at both sizes. Tests cover mutual blocks, removal of follows on block, literal handle-prefix search, private lists and public approved takes.

## Discovery trails

- Added reviewed collections of up to 20 real places, with an ordered stop picker, editable trails, public author links and private visit stamps. Marking a stop never creates a stock report.
- Every new or edited trail waits for moderation. Review decisions are tied to the exact version so an older approval cannot publish a later edit. Reordering preserves progress for retained stops.
- Own trails, their stops and private progress are included in account export. Trail reports and blocking use the moderation and safety flow.
- Trails, the builder and progress stamps need design review. No trail, nomination or vote is seeded as a real user contribution.
- Connected save and take buttons to every database catalog place, including groceries. Lists reuse their loaded rows so a long list does not fetch the entire collection once per card.
- Local PostgreSQL tests cover review versions, private progress, retained stamps after reordering, reports, exports and grants. Playwright checked all new screens at 390px and 1280px with reduced motion, no console errors and no horizontal overflow. A 1080 × 1920 Court share-card download also passed.
- Test fixtures are local. Live sign-in, production submissions and photo publishing remain untested. The existing deployment hold still applies to these changes.

## Reference foundation: Main

- Added the six supplied PNG references to design/reference. Main now has the reference-style bottom navigation, create button, reporting call to action and word-plus-icon map pins. Product shopping stays available from the Near You sheet.
- All screens share the same mobile and desktop app. The local fallback no longer turns a single-device observation into a confirmed status when the shared reporting service is unavailable.
- Mobile reference comparisons retain the reference's illustrative data on the left. The built app on the right uses real catalog places and empty data where no reports exist.

## Reference foundation: Spot

- Built The Score, Active Showdown and Top Takes Here from the Spot reference. Scores stay hidden until three distinct people have rated the place. Empty places show their real zero counts.
- Added one rating per person per place, a ten-minute editing cooldown and a 20-place rolling daily cap. Private ratings are included in exports.
- The existing starter sauce matchup is linked only to the two real restaurant brands it compares. It shows no percentages until someone votes.
- New ratings SQL is for local tests and review only.

## Reference foundation: Showdown and take context

- Rebuilt the two percentage blocks, vote meter, Hot/New tabs, stamped text thumbnails, team badges, Rebut links and pink composer bar.
- Takes now support a chosen stamp, a tagged account, a real attached place and a parent take. Rebuttals remain moderated and are limited to four levels. Hiding or blocking an ancestor hides the thread.
- “Clowned” counts real against reactions. Rebuttal counts include visible child takes. Team labels come from the author's current matchup vote.
- Existing takes, replies and the deployed posting function remain supported. Own-data exports include the added take columns.

## Reference foundation: Take composer

- Replaced the plain form with the dark reference layout, stamped writing surface, subject picker, friend lookup, real place picker and a clear posting control.
- Rebuttal links load the actual parent and keep its subject. Stamps, tags and places save through the moderated posting function. Feed cards now use the same stamped and threaded take components.
- Record and Upload explain that video is coming soon. Add photo explains the pending photo workflow. No camera or media permission is requested for these text controls.

## Reference foundation: Prices and provenance

- Added the store price ledger with numeric pack price and quantity, comparable-unit sorting, Best Deal tags, masked handles and computed SUPERSEDED entries. Product and Spot links open their real ledger.
- Verified store entries take priority over crowd entries. Verification is derived server-side from a reviewed source record, not a browser parameter. Revoking verification removes that priority.
- Added empty, private source tables for store/brand verification and allergen evidence. Confirmed-free evidence requires a package/store/brand source URL. Contains takes priority when evidence conflicts. No allergen or advertising data is seeded.
- Price entries are append-only from the browser, rate-limited and included in account exports. New SQL remains unapplied for review.

## Reference foundation: Badges and final checks

- Added reusable verified-store, verified-brand, crowd, sourced-allergen and cobalt sponsored components. The badge guide labels its examples as styles. No advertiser or food claims are seeded.
- Refined Main's initial map area, the compact Spot heading and reference SVG navigation icons. Refreshed all six screenshot sets after fonts loaded; comparisons include the supplied original PNGs.
- The price ledger reuses stock status rules. Its local database test confirms one sighting remains a single, unconfirmed report. Rebuttal composition also supports an older subject outside the first page of choices.
- Final validation: 18 automated tests passed, every JavaScript file passed syntax checking, and all six screens passed Playwright at 390px and 1280px with reduced motion, no console errors and no sideways scrolling. Browser writes used simulated responses; database writes used local PostgreSQL through PGlite.
- Could not test live sign-in, email delivery, production submissions or hosted Supabase execution for the new SQL. All new migrations remain unapplied. Photo/video publication and owner claims remain pending and are clearly described in the UI and review notes.
