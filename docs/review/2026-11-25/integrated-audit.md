# Integrated technical release audit: PRs #21–33

**Verdict: HOLD.** Review date November 25, 2026. This is a fresh adversarial review of the combined implementation by the same assistant, not an external penetration test or an independent human security signoff. No production changes, fixes, rules or migrations were made in this review.

## Exact scope

Baseline: 5752a7524a601134540a139857ad981e4e2d7cdb. Release candidate: d0174bb8228d12001938fb0fbaf2c0e488856cd9. GitHub metadata for all thirteen PRs was checked. All are open and unmerged; every PR's base is the preceding PR's head. The candidate contains the whole stack. See evidence/pr-manifest.json for immutable SHAs and links.

Read-only HTTP retrieval found deployed index.html, js/router.js and js/app.js byte-for-byte identical to the baseline. This verifies these assets, not every production asset or live database object. No live Supabase query was run.

## Reproduction

| Evidence | Result | What this proves / does not prove |
| --- | --- | --- |
| Existing full Node suite, native PostgreSQL, real PostgREST and PGlite enabled | **34 pass, 0 fail, 0 skipped** | The recorded tests reproduce. They are not complete coverage. Full TAP in evidence/baseline-tests.tap. |
| Full browser flow, 390px and 1280px | **Pass** | Real local SQL behind simulated browser Auth/transport; separate real HTTP/JWT REST tests. No console errors, no sideways overflow, reduced motion, keyboard/touch-height and 320px long-name checks. evidence/browser.txt and screens/. |
| Old deployed API calls against new local schema | **Pass for exercised calls** | Map report, stock report/read, old submit_take, feed, Beef vote/read, protected profile lookup and old exports. Not a complete old-frontend browser run. |
| Local synthetic pg_dump / pg_restore | **Pass: 35 tables, counts, logical row digests, table grants/RLS and sequence values match** | Archive creation/restoration and synthetic data preservation on one local PostgreSQL cluster. Not a backup or restoration of production, managed Auth, storage or infrastructure configuration. |
| New independent probes | **7 confirmed findings** | These are gaps outside the 34 existing checks, not seven new passing release requirements. See evidence/audit-probes.json and runnable source. |

Application JavaScript syntax checking passed. Browser screenshots use local test contributions. Test JWTs/signing secret were local and temporary. Production credentials were not needed. The local fixture refuses non-loopback database hosts; it must still only be pointed at a dedicated disposable server, never a tunnel to production.

## Release findings

P1 means fix or settle explicitly before deploying this candidate. P2 means important public-participation or correctness work. No claim is made that these are the only possible defects.

| ID | Priority | Reproduced behavior | Recommendation |
| --- | --- | --- | --- |
| A03 | P1, stock truth | A cached row with two seen votes and a three-hour-old report still returns `yes` from stockStatus. Prices only refetches on load/filter/write; server counts are correct when freshly queried. | Make displayed confidence expire safely and refresh, including error/offline behavior. Audit map/product/share caching too. Do not assert one row alone proves every screen fails; the confirmed price-page path is sufficient to block. |
| A07 | P1, compatibility | New router sends deployed `#/beef/<id>?from=<handle>` and `#/weekly` links to home. | Preserve route aliases and query parameters. Database compatibility aliases do not preserve frontend URLs. Add regression tests for old shared links before deploying. |
| A01 | P1 for participation | A temporarily locked member receives `posting_locked` from both set_user_block and report_content. | Separate safety actions from posting eligibility. Restrict unsafe posting while retaining report/block, own-data access and appeals. Decide banned-account safety behavior as well. |
| A02 | P1 for Court release | Closed 12/5/3 ruling changes from Nugget/20 to insufficient/19 after one voter is banned. | Approve an explicit post-close correction/versioning policy. Do not silently freeze or change rules during review. |
| A05 | P2, pricing meaning | A one-year-old verified store price is CURRENT and a newer crowd price is SUPERSEDED. | Decide expiry/recency treatment and clarify CURRENT as source precedence if retained. Separate identity verification from price freshness. Never silently invent an expiry rule. |
| A04 | P2, input integrity | submit_report accepts `audit-invented-place`. Product stock cannot do this because it has a catalog foreign key. | Validate map report targets against trusted place data or a reviewed real-OSM admission path. Do not break real map-only locations by adding a naive catalog restriction. |
| A06 | P2, abuse limits | 65 vote changes on one matchup can be accepted while the daily counter sees one row. Five-second spacing was simulated by backdating the previous row locally. | Define distinct-case versus action limits; implement an action ledger if a per-action cap is intended. This is not a demonstrated public cooldown bypass. Court uses the same distinct-row counter pattern by inspection. |

Additional gaps by inspection: receipts are in-memory on the browser side, so safe retry protection is scoped to the unchanged open draft, not a durable offline outbox across reloads; retaining receipts has no scheduled expiry policy. Moderator response coverage and queue saturation are not tested. No versioned CI workflow was found in the candidate; the reproduced zero-skip run is local evidence, not a required GitHub merge check. Sign-in failure and token renewal need full managed-Auth tests. The existing verifier prints permissions and counts but does not automatically exit nonzero when an expectation fails, so its output still needs explicit assertions or a reviewer.

## Migration ordering and preservation

Ten pending files are ordered below. All ten have explicit begin/commit. The compared stack adds them without changing any migration at or before 20261115000900. Local execution from scratch passes. The separate upgrade fixture inserts an existing published take and Beef vote before pending migrations, then confirms they survive. The new local restore fixture adds reports, a take and vote and compares all 35 public/auth tables after restoration.

| Order | File | Integrated dependency |
| ---: | --- | --- |
| 1 | 20261115001000_handle_substrings.sql | Existing username fields and normalization helpers |
| 2 | 20261115001100_showdown_names.sql | Renames existing Beef tables; preserves old function names |
| 3 | 20261124000100_personal_lists.sql | Requires renamed matchups and social-user checks |
| 4 | 20261124000200_nugget_court.sql | Extends saved subjects, moderation and take subject kinds |
| 5 | 20261124000300_taste_profiles.sql | Reuses Court author visibility, follows and blocks |
| 6 | 20261124000400_discovery_trails.sql | Wraps Court moderation/exports and adds versioned trails |
| 7 | 20261124000500_place_scores.sql | Adds ratings, place-to-matchup links and export wrapper |
| 8 | 20261124000600_take_stamps_and_rebuttals.sql | Extends existing takes, replaces visibility/place-screen reads |
| 9 | 20261124000700_price_ledger.sql | Adds source/price tables, relies on products.size and stock functions |
| 10 | 20261124000800_release_hardening.sql | Removes inherited grants, adds receipts and locks, final export wrapper |

No drops of user tables occur in this batch. Constraint and trigger changes, renamed functions, cascade behavior and query locks still require production-sized rehearsal. New fields on existing takes are nullable. A failed file rolls back that file; previously committed files remain applied. The batch is not one atomic transaction. Do not repeat non-idempotent migration files after an uncertain result; inspect actual schema/history read only first.

An important intermediate-state risk remains: inherited-grant cleanup is last. Applying earlier files while leaving a live API open exposes intermediate permissions until the final file commits. If a failure occurs earlier, cleanup has not happened. Before approved execution, rehearse a safe order/maintenance strategy that prevents public writes and does not rely on an unapproved production setting change. This audit did not rearrange or apply SQL.

## Permissions, row security and account privacy

The local fixture intentionally grants broad default table privileges before applying all migrations. Final permission-matrix.json shows row security on all 34 public tables, no direct writes for anon/authenticated, whole-table SELECT only on products/places/place_products, and restricted column access on profiles. The tests reject banned/private profile fields, TRUNCATE, direct private-table reads/writes, self-promotion and forged store verification.

Private lists, trail progress, ratings, price submissions and receipts export only the caller's rows in the tested entry points. Public profiles intentionally expose handles/IDs and approved takes. Public prices mask handles but are not guaranteed anonymous: exact prices/timestamps and external posts can be correlated. No passive coordinate history is introduced by this stack; explicit user report/stamp records do link an account to a place/time and must be described accurately in privacy/retention policy.

Privileged functions check server identity, moderation roles or visibility and use fixed search paths. Older helpers using public rely on public-schema CREATE being revoked. Local tests show the final revocations, not the real project's role memberships/default grants. Schema CREATE, inherited roles, per-column privileges, sequence grants and every callable security-definer function must be compared against the actual production schema before release. The existing printed verifier covers much of this but is not an automated deployment gate.

No loaded production blocked-term list was inspected. Baseline local tests do not certify the quality or coverage of the private profanity/slur list. The list must remain out of git; a reviewed operational count/provenance check is still needed.

## Moderation and safety

Passes: non-moderators cannot access the inbox or issue strikes; new first takes and replies wait for review; blocked text is hidden; hidden or blocked take ancestors hide threads; old approved content remains accessible; ordinary browser roles cannot write verification/source tables. Reviewed trail versions prevent an older approval from publishing a later edit. Business accounts have no deletion privilege over another person's takes.

Not proven: human response times, queue volume, false positives, moderator compromise response, email/account creation abuse, coordinated multi-account voting, child-safety operations and every report surface. A01 means the current lock policy removes an important safety tool. Account deletion is still a placeholder and must not be treated as a completed launch gate.

## Retry and rollback assessment

Atomic receipt functions passed concurrent same-ID replay, changed-payload rejection, private exports and a browser lost-response test after commit. Server row locks serialize rate checks. The frontend also blocks duplicate submit events and preserves edits during a slow request. Older write functions intentionally remain callable, so a client can still create separate legitimate submissions with new IDs up to the normal limits.

Rollback should restore the previous frontend while retaining added schema/data. Old APIs exercised successfully against the candidate, but new hash routes will not work on an old frontend, and old hash routes currently fail on the new one (A07). These are distinct compatibility directions. Dropping new tables or undoing schema after users submit content is not a safe generic rollback. Restoring a backup can overwrite newer submissions and needs an explicit incident decision, recovery point and reconciliation plan.

The local synthetic restore passed. A production backup archive, offsite/privacy handling, managed Auth/storage recovery, role restoration, restore duration, recovery-point/recovery-time goals and actual production-data restoration remain **unproven**. No “rollback ready” signoff is warranted yet.

## Catalog and operational evidence

Local full-chain totals are 25 products, 83 places and 189 links. These are integrity counts, not current stock, verified store hours or SKU availability. IDs are sourced OSM node/way IDs; grocery leads and attribution files are present. Store-brand placement rules remain separate from national-brand “places to check.”

Source spot-checks on November 25 confirmed the Tyson product page and Applegate product page; the Just Bare URL is a Costco retailer page, not a manufacturer page. Several bottled-sauce records link a general brand collection. The `official_product_url` label overstates the uniformity of those sources. Full SKU/pack-size review, exact current branch/address verification, all catalog source URLs and opening/closure changes were not verified. No branch inventory or allergen claims were checked. Current “Might be here. Not confirmed.” copy is appropriate for leads.

## Next work recommended, not performed

Fix A03/A07/A01, decide A02/A05/A06, tighten map input validation without losing valid OSM places, add regression tests for all seven probes, and rerun the exact final candidate. Then complete account deletion and real-device/Auth checks, reconcile actual production schema/history read only, rehearse an approved production backup restore in isolation, and review the legal/operational gates. Only then request explicit migration, merge and deployment approval.
