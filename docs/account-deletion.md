# Account deletion design

The account screen sends the user's bearer token to a Supabase Edge Function. The function verifies the token with Supabase Auth, derives the account ID on the server, and requests deletion through the Auth admin API. Its service role credential lives in the server environment. The request accepts no target account ID. Require fresh authentication before the final confirmation and rate limit the endpoint. Use the database foreign keys to remove personal rows and test every table before enabling deletion. Expire local sessions after a successful response.

The account screen explains that deletion is pending deployment. Enable the action after review of how to handle abuse records, pending appeals and any legal preservation requests. Test using disposable accounts on a separate project before launch.
