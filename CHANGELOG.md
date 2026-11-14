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
