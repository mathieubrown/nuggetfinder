#!/bin/sh
set -eu
# Standard PGHOST, PGPORT, PGUSER, PGDATABASE and PGPASSWORD configure psql.
cd "$(dirname "$0")/.."
psql -X -qAt --set=ON_ERROR_STOP=1 2>/dev/null <<'SQL' || {
begin;
create temporary table import_blocked_terms(term text);
\copy import_blocked_terms from 'data/private/blocked-terms.txt' with (format csv, delimiter E'\t', quote E'\x01')
with terms as (
 select distinct lower(btrim(term)) term from import_blocked_terms
 where btrim(term) <> '' and public.moderation_words(term) <> ''
), add_text as (
 insert into public.blocked_terms(term) select term from terms on conflict do nothing
), add_handles as (
 insert into public.blocked_handle_terms(term) select term from terms on conflict do nothing
)
select count(*) from terms;
commit;
SQL
    printf '%s\n' 'Blocked term import failed.' >&2
    exit 1
}
