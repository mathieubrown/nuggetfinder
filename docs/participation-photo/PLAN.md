# All ages and Day Zero photography

Development review, 2026-11-25. Not launch approval. [Founder directive](../FOUNDER_DIRECTIVE.md) governs conflicting older material.

## What is built in this branch

Two unapplied migrations add private participant identities, per-capability readiness, consent receipt references, permission events and a shared photo evidence foundation. Every readiness flag starts off. No parent, moderator or browser can self-verify consent or turn a capability on. Private age bands are under13, teen and adult; no date of birth is stored. Existing age metadata is not trusted as verified age or consent. Trusted onboarding and legal review still need to determine appropriate age assurance without collecting unnecessary data.

Each managed child has an independent participant UUID. A parent account can control multiple participants without collapsing their contributions into one parent vote. `participant_can` checks ownership, invitation, readiness, verified scope, expiry, revocation, pause, account ban and posting restriction on the server. The browser receives only its own pseudonyms, control state and operation availability, not ages or another family's records. Pause and revocation remain possible during posting restrictions. No public participant directory exists.

Photo reservations are idempotent, serialize concurrent requests per participant, enforce ten reservations per rolling 24 hours and reject unknown catalog targets. Product/place associations work at this layer. Other link kinds are modeled but deliberately rejected by the browser reservation function until content-specific visibility and participant ownership adapters exist. Request IDs are globally unique; a conflicting payload is rejected. Reserves count even if abandoned, preventing cheap repeated staging. This is a proposed photo limit, separate from existing vote/report limits.

The reusable browser editor supports camera/file input, full/square framing, opaque rectangle redaction, inspection/attestation and JPEG preparation in memory. It has contextual product entry and an inline editor inside the take composer that preserves the text draft, plus account participation controls. It sends no original or prepared image anywhere. It does not attach evidence to a posted take yet. Navigation/discard releases image memory; no photo is persisted in local/session storage. Canvas redaction is a convenience, never the server security boundary. These new screens need design review.

The local Python/Pillow 13.0.0 processor validates decoded format, input bytes, dimensions, animation and coordinates; normalizes orientation; rebuilds a clean raster; flattens transparency; performs irreversible redactions and cropping; and emits bounded 320px/1600px JPEG variants without EXIF/ICC/original filenames. It neither stores originals nor publishes content. It does not detect faces, payment information, ownership or food. It is a tested processing component, not a deployed upload service.

All new tables have RLS and no browser table grants/policies. Object keys and consent verification references are private. No Storage buckets, policies, server keys or settings are created. Own-data export includes managed participants and evidence, with consent receipt references withheld. Evidence deletion is available even after consent revocation or posting lock. Deleting an account/participant queues evidence erasure before removing its owner link. There is no public evidence read function, so this foundation cannot leak a pending image.

## Remaining implementation sequence

| Order | Work and dependency | Acceptance before enabling |
|---|---|---|
| 1 | Counsel-approved audience classification, parental notice, verification method, consent scopes, age assurance and vendor inventory. Choose a trusted consent adapter with no browser success flag. | Verified/revoked/expired/replayed consent tests, parent authenticity tests, minimal receipt retention, no child data collection before applicable consent. |
| 2 | Trusted onboarding and participant-session broker. Parent reauthentication for profile switching and sensitive controls. Invitations restricted to reviewed accounts; child devices receive scoped sessions, never the parent's unrestricted JWT. | Cannot forge participant/age/guardian/invite claims; revocation invalidates active sessions; multi-child separation; guardian account recovery; blocked parent and custody disputes reviewed. |
| 3 | Participant attribution across every existing contribution and export/deletion/read API. Introduce versioned adapters, backfill existing adult/teen rows only after reviewed mapping. | Same-weight votes/ratings, independent child quotas, duplicate household abuse checks that do not punish legitimate siblings, existing 60 actions/24h and cooldown unchanged, atomic retries, no legacy API bypass, no private identity in public views. |
| 4 | Trusted upload broker and worker using private Storage. Reserve first, bounded stream, validate token/scope/target again, re-encode in sandbox, write only sanitized variants, atomically mark pending. | Real Storage/JWT denial tests, MIME mismatch/polyglot/HEIC feedback, worker memory/time limits, decompression/adversarial corpus, crash recovery, idempotent finalize, storage quota backpressure, no public raw URLs. |
| 5 | Shared moderation inbox and authenticated image-serving broker, parent review and report/delete controls. | Human food-only/PII/rights review, no self approval, revision compare-and-swap, new version re-review, block/ban/consent/source visibility checks on every serve, removal immediately denies reads, caches and expired links handled. |
| 6 | Integrate evidence with review/rating, stock, price, packaging, menu, receipt, Showdown, Court, trail, challenge, take and reply flows. | Existing subject authorization per link; no cross-user draft attachment; show observation time, source, moderated status; image never changes confidence/ruling by itself. Receipt redaction and manual privacy review mandatory. |
| 7 | Parent dashboard, private teen experience, structured language-safe reactions and moderated text; expiring private challenges/groups. | No adult-to-minor discovery/tagging/follow/contact bypass, private membership, challenge abuse limits, no public guardian links, all public child activity unlinkable to personal visit trails. |
| 8 | Scheduled cleanup, export/download, full account/child deletion, backup erasure policy and incident rehearsal. | Purge confirmations across originals/variants/caches/queues; retries after failure; tombstone minimization; backup expiry and restoration deletion replay tested. |
| 9 | Actual-device and invitation pilot review for every age group. | iOS Safari/Android camera permissions, interrupted uploads, offline retries, low memory, accessibility, family shared device/sign-out; legal/security approval and explicit production authorization. |

These are launch dependencies, not optional later work. This branch completes shared groundwork and a local editor/processor; it does not claim complete all-age participation or production photography. Existing auth and contribution APIs still use `auth.uid()` and the old age gate. Removing the checkbox alone would bypass safeguards and attribute sibling votes incorrectly. Keep those unchanged until the atomic participant cutover is reviewed. No child provisioning endpoint exists yet.

## Permissions and interaction design

Capabilities: discover, rate, vote, challenge, compete, stamp, trail, rank, report, photo and social. Readiness is by age band and operation, permission by individual participant and purpose. Separate product capabilities from a moderator role. A verified business can supply attributed observations/responses but cannot grant child consent, discover children, erase reviews or control organic ranking. Every age has the same eligibility objective and contribution weight.

Public browsing must also pass privacy review: current map tiles, CDN scripts and Google fonts receive network identifiers before sign-in. For child-safe onboarding, use self-hosted fonts/scripts and counsel-approved map delivery or a local catalog view until the mapping dependency passes review. Do not collect exact location or infer a personal travel history from report/photo associations. Private child observations need an aggregation/delay/redaction strategy before public attribution, even when the photograph itself is safe.

A neutral age flow should route an under-13 person to parent setup without creating an ordinary public account. Parent sees clear collection/disclosure purposes before verification, then creates an illustrated pseudonym and separately enables eligible capabilities. Teen setup defaults private and blocks public search/follows/tags and unsolicited contact. No public age badges. Parent review shows the child's own contributions and controls without exposing other families. Consent cannot be conditioned on optional disclosures.

Proposed private competition codes: 128-bit random tokens stored as hashes, single-purpose, 24-hour expiry, owner revocation, ten failed redemption attempts per account/24h, maximum group size, no names/rosters before acceptance and no public lookup. Require guardian approval for joining external groups; code possession alone is not authorization. No DMs or address-book uploads. This is a design proposal, not implemented or activated. Challenges need participant limits and abuse review before enabling.

## Evidence lifecycle and privacy

One UUID per image, independently linked to entities. Observation time is supplied, optional and labeled unverified; submission time is server-generated. Never infer observation time/location from EXIF. Source initially means own photo; no arbitrary attribution names, copyrighted imports or original file names. Public credit for managed participants must use safe pseudonymous/anonymous attribution selected through the reviewed disclosure policy. Exact child-linked place/time combinations must not become public history.

`reserved -> pending -> approved` requires trusted processing and human review. Rejection, removal, deletion and correction are separately recorded. Proposed correction: increment revision, withdraw existing approval, replace sanitized variants, record reason code and return to pending. Preserve minimal review events, not removed private pixels. A photo strengthens context but never independently flips stock, overwrites fresher price evidence, verifies allergens or determines Court opinion as fact.

All proposed byte storage is private. Serving broker checks current publication revision, consent, parent controls, subject visibility, blocks and ban/deletion state, then streams a variant with no-store for private content. Avoid durable public buckets and long-lived signed links. Supabase signed links alone cannot satisfy immediate revocation after issuance; test the chosen proxy/cache design. No storage/serving implementation is claimed in this branch.

Proposed operational retention, subject to counsel approval:

| Data | Maximum target | Cleanup and verification |
|---|---|---|
| Original | RAM only during processing, hard request timeout | No original persisted; interrupted-process and log tests. If staging becomes necessary, private encrypted temporary objects, one-hour hard TTL and reviewed incident handling before activation. |
| Reserved without processing | 24h | Delete reservation/object remnants; minimal abuse counter retained only within documented limit window. |
| Pending sanitized variants | 7d | Unreviewed items expire, never auto-publish. Owner can resubmit after cleanup. |
| Rejected variants | 24h after decision | Purge with minimal decision metadata; no pixel archive. |
| Approved variants | While consent/purpose/account remain valid; annual necessity review | Parent withdrawal/removal immediately disables serve and queues purge. No indefinite automatic retention. |
| Deleted/removed variants | Immediately inaccessible; purge target 24h | Retry worker until storage confirms deletion; alert on overdue jobs. |
| Deletion tombstone | 30d proposed | Minimal nonidentifying purge result, then erase; define backup expiry and legal exception process with counsel. |

Only the reservation deadline and erasure queue are implemented. Worker enforcement of the rest is a blocker. Do not advertise these as fulfilled policy yet. Never retain rejected child images for model training. No LLM, facial age inference or paid screening calls.

## Moderation procedures

Review safe thumbnails blurred by default, with deliberate reveal, access audit and trained staff. Check food relevance; identifiable people, reflections and faces; names/payment/loyalty/barcodes on receipts; documents; addresses/schools; rights; malicious text and account-linked context. A packaging barcode is product identification, not a loyalty/payment barcode. Reject unclear redaction rather than guessing. Re-encoding removes metadata, not visible private information. Review each corrected revision afresh. Escalate safety incidents through a documented restricted process without forwarding child images to unapproved services. Humans alone decide sanctions. Reporting, blocking, parent withdrawal, deletion and appeals stay available during posting restrictions.

A small invitation pilot can use manual review with daily admission caps and an owner who checks the queue. No automatic publish when the queue grows. At 100 photos/day and 45 seconds/photo, initial review alone is 75 minutes/day, before appeals and incidents. This estimate is an operating assumption to measure. Moderation capacity and absence coverage are launch gates.

## Infrastructure and cost review

Keep Pages for static UI, Supabase for private records/storage and a trusted upload/serving broker. The tested Pillow processor requires a server runtime; it does not run on GitHub Pages or directly in Supabase's Deno Edge runtime. Evaluate a bounded WASM re-encoder in an isolated Edge proof before choosing another host. Supabase Edge limits (including CPU/memory) mean compatibility must be measured, not assumed. No new hosting, bucket, provider, scheduler or bill has been enabled.

Budget example, not a quote: target 200 KB display + 30 KB thumb per approved image. 1,000 images occupy about 230 MB excluding database, rejected/pending data, overhead and backups. 10,000 images occupy about 2.3 GB. 10,000 full-display views transfer about 2 GB; repeated grid thumbnails also count. Quality/output targets need real food/receipt sample testing; the processor's hard ceiling is 1.5 MB per variant, so capacity planning must include worst case or tighter adaptive compression. Supabase documents 1 GB Free storage and separate cached/uncached egress quotas; monitor both rather than assuming all free capacity is available. Current project plan/usage was not accessed.

Published Supabase reference prices as checked on 2026-11-25: Free is $0/month with 1 GB file storage, 5 GB uncached and 5 GB cached egress. Pro starts at $25/month with 100 GB file storage and 250 GB in each egress category; published overages are $0.0213/GB storage, $0.09/GB uncached and $0.03/GB cached egress. These are provider list prices, not a recommendation to upgrade or a total operating budget. Database, email, worker, consent and staffing limits are separate. No plan change is authorized.

Options requiring Mat's later explicit approval: any paid parental verification provider, paid image screening, paid SMTP, storage/egress upgrade, image-worker hosting or support staffing. Provider prices remain unknown until verification method, volume and vendor terms are chosen. Manual consent verification also costs staff time and is not automatically legally adequate. No paid-service or LLM calls were made.

## Specific review decisions

1. Counsel: audience classification, age assurance/VPC method, independent purposes and disclosures, teen requirements and relevant California applicability/enforcement; do not treat a checkbox, invite, parent email or payment alone as universal consent.
2. Founder + counsel: child public attribution versus private/aggregated evidence, observation time/place precision, parent control boundaries and private group rules. Recommendation: private child activity first, equal game mechanics, aggregate public stock without a browsable child visit trail.
3. Founder: operational owner and measured manual-review capacity, proposed ten photos/24h, retention targets, and thresholds that pause new submissions rather than silently publish.
4. Technical review: participant migration/cutover, consent/session broker, Edge re-encoder feasibility, secure serving/revocation and cleanup design. Approve a concrete provider budget only after this proof and counsel input.
5. Separate final approval: migrations, infrastructure/settings, merges, deployment and invitation pilot. None is implied by development approval.

## Readiness classification

Deployment blocked: incomplete participant API cutover and legacy privacy containment, trusted consent/session integration, photo broker/storage/moderation/serving/cleanup, exports of image bytes, account deletion completion, zero-skip full integration tests after those implementations, backup/restore rehearsal for new records/blobs, explicit migration review.

Public participation blocked: counsel-reviewed published legal notices/contacts, verified consent and teen protections, invitation enforcement, parent controls/deletion, staffed moderation/incident handling, actual-device tests, privacy-safe map/analytics/CDN inventory and catalog review. All-age and photos are Day Zero gates.

Optional later: video, native binaries beyond responsive mobile web, paid promotion, automated moderation assistance, public group discovery (not approved), additional geography. Photo capture is supported by mobile web; actual iOS/Android camera testing is still required.

## Sources and counsel questions

Accessed 2026-11-25. Legal analysis is for review, not a legal conclusion. Confidence high that these primary sources describe their stated rules/products; applicability to NuggetFinder remains unproven and for counsel.

- [FTC COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions): consent, photos/metadata, audience/actual knowledge and persistent identifiers. Ask counsel how the intended all-age design affects classification, onboarding, map/CDN identifiers and collection before consent.
- [2025 amended COPPA rule, Federal Register](https://www.govinfo.gov/content/pkg/FR-2025-04-22/pdf/2025-05904.pdf): updated consent, disclosure, security and retention obligations. Ask counsel to establish operative dates, required notices, purpose limits and a documented retention schedule for the planned launch.
- [16 CFR 312.5](https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xhtml/CFR-2026-title16-vol1-sec312-5.html): verification methods vary by use/disclosure. Which method and separate permissions are adequate for public photo/observation contributions and parent-managed accounts?
- [California DOJ child privacy guidance](https://oag.ca.gov/privacy/facts/online-privacy/child-privacy) and [CPPA 2026 regulations](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf): child/teen privacy and sale/sharing controls. No sale/sharing is planned. Ask counsel which California obligations, youth design laws, litigation/enforcement developments and thresholds apply; this pass does not resolve those.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [asset delivery](https://supabase.com/docs/guides/storage/serving/downloads): private storage depends on authorization; do not use public buckets for pending evidence.
- [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits): validate the image workload against resource limits before selecting that worker architecture.
- [Supabase pricing](https://supabase.com/pricing), [storage usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress): published quotas/prices can change. Recheck before any purchase, with project usage and realistic samples.
- [Supabase Auth user management](https://supabase.com/docs/guides/auth/managing-user-data): deleting a user does not automatically invalidate issued JWTs. Test live-session denial and delete owned Storage objects through a trusted worker; never put service_role in the browser.

Unproven conditions are listed explicitly above. Nothing here declares COPPA/California compliance, verifies parent identity, certifies safe images or authorizes launch.

## Image dependency security review

The initially installed Pillow 11.3.0 was used for the first local functional check, then rejected for the candidate after checking current primary advisories. The candidate pins Pillow 13.0.0 in an isolated Python 3.13 environment and refuses older versions at import. Both decode calls restrict the plugin allowlist to JPEG/PNG/WebP before sniffing. This prevents invoking arbitrary format plugins just to reject them later. Final functional results use the updated version.

Sources accessed 2026-11-25: [Pillow security handbook](https://pillow.readthedocs.io/en/stable/handbook/security.html), [13.0.0 release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html), [EXIF/TIFF allocation advisory, fixed in 13.0.0](https://github.com/python-pillow/Pillow/security/advisories/GHSA-wqgw-9xfh-qf2g). This is a targeted dependency check, not proof that all decoder vulnerabilities are absent. Pin and reassess codec libraries in the eventual deployment image, run a bounded subprocess/container and fuzz the accepted formats before enabling uploads. No untrusted live uploads were processed.
