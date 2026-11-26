# Scoped participation and food evidence candidate

November 25, 2026. Development only. This implements the runtime missing from the foundation in PR #37. Nothing was merged, deployed, enabled or applied to production. It does not certify consent or legal compliance. Review the full stacked release before any activation.

## What now works in isolated tests

- Each player has an individual contributor identity, votes, reports, points, saves, rankings and stamps. Siblings share a real parent login but have separate pseudonymous profiles. No fake Supabase Auth users are created for children. Erasing the parent's own player preserves the login and other children.
- A recent, verified account sign-in can request consent, use a separately verified receipt, create approved players, pair a device once, pause, resume, withdraw permissions, renew, export and delete. Invitations are separate from consent. No parent checkbox, URL flag or browser age claim can grant a capability.
- Scoped sessions expire after 30 minutes, pairing codes after ten minutes, with eight concurrent devices maximum. Permission withdrawal, bans, locks, invitation withdrawal and readiness gates are checked on every operation. Parent controls and actions serialize per account. A lifetime participant flag blocks legacy re-entry even after deleting the player's profile.
- Existing stock and place trust rules, points caps, Court rules and shared voting limits are reused. Two sibling reports have distinct actors. Ratings and reactions earn no sentiment points. Stock confidence expires in the client and refreshes from dated server snapshots. Price freshness and source verification remain separate; historical price records survive routine observation cleanup.
- Private crews have expiring codes, account-owner-approved membership, no directory, no contact upload and no direct messages. Takes and replies go through human moderation. Structured reactions, food challenges and votes work with individual attribution. Blocking, reporting and leaving remain available during posting locks. Erasing a creator preserves others' contributions; orphaned replies remain hidden.
- Public takes have an independent verified capability for every age group. Private identities appear anonymously without an actor UUID, public profile, age or guardian link. Every private-identity public take is premoderated. Direct free-text responses involving those identities are blocked; approved private crews support conversation. Legacy readers do not expose private profiles.
- Food photos can be attached to products, reports, prices, packaging, Showdowns, Court, trails, takes and private crew contexts. Browser crop and opaque redaction invalidate an earlier prepared draft. Own-photo attestation is required. Original uploads stay in memory; only re-encoded JPEG variants are stored privately. The server rejects unsupported formats and strips metadata.
- A separate private worker launcher runs each decode without network, writable root filesystem, mounts or secrets, with memory, CPU, process and time bounds. The web broker must never receive the Docker socket. A private Unix socket connects the broker to that launcher.
- Human reviewers deliberately reveal previews, check food relevance, people, private information and rights, then approve a specific revision. Corrections withdraw prior approval and require review again. Public serving requires separate verified disclosure, current consent, eligible contexts and the publication gate. Private group sharing needs its own verified disclosure. Photos never confirm stock or verify prices automatically.
- Exports include own database rows and sanitized image bytes in batches of ten. Account deletion immediately stops participation, then retries private object deletion, removes owned SQL rows and finally deletes the real Auth user using a server-only admin adapter. No privileged key reaches the browser. Missing objects count as already deleted; storage failures and abandoned upload leases remain queued.
- Cleanup enforces reserved/pending/rejected/removed deadlines. A deletion journal prevents erased identities and images from returning after restoring an old backup. A local database plus blob restore rehearsal passed. Restore replay closes all participation gates.

## Unapplied SQL, in order

The earlier foundation files 007 and 008 remain prerequisites. Do not edit or apply any already applied migration. These new files are development candidates only, each with its own transaction.

| File in supabase/migrations | Plain explanation |
|---|---|
| 20261125000900_scoped_participant_runtime.sql | Separate logins from players; private invitation/consent/session records; broker-only actions; preserve existing contributors and block legacy bypass. |
| 20261125001000_photo_lifecycle.sql | Private upload reservations, review, revisions, serving checks and physical-file purge tracking. |
| 20261125001100_private_crews_and_erasure.sql | One-time pairing, private crews and challenges, account deletion jobs and catalog projection. |
| 20261125001200_participant_reads_and_ratings.sql | Scoped discovery reads, private ratings and rankings. |
| 20261125001300_runtime_privacy_and_audit.sql | Report/block controls, private exports, moderation audit, retry receipts and legacy profile containment. |
| 20261125001400_erasure_replay_and_retention.sql | Deletion replay after restore; remove expired private stock/place observations while preserving earned points and price history. |
| 20261125001500_contextual_photo_sharing.sql | Separate verified group disclosure and membership-based evidence access. |
| 20261125001600_public_social_runtime_bridge.sql | Trusted human moderation of legacy public takes after cutover. |
| 20261125001700_anonymous_public_takes.sql | Separately approved anonymous public posting for all age groups; protected response and reporting paths. |
| 20261125001800_review_backpressure.sql | Pause admission at review queue ceilings; remove inherited PUBLIC execution of internal functions. |
| 20261125001900_release_entry.sql | An approved, nullable runtime entry URL and fail-closed legacy sign-in handoff. |

Separate held configuration: `supabase/storage/private_evidence.sql` creates/checks a private JPEG-only bucket with no browser object policies. It is not a public-schema migration. Its exact SQL was exercised against an isolated real Storage API. It has not run on the live project.

No broker login, verifier login, production bucket, scheduler, worker host, consent provider, SMTP change, entry URL or permission activation was provisioned. The two NOLOGIN roles are separate trust boundaries, with no direct table access or RLS bypass. Deployment must grant the broker and independent verifier different, reviewed credentials. Never share either with clients.

## Test evidence

See [evidence](evidence/), the [tested source manifest](evidence/source-manifest.json), and [screenshots](../screenshots/participation-runtime/). The integrated run has 68 Node tests and six Python tests, all passing with zero skips. It includes real isolated PostgreSQL, HTTP, sandboxed image decoding, Supabase Storage API, GoTrue Auth and PostgREST. Synthetic verification receipts are test fixtures, not real parental consent. Local password and magic-link token validation passed; no production sign-in or email delivery was tested.

Read-only verification passes for all 72 public tables, RLS, inherited table/column/function privileges and 156 security-definer functions. Broker/verifier exact allowlists have separate tests. Catalog counts remain 25 products, 83 places, 189 leads. All 36 age/capability readiness gates are OFF, cutover and public photo publication OFF, runtime entry URL unset.

The new browser path and existing release browser flows pass at 390px and 1280px with no console errors or horizontal scrolling. New controls meet 44px touch targets, reduced motion is checked, and the private client makes no external font/script/map/analytics calls. Screenshots show account controls, discovery, stock, VS, food evidence, private crews, anonymous public takes, weekly results and moderation. These new layouts still need human design review against the Main, Spot, Showdown, Take and Badges mockups. Browser emulation is not actual phone testing.

## Remaining release gates

1. **Consent and law:** choose and review an adequate independent consent/age-assurance method and notices for each purpose and age group. Wire the separate verifier role to that approved method. Fixtures and a working receipt API do not verify a real parent or prevent every duplicate identity. Approve private group/public disclosure rules and an abuse-resistant invitation process. Publish lawyer-reviewed terms, privacy, deletion/retention and DMCA contacts; existing drafts remain drafts. No legal conclusion is made here.
2. **Hosting and operations:** approve a concrete hosting and cost plan for the broker, private worker launcher and scheduled cleanup/erasure. Static GitHub Pages cannot execute these services. Configure isolated credentials, TLS/same-origin routing, private bucket and alerting only after approval. Queue ceilings are proposed at 100 pending/reserved photos and 200 pending texts, never automatic publication. Staff moderation, appeals, incidents, absence coverage and overdue-purge response before inviting users.
3. **Identity cutover:** review migration ordering against the real applied history without applying anything. Preserve verified existing accounts; do not invent age bands or consent. Configure the reviewed runtime entry URL and enable only reviewed capabilities. Legacy write APIs intentionally fail closed after cutover. Do not advertise an adult-only release as satisfying the all-age directive.
4. **Device and privacy review:** test actual iPhone/Android cameras, orientation, large images, mobile interruptions and accessibility. JPEG/PNG/WebP are supported; HEIC-only uploads are rejected and require a supported camera output or separately reviewed codec. Broader legacy map/CDN behavior still needs privacy review. The new private catalog avoids those requests; it does not rewrite every legacy screen.
5. **Deletion and recovery:** approve retention periods, purpose-bound private price ownership, encrypted independent deletion-journal storage and backup expiry. Proposed 30-day tombstones require a compatible backup lifetime and review. Local restore replay passed; production restore, scheduler durability, multi-instance admission controls and incident drills remain unproven. Keep production participation off until those tests pass.
6. **Data and final approval:** verify the real catalog and place links; photos and store leads are not stock/allergen claims. Obtain separate explicit approval for migrations/configuration, merges, deployment and the invitation pilot. No production changes are implied by this candidate.

## Review and rollback

Before activation, rehearse the full existing plus new migration stack on a restored isolated copy and compare row counts, permissions and old frontend behavior. Back up both database and private objects, plus the independent erasure journal. Roll back participation by closing readiness/publication gates and routing to the held screen, not by deleting contributor data or reopening legacy writes for converted accounts. Keep safety/export/deletion workers operating. A destructive down migration is intentionally absent. Reconcile deletion journal entries before reopening a restored copy.

No app LLM calls, paid services or production credentials were used for these tests. Existing GitHub access was used only to publish a review branch and draft PR. No new account access was requested.
