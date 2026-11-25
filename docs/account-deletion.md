# Account deletion design

The account screen sends the user's bearer token to a Supabase Edge Function. The function verifies the token with Supabase Auth, derives the account ID on the server, and requests deletion through the Auth admin API. Its service role credential lives in the server environment. The request accepts no target account ID. Require fresh authentication before the final confirmation and rate limit the endpoint. Use the database foreign keys to remove personal rows and test every table before enabling deletion. Expire local sessions after a successful response.

The account screen explains that deletion is pending deployment. Enable the action after review of how to handle abuse records, pending appeals and any legal preservation requests. Test using disposable accounts on a separate project before launch.

## 2026-11-25 participation and photo extension

The [governing directive](FOUNDER_DIRECTIVE.md) now requires parent-controlled child deletion and photo erasure as well as account deletion. The new private participant/photo foundation queues image erasure when a participant is removed, and lets an owner request photo deletion despite a posting restriction or withdrawn consent. This is groundwork, not a completed deletion service.

The trusted deletion workflow must check requester authority with reauthentication, immediately disable participant sessions and public serving, revoke consent, remove or deidentify all participant contributions under the reviewed preservation policy, purge private variants and pending/rejected/orphan objects, and confirm completion. A parent must be able to delete one child without deleting siblings or the parent's account. Account deletion must cover all managed participants. Export must include the requester's managed profiles, relevant rows and authorized sanitized image bytes without another family's data or private object keys.

An idempotent worker needs retry states for Auth, SQL and Storage failures. Never depend on deleting Auth alone to invalidate a still-valid JWT. Backups need an approved expiry schedule and replay of deletion requests before restored data becomes reachable. The byte purge worker, actual auth/session behavior, child contribution cutover and restore rehearsal remain deployment gates. No service_role key may be present in browser code. Production changes remain held.
