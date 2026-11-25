# Nuggetfinder addendum: what we decided after the brief

**2026-11-25 scope revision:** [FOUNDER_DIRECTIVE.md](FOUNDER_DIRECTIVE.md) supersedes earlier age exclusion and deferred photography. All-age capability-based participation and food/product photos are Day Zero launch requirements. Video stays deferred. See [implementation, privacy and release gates](participation-photo/PLAN.md). All live changes remain held.

Read README.md and docs/CODEX_BRIEF.md first. Where this file disagrees with the brief, this file wins. Same ground rules apply: no build step, new timestamped migrations only, show SQL before applying it, no secrets in the repo, RLS on every table, no em dashes.

## Part A. Build order (replaces the brief's order)

Do one step at a time. After each: screenshots at 390px and 1280px, no console errors, no horizontal scroll, and a note on what you could not test.

0. Refactor into files plus a hash router (index, #/spot/<id>, #/feed, #/showdown, #/me). No visible change.
1. Products. Data model for products, not just places. Propose the schema and show me the SQL first. Sketch: products (brand, name, kind = nuggets|tenders|sauce|side, size, upc, allergens, source, created_by), place_products (place_id, product_id, status, last_seen_at) with the same two-person agreement rule as place status. Brands table with verified owner accounts later.
2. Places import and adding places.
   - A CSV importer (data/places_template.csv is the format) that loads into a places table in our own database, so we stop depending on live map queries. Keep source and discovered_by columns. Do not scrape Google, Yelp or any site that forbids it.
   - Anyone can drop a pin with name and category. It goes to a review queue and checks for duplicates first.
   - Owner claim flow: email at the business's own domain, or a code to the listed phone, or a postcard, reviewed by me. A claimed spot gets the Verified badge and can post menu, prices and stock. Owners can respond to takes. Owners can never delete takes.
3. Suggest an edit (hours, menu, allergens). Goes to review, never straight to live. Allergens: "contains" shows right away as a red caution. "Free" stays dashed with a question mark until a store or moderator confirms.
4. Moderation queue and tools (see the brief, step 3). Add: moderator-only page, rename or reset a username, strike appeals, and a rule that a business cannot remove user content.
5. Price ledger on products and places. Append only, masked handles, Verified badge, older entries SUPERSEDED.
6. Takes feed. Text and photo takes first, video later.
   - Grid page of thumbnails plus a full-screen swipe feed, same data.
   - Tabs: Hot (votes weighted toward fresh), Recent, Nearby, Following.
   - Every take attaches to a spot, a product or a Showdown matchup.
   - A Respond button offers: I'm with them, I'm against, or a short reply.
   - Profile page: my votes, my record in feuds, points and status.
   - Points only vest after two or three other people confirm. Reward actions, never positive sentiment.
7. Showdown matchups (text), including creator challenges that deep-link into a matchup so a creator can send followers straight to it.
8. Sponsored system.
   - Tables for advertisers, campaigns and placements. Cobalt SPONSORED sticker plus "Paid by <brand>" on every paid item. Cobalt is used for nothing else.
   - Placements: highlighted map spot, brand-issued Showdown challenge, "where to buy" listing, sponsored take in the feed. Feed schedule is fixed at 1 sponsored item in 8.
   - Sponsored items never change ratings, votes or status, never carry organic vote counts, and are never styled as a normal user.
   - A creator's paid post gets the Sponsored label and a built-in disclosure automatically.
9. Creator program: verified Critic badge, creator profile with links, challenge links. Paid creator content always labeled.
10. Sharing and search. Share links with preview cards for takes, spots and Showdown results. Individual spot pages that Google can read. GitHub Pages is static, so propose options (a scheduled GitHub Action that generates static pages from the database, or Cloudflare Pages or Netlify with edge functions) with cost and effort, and let me choose.
11. Recall alerts for frozen chicken products from public federal feeds, shown on affected products and optionally pushed to people who opted in. Research first (Part C).
12. Business and brand dashboards (aggregates only). Do not build until I confirm a lawyer has reviewed it.
    - Aggregate by neighborhood only, with a minimum group size of 10 reports. Hide any number built on fewer.
    - Never export per-user data. Never sell or share user-level data.
    - Metrics: stock by area, price over time, matchup results, out-of-stock heatmap.
13. Account basics and legal pages: delete my account in-app, export my data, age-appropriate, server-enforced participation and applicable verified parental consent, report and block everywhere, terms, privacy policy naming AI moderation providers, DMCA contact, copyright and trademark complaint form.
14. Later: video takes (hosting, speech-to-text captions, LLM triage, human review, cost caps), Nugget Card punchcards, push notifications, retention loop (weekly Showdown results), native iOS app.

## Part B. Research and infill for Mat (human work, in this order)

1. Pick one launch neighborhood or zone. Density in one place beats a thin map of three cities.
2. Fill data/places_template.csv. Aim for 150 places in the launch zone. Types worth finding: chain fast food, grocery and frozen aisles, warehouse stores, corner stores and gas stations, Asian and other specialty markets, dive bars and bar food, odd hole-in-the-wall spots. Use your own visits, the map data, and public sources. Do not copy text, photos or ratings from Google or Yelp, and do not scrape them.
3. Product sheet: brand, product, kind, size, barcode number, allergens as printed, whether it says gluten free. Photograph the packaging yourself for allergen text. Open Food Facts is an open database that can seed this. Check its license and attribution rules first (Codex task below).
4. Take 10 shelf photos with price and date at 5 stores for the first price entries.
5. Creators: list 10 local SF food creators with handle, platform, email. Prefer small and enthusiastic over famous.
6. Brands: list 20 nugget, tender and sauce brands with a marketing contact each.
7. Starter Showdown matchups: write 20 (Cane's sauce vs Chick-fil-A sauce, and so on) so day one has something to vote on.
8. Business and legal: decide the entity (LLC), find a lawyer for terms, privacy and the data product, run a trademark search on "Nuggetfinder", buy the domain, set up a business email for sign-in mail and DMCA notices.

## Part C. Research tasks for Codex (no code changes)

Write each result to docs/research/<topic>.md. Cite every source with URL and access date. State confidence and anything uncertain. Do not give legal conclusions, only what the sources say, and list questions for a lawyer.

1. Map data: fair-use limits for the Overpass API and OpenStreetMap tiles, attribution wording we must show, and when we must stop calling them live. Recommend moving to our own places table.
2. Open Food Facts: API terms, license (including share-alike) and what attribution we must show if we use it.
3. Recall feeds: find the official public FDA and USDA recall feeds or APIs, update frequency, fields available, and how to match a recall to a product.
4. Supabase limits on the free and paid plans: database size, storage, bandwidth, auth emails per hour, row limits. Recommend a custom email sender and compare two options with prices.
5. Video: compare hosting and encoding options (Cloudflare Stream, Mux, others) with prices at 1,000, 10,000 and 100,000 monthly views, plus speech-to-text and LLM moderation costs per minute of video.
6. Child safety: how to register for NCMEC reporting, which hash-matching services small platforms use and what they cost, and Apple's App Store rules for user-generated content (including guidelines 1.2 and 4.8).
7. FTC: summarize the current Endorsement Guides, the fake reviews rule, and what a platform and a creator must each disclose. Quote the rule text.
8. California privacy: when do we cross the CCPA applicability thresholds, what counts as deidentified or aggregate data, and what must a privacy policy say if we ever sell aggregates.
9. Payments and billing for brand customers: compare Stripe invoicing and subscriptions, with fees.
10. Static-site SEO and share previews: compare the options named in Part A step 10 on cost, setup time and limits.
