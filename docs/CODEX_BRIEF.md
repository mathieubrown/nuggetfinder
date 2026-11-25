# Nuggetfinder build brief (for Codex)

**2026-11-25 scope revision:** [FOUNDER_DIRECTIVE.md](FOUNDER_DIRECTIVE.md) supersedes earlier age exclusion and deferred photography. All-age capability-based participation and food/product photos are Day Zero launch requirements. Video stays deferred. See [implementation, privacy and release gates](participation-photo/PLAN.md). All live changes remain held.

Read README.md first. Product: a crowdsourced map of where nuggets, tenders, sauces and sides are in San Francisco, South San Francisco and Daly City. Anyone can browse. Signing in unlocks reporting and the fun stuff.

## Ground rules
- Static site on GitHub Pages. No build step, no framework. Plain HTML, CSS and JS, Leaflet for the map, supabase-js from a CDN.
- index.html is getting long. Split into index.html plus /css and /js files, and a hash router (#/, #/spot/<id>, #/showdown, #/prices). Do this refactor first, as its own commit, with no visible change.
- Database changes: new timestamped files in supabase/migrations/ only. Never edit an applied migration. Show me the SQL before applying anything to the live project.
- Never commit secrets. The publishable key in the page is fine. The DB password, service_role key and access tokens come from environment variables only.
- Row level security on every table. The browser writes only through security-definer functions that check sign-in, ban status and rate limits, like submit_report and set_handle.
- Never store location history. A yes/no "was nearby" flag is the most we keep.
- No em dashes in any copy.

## Design system
Hybrid of street and clinical. Paper #F5F0E6, ink #161514, green #0E5A46, red #C8321F, gold #F4B223, pink #FF4FA3. Cobalt #2446C9 is for SPONSORED and nothing else. Archivo Black for loud headings, Space Grotesk for everything else. Thick ink outlines, hard offset shadows, flat color. Status is always word + icon + color, never color alone. Touch targets 44px or more. Must work at 390px wide and on desktop.

The mockups are in design/*.dc.html. They are plain HTML with inline styles, so read them as markup and copy the spacing, type sizes and copy. Main = map and list (already built), Spot = spot detail, Showdown = sauce wars, Take = drop a take, Prices = store price ledger, Badges = sponsored, verified, allergen and ledger styles.

## Build order (one PR or commit group each, screenshot at 390px and 1280px after each)
1. Refactor into files and hash router.
2. Add a spot, and suggest an edit (hours, menu, allergens). Suggestions go to a review queue, they do not go live on their own. Allergens: "contains" shows right away as a red caution, "free" stays dashed with a question mark until a store or moderator confirms.
3. Moderation queue and tools: moderation_queue table (id, created_at, reporter_id, kind, content_ref, transcript, ai_label, ai_confidence, flagged_at, status, reviewed_by, reviewed_at), profiles.is_moderator, strike ladder (warning, 24h video lock, 7d lock, ban), a moderator page that only moderators can open, and a rename or reset username action.
4. Price ledger: append-only entries with time and masked handle, Verified badge for stores and brands, older entries marked SUPERSEDED. A verified store entry replaces what users see as current.
5. Showdown (text only first): pick a side, vote, short comments. Rate limits, report and block buttons on everything.
6. Account basics: delete my account in the app, export my data, a age-appropriate, server-enforced participation and applicable verified parental consent, report and block, privacy page that names the AI providers used for moderation.
7. Later, not yet: video takes (storage, speech-to-text, LLM triage, human review), Nugget Card punchcards, push notifications, native iOS app.

## Trust rules already in force
Two different people must agree before a status flips. One report shows UNCONFIRMED, a split shows MIXED. Reports count for 2 hours, show as stale until 24 hours. 10 minute cooldown per spot, 60 reports per day, ban switch. Do not weaken any of this.

## Moderation principles
AI can hide content, never ban a person. A human makes every ban. No guessing age from faces. Delete transcripts after review. Moderators see blurred, muted media by default.

## When you finish a step
Run the page at 390px and 1280px, check for console errors and horizontal scroll, and tell me what you could not test.
