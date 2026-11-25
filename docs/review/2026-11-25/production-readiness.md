# Production-readiness decision

**Current decision: HOLD deployment and public participation.** No live SQL, merge, deployment or production setting change is authorized by this review. A test pass is evidence, not a release approval.

## What blocks deploying this candidate

| Gate | State | Required evidence / owner |
| --- | --- | --- |
| Confidence freshness | BLOCKED | Fix A03 so old cached data cannot retain current stock confidence. Developer, then timed/offline browser tests. |
| Existing shared URLs | BLOCKED | Fix A07 aliases for old Beef/weekly links, preserve creator parameters, verify both directions of frontend/database compatibility. Developer. |
| Safety access during locks | BLOCKED for a participatory release | Fix A01 so report/block remain usable under posting restrictions, with clear banned-account policy. Developer + Mat decision. |
| Court results after close | DECISION BLOCKED | Agree versioned corrections/retrial semantics for A02, or explicitly omit Court from a reviewed release. Mat. No feature omission was made. |
| Migration execution strategy | UNPROVEN | Review exact ten-file SQL, actual history/schema/grants and intermediate-state exposure; rehearse failure after each file. Developer/reviewer; live writes still need approval. |
| Backup and recovery | PARTLY PROVEN LOCALLY | Synthetic 35-table archive/restore passed. Actual production backup, isolated restoration, Auth/storage/roles scope, timing and reconciliation remain unproven. Operator + explicit approval/access plan. |
| Candidate test evidence | BASELINE PASS, NEW FINDINGS OPEN | 34 checks, zero skips; browser flows at both widths. Add regression checks for seven audit findings, rerun final fixed SHA. Developer. |
| Deployment authorization | HELD | Mat must explicitly approve migrations, merges and deployment. This report grants none. |

A locked invitation pilot could reduce exposure but is not currently implemented as a separate gated mode. Do not assume hiding a button or disabling sign-up stops existing authenticated users from calling APIs. Any pilot gate must be enforced server-side, reviewed and separately approved before production changes.

## What blocks public participation

- **Delete my account is not implemented.** The page says it is pending. Build a server-controlled deletion flow with reauthentication, immediate posting/access restriction, session-revocation strategy, dependent-row handling, receipt/storage cleanup and an auditable completion result. Never put a service-role/secret key in the browser. Decide what happens to public replies, Court rulings and price history when an account is removed. Supabase warns that deleting an Auth user does not by itself invalidate already-issued stateless access tokens; test the full design, not just a DELETE statement.
- **Legal/contact pages are draft.** Named operator/contact, accurate data inventory, retention/deletion practice, complaint process, community rules and paid-content disclosures need counsel review. A “DRAFT” badge is not a substitute. This is a product launch gate and a request for counsel assessment, not a legal conclusion about which statutes apply.
- **Safety operations are incomplete.** Fix A01, assign a moderator and backup, agree queue response targets, appeals, abuse escalation and incident handling. Confirm private blocked-term list provenance/count without committing the words. Test a backlog and suspicious-account scenarios.
- **Managed Auth has not been validated for this release.** Test real email delivery, confirmation, sign-in redirects, expired links, refresh/logout, restrictions and deletion in an approved test environment. Do not change live Auth settings during this review.
- **Actual devices and accessibility remain untested.** Run Safari on a physical iPhone and Chrome on a physical Android: keyboard open, safe areas, camera-disabled controls, back/deep links, long lists, offline/reconnect, share/download behavior and text zoom. Include VoiceOver/TalkBack or a human screen-reader review. Browser width emulation and touch-target height checks do not prove these. Normal-motion animation quality/skipping was not exercised in this reduced-motion review run.
- **Truth and catalog clarity need signoff.** Fix confidence expiry, choose old-price treatment, distinguish opinion/identity/stock and review starter products, store IDs/addresses, pack sizes and source links. Do not imply shelf availability from retailer assortment or a Court ruling.

## Legal review questions and primary sources

Sources accessed November 25, 2026. These describe source guidance and questions for counsel; they do not determine applicability or compliance for NuggetFinder.

| Topic | Question for counsel | Primary source |
| --- | --- | --- |
| Children and age screening | Is this general-audience/teen experience's presentation and age-screening approach appropriate? What should happen on actual knowledge of an under-13 user? A checkbox alone is not a compliance determination. | [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), which points to the amended rule |
| Privacy and deletion | Which California/privacy duties apply to this operator and its actual collection/retention? What notices and deletion response process are needed? | [California DOJ CCPA overview](https://www.oag.ca.gov/privacy/ccpa?version=published) and [CPPA general notices](https://cppa.ca.gov/pdf/general_notices.pdf) |
| Copyright complaints | Should the operator register a designated agent to seek applicable safe-harbor protection, and what public contact/process should be published? | [U.S. Copyright Office designated-agent guidance](https://www.copyright.gov/dmca-directory/) |
| Food claims and paid speech | How should sourced allergen cautions and business verification be worded? What disclosures and complaint process are appropriate before enabling paid content? | Existing docs/research/ FTC work needs final counsel review against the actual feature set; no paid feature launch is proposed here. |

Technical sources: [Supabase user management/deletion](https://supabase.com/docs/guides/auth/managing-user-data), [PostgreSQL row-security limitations](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [PostgreSQL dump/restore](https://www.postgresql.org/docs/17/backup-dump.html), and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). OSM credit must remain visible; tile supply is best-effort. None of this review authorizes new paid map hosting.

## Catalog verification checklist

Proven locally: full-chain counts 25/83/189, relational integrity, native OSM identifiers, separate grocery lead links, visible attribution and no seeded stock/allergen claims. Reviewed files use a November 7 snapshot accessed November 14. This is dated location evidence, not current business/inventory verification.

Still needed: human/official-source check of each SKU and package size, source type (manufacturer versus retailer/collection), original 15 product sources, all ten grocery import URLs, branch/address existence, duplicate/closure review and launch-area coverage. Costco is a valid retailer source but should not be uniformly labeled a brand's official product page. Do not fetch or store shopper location history or scrape restricted review sites. Real shelf reports must come from actual reports, not verification fixtures.

## Optional for later, not reasons to invent a launch claim

Video/photo publishing, owner-claim onboarding, brand stock feeds, push alerts, paid placements, dashboards, native apps, richer VS motion, sound, more sticker packs, automatic retrials and advanced anti-brigade tooling can follow in reviewed phases. Dashboards still require the prior lawyer-review approval before being built. Photo evidence requires upload privacy, metadata stripping, moderation and deletion work before enabling it.

Grouped discovery navigation, richer empty states and more prominent report entry are recommended near-term product polish. A full native app is not needed to test the responsive web experience; physical mobile testing still is.

## Decisions requested from Mat

1. Keep the deployment hold and authorize a separate correction pass for confirmed defects? Recommendation: yes. That would not authorize live SQL/merges/deployment.
2. Accept the Court pilot numbers, no forced winner for low turnout/ties, and versioned corrections after close? Recommendation: keep 7/20/60, with those explicit outcome rules.
3. Should an old verified price expire or remain a labeled historical store assertion beside newer crowd evidence? Recommendation: show both and avoid calling it current indefinitely; approve a concrete age rule separately.
4. Keep central plus as “Drop a take” with a separate prominent Report action, and group discovery links? Recommendation: yes.
5. Who owns moderator coverage and lawyer/contact review, and which iPhone/Android devices can be used for acceptance? These are assignments, not requests for new tokens.
6. Choose recovery objectives before deployment: maximum acceptable lost submissions and outage duration, plus who may authorize restoration. Recommendation: no destructive automatic rollback.

## What this review did not do

No Supabase management or database operation against production. No application or migration edits. No merge or deployment. No production settings, tokens, accounts or paid services changed. No claim that a synthetic restore proves production recovery. GitHub metadata and selected deployed static assets were read only. GitHub access remains available as requested.
