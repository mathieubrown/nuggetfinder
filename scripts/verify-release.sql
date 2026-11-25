-- Read only. Run after the approved migration batch, with an administrator connection.
-- Any false/denied expectation below blocks frontend deployment.
begin read only;
select 'catalog' as check_name,
 (select count(*) from public.products) products,
 (select count(*) from public.places) places,
 (select count(*) from public.place_products) place_products;
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select r.role,t.tablename,
 has_table_privilege(r.role,'public.'||quote_ident(t.tablename),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as unexpected_write,
 has_table_privilege(r.role,'public.'||quote_ident(t.tablename),'SELECT') as table_select
from pg_tables t cross join (values('anon'),('authenticated')) r(role)
where t.schemaname='public' order by t.tablename,r.role;
select r.role,a.attname,
 has_column_privilege(r.role,'public.profiles',a.attname,'SELECT') readable
from pg_attribute a cross join (values('anon'),('authenticated')) r(role)
where a.attrelid='public.profiles'::regclass and a.attnum>0 and not a.attisdropped
order by r.role,a.attnum;
select tablename,policyname,cmd from pg_policies where schemaname='public' order by tablename,policyname;
select p.oid::regprocedure function_name,p.prosecdef security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
from pg_proc p where p.pronamespace='public'::regnamespace order by p.proname,p.oid;
select r.role,has_schema_privilege(r.role,'public','CREATE') unexpected_create
from (values('anon'),('authenticated')) r(role);
rollback;
