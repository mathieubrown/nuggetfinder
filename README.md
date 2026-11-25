# Nuggetfinder

A crowdsourced map of where the nuggets, tenders and sauces are in San Francisco, South San Francisco and Daly City. Anyone can browse. Sign in to report.

## What is in this repo

- `index.html`: the whole web app (map, filters, reports, sign-in). One file, no build step.
- `supabase/migrations/`: database setup for accounts, shared reports and the agreement rule.
- `design/`: the mockup screens. These are Claude canvas files, so open them in the canvas. They do not render as plain web pages.
- `docs/`: project notes. Export the tally doc as Markdown into this folder.

## Run it locally

Open `index.html` in a browser. Reporting requires the shared database. Offline browsing never creates confirmed status.

For sign-in to work, serve the page over http instead of opening the file directly:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 and add that address to the redirect URLs in Supabase (Authentication, URL Configuration).

## Database changes

Live database changes are held for SQL review. Do not run an unrestricted `supabase db push` against the live project. The current ordered migration batch, local test commands, verification queries and deployment/recovery steps are in [docs/release-readiness.md](docs/release-readiness.md).

## Publish with GitHub Pages

1. In the repo, Settings, Pages, deploy from the `main` branch, root folder.
2. In Supabase, Authentication, URL Configuration: set Site URL to the Pages address and add it to Redirect URLs.

## Keys and secrets

The publishable key inside `index.html` is meant to be public. The database rules protect the data.

Never commit the database password, the `service_role` key, or any `.env` file.

## Where to go next

See the tally doc in `docs/` for decisions, open questions and the roadmap.
