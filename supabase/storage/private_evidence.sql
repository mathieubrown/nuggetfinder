-- UNAPPLIED production configuration. Review separately from the public-schema migrations.
-- The real local Storage API integration test runs this exact SQL after Storage migrations.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nugget-evidence-private','nugget-evidence-private',false,1500000,array['image/jpeg'])
on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='nugget-evidence-private' and not public and file_size_limit=1500000 and allowed_mime_types=array['image/jpeg'])
 then raise exception 'private_evidence_bucket_configuration_conflict';end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects')
 then raise exception 'existing_storage_policies_need_explicit_review';end if;
end $$;
-- Intentionally no anon/authenticated object policies. All access uses the trusted broker.
commit;
