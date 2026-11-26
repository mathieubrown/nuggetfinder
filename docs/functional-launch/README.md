# Functional launch candidate

The review build runs at http://127.0.0.1:4176/ on this Mac. Use Player A or B to suggest a product, report stock, or attach food evidence. Use Moderator to review suggestions and photos. The adult business tester can submit a claim in Business access. The deployed site and its database remain under the existing production hold.

| Work | How to try it | Remaining launch dependency |
|---|---|---|
| Shared player identity | A player connected through family controls or a one-time code can move between map, products, feed, profile and crew. The browser keeps the player credential in tab session storage until expiry, validates it on refresh and revokes it on sign-out. | Review cutover against the applied production history with actual eligible accounts. |
| Shopper reporting | Suggest a product from Where to buy, or connect an existing product to an approved store. After human review, the product can receive stock and price reports. | Verify pilot catalog and store details. |
| Contextual photo flow | Attach evidence from a saved stock report, price entry or take. Place, product, Court, Showdown and trail pages accept contextual images. The separately reviewed menu flow remains available. Approved eligible images appear on related pages. | Actual iPhone and Android cameras, HEIC behavior and interrupted uploads need device tests. Public serving requires the relevant reviewed disclosure and publication gates. |
| Review and status | The verified moderator desk has text, photos, crew, locations, product/listing and claim review, Court rulings and strike appeals. Your submissions shows the review status of takes, photos, places and catalog/claim requests. | Appoint a moderator and backup, and agree on escalation and review coverage. |
| Real onboarding and account controls | The isolated Auth test sends a real magic link through local SMTP, opens it, checks recent authentication and exercises deletion. Admission and consent stay separate. Account deletion returns a private receipt whose lookup exposes only pending/complete. | Approved independent consent/age method, legal notices, real email domain/delivery, invitation operations and approved production settings. |
| Business participation | Verified adult individual accounts request store or brand access. A moderator checks authority out of band and can revoke the claim. Dated business stock reports have a separate label and never cast a community vote or award a point. | Establish authority verification and revocation procedures. Business reporting uses approved product/place pairs and does not provide inventory feeds. |
| Service and jobs | The same-origin candidate service has an isolated startup command, DB health check, local or Supabase private storage wiring, isolated decoder IPC and ongoing cleanup/erasure with a singleton lock. | Approve hosting, select service credentials and observable backups, rehearse with the proposed host, and validate scheduled cleanup and alerts. The command currently accepts only isolated loopback infrastructure. |
| Verification | Integrated PostgreSQL, Auth/SMTP, storage, image-worker and browser tests exercise the app, including established stock quorum and recovery. Screenshots at 390px and 1280px are in the PR. | Run the physical-device and operational checks below before opening invitations. |

## Running the candidate

Use the isolated development setup in [the service README](../../services/participation/README.md). Set a loopback `NUGGETFINDER_LOCAL_PG_URL`, `NUGGETFINDER_BROWSER_ASSETS`, `NUGGETFINDER_LOCAL_BLOBS` and the private worker socket and secret. For real local sign-in point `NUGGETFINDER_LOCAL_AUTH_URL` at a local Supabase gateway with Auth and SMTP configured. Use local credentials through environment variables only. `node services/participation/serve-candidate.cjs` serves the original app and crew on the same origin. `GET /api/health` checks the database read path. The maintenance process reports counts only. Apps running with a shared database serialize maintenance via a database lock. The public browser never receives a service role or privileged database credential.

The review fixture can inject synthetic verified capabilities only in a loopback disposable database. `scripts/isolated-invitation.cjs` admits or withdraws a pre-existing local Auth account. The separate consent verifier must verify the request before a player can be created. On the pilot host, keep the web process, image worker launcher and decoder boundaries. Grant an account for the broker and a separate one for verifying consent. Only the launcher should access the container runtime. Keep deletion receipts private. Schedule database, blob and independent erasure-journal backup and test restore before invitations.

## Ordered SQL for review

- `20261126000200_scoped_app.sql` adds scoped identity, screen, moderation-status and feed projections. It adds photo discovery by context with existing live consent and human review gates. Private authors remain anonymous.
- `20261126000300_catalog_and_business_review.sql` adds private catalog/claim requests and verified business reports, human review and revocation, export coverage and tightly scoped permissions. Business reports remain separate from existing stock confidence.
- `20261126000400_release_service.sql` adds fixed anonymous browse operations for the service, extends verified moderator actions, and adds deletion receipt lookup.

These files follow `20261126000100_places_and_menus.sql`. Earlier migrations and the private storage setup also require the previously requested release review. The production stack has not been merged or migrated.

## Device and release checks

1. Run an invite and real email sign-in on Safari on iPhone and Chrome on Android. Switch between two players and confirm identity after navigation, a failed request, reload and sign-out. Revoke a player and repeat a write from the existing tab.
2. Capture a menu and packaging photo with both cameras. Verify orientation, trimming, opaque redaction, and upload after briefly dropping the network. Test large JPEG, PNG and WebP and document a supported camera route for HEIC where needed. Check screen-reader navigation and touch comfort.
3. Verify that a single stock report stays unconfirmed. Confirm as a second person, expire confidence and review the share card. Confirm business updates appear independently. Review and correct a menu and confirm the withdrawn version no longer serves.
4. Erase an account with saved blobs and verify the receipt changes after physical files and Auth identity are erased. Restore an older database and blob snapshot in isolation and replay erasure before allowing writes.
5. Have counsel review consent, the final legal/contact pages, publishing permissions, staff escalation and retention. Verify the real data sources and set an invitation ceiling matched to actual review capacity.

See [data and budget](DATA_AND_BUDGET.md).
