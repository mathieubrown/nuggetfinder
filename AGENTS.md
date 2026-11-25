# Nuggetfinder master instructions (read this first, every session)

## Who you are working for
Mat Brown. He is not a developer. Explain things in plain words, like to a smart friend who has never coded. Say what you are about to do, do it, then say what happened and what is next. No jargon without a one-line explanation. Do not use em dashes in anything you write, in chat or in the app.

## Current governing scope

Read [docs/FOUNDER_DIRECTIVE.md](docs/FOUNDER_DIRECTIVE.md) before older roadmap steps. Mat approved all-age capability-based participation and Day Zero food/product photography on 2026-11-25. It supersedes blanket age exclusion and deferred photos; video remains deferred. Work across authorized development items without stopping between them. Production SQL, merges, deployments, settings and live participation remain on hold. [Implementation plan and gates](docs/participation-photo/PLAN.md) distinguishes completed foundation from pending work. Do not remove legacy guards or enable child accounts before the reviewed participant cutover.

## What this is
Nuggetfinder is a crowdsourced map and community for nuggets, tenders, sauces and sides in San Francisco, South San Francisco and Daly City. Anyone can browse. Signing in unlocks reporting, takes, votes and the fun stuff. Later: brands and stores pay to be part of it, and aggregated trends become a data product.

Live site: https://mathieubrown.github.io/nuggetfinder
GitHub: mathieubrown/nuggetfinder (public, Pages from main, root)
Supabase project ref: jytfarejfcqexxbtnlqu, URL https://jytfarejfcqexxbtnlqu.supabase.co
The publishable key inside index.html is public by design. Nothing else secret may ever be in the repo.

## Where everything is
- AGENTS.md (this file): how to work.
- README.md: how to run and publish.
- docs/CODEX_BRIEF.md: ground rules, design system, trust rules, moderation principles.
- docs/FULL_VISION.md: the whole product, the sparkle system, every screen and the five build waves. Read this right after this file. It overrides any older advice to build smaller or to park features.
- docs/CODEX_ADDENDUM.md: the build order (Part A), Mat's research and data tasks (Part B), your research tasks (Part C). Where it disagrees with the brief, the addendum wins.
- design/*.dc.html: mockups (Main, Spot, Showdown, Take, Prices, Badges). Plain HTML with inline styles. Read them as markup.
- supabase/migrations/: database history. Add new timestamped files only. Never edit one that has been applied.
- data/places_template.csv: format for importing places.
- Mat's source material (notes, images, early files): /Users/TESSERACT/Desktop/NUGGETFINDER_NOV. Read it for context and ideas. Ask before opening anything outside that folder. Never copy anything from it into the repo without checking it for passwords, keys or private info first, and never upload the folder as is.

## Historical status when this file was first written

This subsection is historical, not the current build inventory. Use the changelog and current review reports.
- Applied in Supabase: 20261112000000_reports_and_accounts.sql (accounts, reports, two-person agreement).
- Written, probably applied, VERIFY before relying on it: 20261113000000_usernames.sql.
- Live in the app: map and list with real chain and grocery spots, filters, spot detail, reporting, email sign-in, username picker.
- Not built: everything from Part A steps 0 onward in docs/CODEX_ADDENDUM.md.

## How to work
1. Follow the current authorized scope and governing directive. Continue across authorized development items; report genuine blockers and keep production held.
2. After each step: view the page at 390px and 1280px wide, check for console errors and sideways scrolling, and tell Mat plainly what you could not test.
3. Before running any SQL on the live database, show Mat the SQL and explain what it does in plain words, and wait for a yes. Reads are fine. Anything that changes or deletes data or rules needs a yes.
4. Commit in small steps with clear messages. Do not push to main without telling Mat what is in it.
5. If a request is unclear or could go two ways, ask one short question rather than guessing.
6. If something goes wrong, say so right away and plainly. Do not hide it or quietly work around it.

## Asking for access (do this, do not guess)
Before you need an account, key or folder, ask Mat in one message: what you need, why, and the smallest permission that works. Then wait. Use the table as a starting point.

| Need | Why | Smallest safe way to give it |
|---|---|---|
| GitHub write access | push code, turn on Pages, run Actions | `gh auth login` on his machine, or a fine-grained token limited to the nuggetfinder repo |
| Supabase CLI | apply migrations, check tables | access token from supabase.com/dashboard/account/tokens, set as SUPABASE_ACCESS_TOKEN |
| Database password | direct database commands | set as SUPABASE_DB_PASSWORD in his shell, never in a file |
| Supabase service_role key | admin jobs only if truly needed | avoid it. If unavoidable, ask first, use it from an environment variable, never in the browser or repo |
| Email sender (sign-in mail) | the built-in sender has a low limit | a new account Mat creates, with a sending-only key as an environment variable |
| Hosting for share previews | step 10 | only after Mat picks an option and approves cost |
| Any paid service | anything with a bill | explicit written yes from Mat first, with the price |

Secrets only ever live in environment variables. Never paste them into the repo, a doc, a commit, a log, a screenshot or this chat. Prefer tokens that can be revoked. When a task is finished, tell Mat which tokens he can delete.

## Hard rules (never break these)
- No build step, no framework: plain HTML, CSS and JS, Leaflet, supabase-js from a CDN.
- Row level security on every table. The browser writes only through security-definer functions that check sign-in, ban status and rate limits.
- Never store location history. A yes/no "was nearby" is the most we keep.
- Two different people must agree before a place status flips. Keep the 2-hour, 24-hour, cooldown and daily limits.
- AI may hide content, never ban a person. Humans decide bans. No guessing age from faces. Delete transcripts after review.
- Businesses may respond to takes but never delete them.
- Sponsored content is always labeled (cobalt #2446C9 plus "Paid by <brand>"), never changes ratings or votes, and is never styled like a normal user.
- Reward actions, never sentiment. No fake reviews, no accounts pretending to be people.
- Never sell or share user-level data. Aggregates only, neighborhood level, minimum 10 reports per number. Do not build the data product until Mat confirms a lawyer reviewed it.
- Never scrape Google, Yelp or any site whose terms forbid it. Do not copy their text, photos or ratings.
- Status is always word plus icon plus color, never color alone. Touch targets 44px or more.
- Do not give legal conclusions. Report what sources say, cite them, and list questions for a lawyer.

## Done means
Works at 390px and 1280px, no console errors, no sideways scroll, checked against the matching mockup and the hard rules above, committed, and explained to Mat in plain words with what is still untested.

## First thing to do in a new session
Read this file, then docs/CODEX_ADDENDUM.md. Tell Mat in three sentences where things stand and what the next step is. Then ask for any access that step needs.
