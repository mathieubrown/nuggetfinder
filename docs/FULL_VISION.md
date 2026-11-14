# Nuggetfinder: the full vision and how to build all of it

This is the whole product, built in waves. It replaces any older advice to build a smaller version or to park features. Nothing here is "later, maybe." Every wave must feel finished and sparkly when it ships, and no wave ships looking like a plain data tool.

## One-line pitch
Find the nuggets, tenders and sauces near you, call out what you saw, start beef, collect the weird spots, and get rewarded for it.

## Three people it serves (all day one)
- **Shopper:** wants to know which store has the product, right now, without driving to four.
- **Diner turned mini-influencer:** wants a take, a profile with status, and a card worth posting.
- **Creator:** wants a link, a challenge to send followers, and a badge.
One shared object powers all three: a product or place, a dated report, a take, a feud.

## The sparkle system (applies to every screen)
The look stays the hybrid: street layer (Archivo Black, thick ink outlines, hard shadows, flat color) over a calm layer (Space Grotesk). Add delight on top:
- **Stamp physics.** Every status change slams in like a rubber stamp: scale down fast, small shake, ink splat. Words stay: CONFIRMED, NOPE, MIXED, UNCONFIRMED.
- **Sticker economy.** Points and badges are collectible stickers with a peel-and-slap animation. Unlock packs by confirmed actions, never by sentiment.
- **Rarity cards.** Every spot is a trading card. Rarity (Common, Rare, Legendary) reflects how obscure the spot is and how few people have found it. Rare and Legendary get a foil shimmer (CSS conic gradients).
- **Beef VS screen.** Matchups open with a fighting-game splash: two sides, big VS, vote meter that fills with a bounce.
- **Punchcard tear.** The Nugget Card has perforated edges and a satisfying tear and stamp when you earn a punch.
- **Confetti nuggets** for first discovery, streaks and milestones. Short, skippable.
- **Mascot** with moods (hungry, smug, shocked) for empty states, errors and toasts. Original character. Name is a placeholder. It must not resemble any existing brand or mascot, and the name must not collide with any real brand (Nuggs is a real brand, avoid it).
- **Sound** is optional, off by default, a small crunch pack.
- **Share cards** are 9:16, loud, one-glance, with a hard-shadow sticker of the result.
- **Accessibility is not optional:** respect prefers-reduced-motion (replace motion with a simple fade), status is always word plus icon plus color, 44px touch targets, captions on any video.

## App map (every screen)
Core: Onboarding with neutral 13+ age gate, Map and list, Spot (card), Product page with "where to buy", Search, Report flow (seen it, sold out, price, with product picker).
Social: Take composer, Feed grid, Swipe feed (full screen), Respond sheet, Beef home, Beef matchup (VS), Taste Test (swipe cards that feed Beef votes), Creator profile, Share card builder.
Collect: Profile (record, points, status, stickers), Field Guide (your discoveries with rarity), Nugget Card (punchcards, brand funded), Notifications and alerts.
Business: Add a spot, Claim a business, Suggest an edit, Price ledger, Sponsored units (cobalt), Brand dashboard (aggregate only), Recall alert.
Trust and admin: Moderator queue, Strikes and appeals, Settings, Privacy, Delete my account, Report and block.

## Build waves (each wave ends polished and shareable)
**Wave 1: It's alive.** Refactor and router, products and "where to buy", stock reports with dates, stamp animations, profile with points and status, first share card.
**Wave 2: Talk trash.** Moderation queue and strikes FIRST, then takes feed (text and photo), Respond, Beef matchups with the VS screen, creator challenges.
**Wave 3: Collect.** Add a spot, Field Guide with rarity cards and first-discoverer credit, Taste Test swipe, Nugget Card punchcards, sticker packs and badges.
**Wave 4: Business.** Claim flow, price ledger, sponsored system, brand dashboards (aggregate only), alerts, recall feeds, creator Critic badge.
**Wave 5: Video and app.** Video takes with captions, AI triage plus human review, push notifications, the native iPhone app.

Launch gates, none of which are optional before strangers can post: moderation queue and strikes, report and block on everything, neutral 13+ gate, delete my account, terms and privacy pages, DMCA contact, a rule that sponsored content is labeled and never changes votes, and nothing about allergens shown as confirmed without a source.

## How to work
- Follow AGENTS.md and docs/CODEX_BRIEF.md rules. docs/CODEX_ADDENDUM.md has the detailed steps and research tasks.
- Build one wave at a time, one screen at a time inside a wave. After each screen: screenshots at 390px and 1280px, no console errors, no horizontal scroll, motion tested with reduced motion on.
- For each new screen, ask Mat for a mockup first if none exists in design/. Do not invent the look from scratch.
- Data pass (places, products) runs in parallel and feeds the waves. It must never block a screen. Use hand-picked seed data per screen first, bulk imports later.
- Show SQL before applying it to the live project. Moderation and trust code gets extra review.
