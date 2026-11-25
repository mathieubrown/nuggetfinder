# Corrected release candidate: development review only

**Hold remains.** No production SQL, settings, merges or deployment were changed. This branch extends the accepted VS icon branch (PR #35), which extends the PR #33 candidate. It addresses the seven findings from review PR #34. The review-only PR does not need to be merged to inspect this code.

## Findings and regression evidence

| Finding | Correction | Evidence |
| --- | --- | --- |
| A01: safety tools blocked by posting restrictions | Dedicated safety checks preserve report/block while retaining sign-in, age, ban, target/reason and rate checks. Posting and moderator privileges stay restricted. | Native role tests plus a browser report/block while temporarily locked |
| A02: closed Court rulings silently recalculate | Private recorded ballots and append-only ruling versions. Reasons, notes, previous version and moderator are recorded. Outcomes are derived by the unchanged 20-voter/60% function, never selected by a moderator. | Ban/deletion stability, immutable update/delete guards, concurrent version conflicts, public redaction, real REST and browser record/correct flows |
| A03: stale cached stock confidence | Snapshot leases expire at the earliest contributing vote and in at most 60 seconds. Screens poll every 30 seconds, age displays while forms have focus and fail closed on errors. Share cards check again after font loading. | Earliest-vote boundary tests; failed-refresh map/product/price browser checks; delayed-font PNG test |
| A04: invented map targets | Server trigger admits only reviewed catalog place IDs. Browser map reporting uses the same known catalog as product stock; external discovery alone cannot register a target. | Valid/invalid/unregistered OSM IDs, no inserted invalid rows; existing product foreign-key checks retained |
| A05: old verified prices override new evidence | Latest eligible observation wins by time/ID. Source verification is a separate badge. All earlier records remain stored. Historical price rows survive account removal privately without reviving previously hidden evidence. | Historical verified source versus new crowd price; exact age-band tests; nullable-attribution preservation test; three-band browser capture |
| A06: vote cap counts distinct cases | One shared Court/Showdown action ledger counts the first vote and every actual change, with 60 in rolling 24 hours. Existing five-second cooldown remains. Same-answer no-ops do not consume a change. | 60/61 boundary, concurrent final slot, old Beef API, shared Court limit, rolling expiry and no-op/cooldown tests |
| A07: old shared URLs break | Beef and weekly aliases retain IDs, encoded creator parameters and order queries. | Router regressions and browser legacy challenge/weekly navigation |

## Approved rules and exact boundaries

Court stays seven days from moderator approval, at least 20 eligible recorded votes, at least 60% for a unique winning option. Ties, no 60% majority and low turnout do not force a winner. A Court result is community opinion, never stock, ingredient, allergen or business verification.

Voting closes automatically at the stored deadline. A closed round shows **Awaiting recorded ruling** until a moderator records its first version. No public read writes an audit record and no scheduler or production setting was added. Assign moderator coverage for this recording step before enabling Court. The initial record captures the available closed ballot and eligibility at recording; later bans/deletions cannot silently change that published record. If automatic publication at the deadline is wanted, it needs a separately reviewed operational mechanism.

Corrections use recorded ballot IDs and an expected version. They append a reason/note and a newly derived count. An outdated moderator form is rejected rather than overwriting another correction. Private ballots and individual eligibility are never returned by public history. Identity references can be erased after account deletion while immutable aggregate facts remain. Removing a nominator keeps the case and audit record private; banned or blocked content is never republished by removal. This supports a future deletion design; it does **not** implement account deletion or settle retention policy.

Price age uses elapsed time: up to and including seven days is **Recently reported**; after seven days through thirty days is **Dated** (the eighth through thirtieth day); over thirty days is **Historical**. Historical does not mean deleted. Latest/earlier labels describe ordering, not guaranteed availability. A Best recent unit price label only compares recent eligible observations in the selected comparable-unit view. Stock date and price date are separate.

Legacy upgrade: Showdown action history is carried forward. Old Court stored only its latest answer, so earlier individual changes cannot be reconstructed. A private, explicit one-time hold prevents those known legacy voters from adding actions until their latest legacy Court activity is outside the rolling 24-hour window. No actions are fabricated. New voters do not receive this hold. Review any holds and missing legacy data during preflight; do not erase or override them to force traffic through.

## Other review defects corrected

- Retried takes/prices retain request IDs across same-account reloads or switches between drafts. Session storage contains payload hashes and random request IDs, not draft text. An account check precedes sending. This is same-tab recovery when storage is available, not a cross-device offline outbox. Disabled storage falls back to open-draft memory.
- The main report action is before the long store list. Record/Photo/Upload are labeled “soon” before tapping. Opinion stamps and source/age explanations are clearer. These visual corrections need design review.
- The new read-only verifier exits unsuccessfully when catalog, RLS, table/column privileges, helper/API grants or schema CREATE rights differ from expectations. A regression deliberately grants a private column and confirms verification fails.
- A new migration removes separately granted column privileges on the known NuggetFinder tables. Table-level revocation alone does not remove those grants. It restores only the four approved public profile columns. Unknown production objects/roles still require preflight review.

## Tests and reproducibility

**55 automated checks passed, zero failures and zero skips**, with native PostgreSQL, real PostgREST/JWT and PGlite enabled. Full TAP: [integrated-tests.tap](evidence/integrated-tests.tap).

The browser suite passed at 390px and 1280px with no console errors or horizontal page scroll. It exercises actual local SQL behind simulated browser Auth/transport; separate REST tests cover the real HTTP/JWT boundary. It checks lost responses after commit, safe retries, moderation, blocking, stock expiry while inputs have focus, legacy routes, all three price bands, versioned rulings and both motion preferences. It also retains the 320px long-name check. Full log: [browser.txt](evidence/browser.txt).

[Local read-only verification](evidence/verification.json) passes for 25 products, 83 places, 189 links, 38 public tables and 100 security-definer functions. All public tables have row security and private data remains behind checked functions. This describes the local fixture, not live Supabase.

[Old API and restore rehearsal](evidence/compatibility-restore.json) passes for the exercised deployed APIs and a synthetic 39-table backup/restore. The fixture includes receipts, prices, vote actions, a legacy hold, recorded ballots and multiple ruling versions. Row counts/digests, table grants/RLS and sequence values match after restoring. This is not a production backup/restore or managed Auth/storage recovery test.

Use the local setup in docs/release-readiness.md, with a dedicated disposable PostgreSQL server:

```
NUGGETFINDER_TEST_REST=1 node --test tests/*.cjs
node tests/browser/local-database.cjs
```

Set NUGGETFINDER_LOCAL_PG_URL and package/browser asset paths as described there. Both native/REST suites must be enabled for zero skips. The fixture refuses non-loopback hosts; never use a tunnel to production. scripts/verify-release.cjs always starts a read-only transaction and is never a migration runner.

[Candidate/migration hashes and versions](evidence/manifest.json) identify the tested application commit. The subsequent evidence/documentation commit does not change application behavior.

## New migrations, unapplied

These six files follow all still-held migrations through 20261124000800. Do not run them alone against the older live schema, and do not use an unrestricted db push.

| Order | File | Purpose |
| ---: | --- | --- |
| 1 | 20261125000100_safety_and_report_targets.sql | Keep safety access during temporary locks; require catalog map targets |
| 2 | 20261125000200_vote_actions.sql | Shared rolling action ledger and explicit legacy-history hold |
| 3 | 20261125000300_versioned_court_rulings.sql | Recorded ballot, immutable ruling versions, moderator APIs and public history |
| 4 | 20261125000400_stock_snapshots.sql | Public, short-lived consensus snapshots with earliest-vote expiry |
| 5 | 20261125000500_price_freshness.sql | Source-independent ordering, age bands and preserved unattributed history |
| 6 | 20261125000600_column_privilege_hardening.sql | Remove legacy column grants on known application tables |

No earlier migration was edited. Each new file has its own transaction. Exact SQL is in the files and correction PR description. Its existence is not authorization to apply it.

## Review captures

All contributions, source proofs and accounts pictured are local test fixtures, not real shelf or owner claims. Tiles are transparent fixtures; attribution remains visible. These are browser captures, not actual-device evidence.

- [Main mobile](../screenshots/corrections/main/390.png) / [desktop](../screenshots/corrections/main/1280.png)
- [Spot mobile](../screenshots/corrections/spot/390.png) / [desktop](../screenshots/corrections/spot/1280.png)
- [Showdown mobile](../screenshots/corrections/showdown/390.png) / [desktop](../screenshots/corrections/showdown/1280.png)
- [Composer mobile](../screenshots/corrections/composer/390.png) / [desktop](../screenshots/corrections/composer/1280.png)
- [Badges mobile](../screenshots/corrections/badges/390.png) / [desktop](../screenshots/corrections/badges/1280.png)
- [Price history mobile](../screenshots/corrections/price-history/390.png) / [desktop](../screenshots/corrections/price-history/1280.png)
- [Court correction history mobile](../screenshots/corrections/court-correction/390.png) / [desktop](../screenshots/corrections/court-correction/1280.png)

## Unresolved conditions and explicit deployment gates

No failure remains in the seven regression areas under the tested local conditions. These remaining conditions are **not** signed off:

1. Independent review of the exact candidate and all pending SQL, followed by your explicit approval for any production SQL, merge or deployment. The deployment hold remains.
2. Actual production schema/history/role/default-grant reconciliation, real catalog/SKU/branch/source verification and production-scale upgrade rehearsal. No live Supabase read or write occurred in this pass.
3. A private production backup, verified isolated restoration, managed Auth/storage/role recovery scope, recovery objectives and reconciliation of submissions after a backup. The local synthetic rehearsal does not prove this.
4. Physical iPhone/Android and human screen-reader acceptance, actual email sign-in/refresh/logout/deletion behavior, provider limits, and production load/abuse testing. Simulated sessions and emulated widths are not substitutes.
5. Working account deletion, lawyer-reviewed terms/privacy/DMCA contacts and retention policy, operational moderator coverage/appeals, private blocked-list provenance/coverage and incident handling. These remain public-participation gates.
6. Assign the Court recording/correction operator and review any one-time legacy vote holds. No automatic finalizer or production scheduler is configured.
7. No required versioned GitHub CI gate was introduced; the exact local evidence is recorded. Cross-device offline submission recovery, media publishing and business claims remain later work, not shipped features.

Deployment must be additive and compatibility-checked: apply only explicitly approved files, stop at the first error, verify read only, then deploy only after separate approval. Do not drop added tables or restore over newer submissions as an automatic rollback. All existing holds remain in effect.
