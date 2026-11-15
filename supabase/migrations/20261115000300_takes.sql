begin;
create table public.takes (
 id bigint generated always as identity primary key,
 author_id uuid not null references public.profiles on delete cascade,
 subject_kind text not null check (subject_kind in ('place','product','matchup')),
 subject_ref text not null,
 body text not null check (char_length(body) between 1 and 280),
 status text not null check (status in ('pending','published','hidden')),
 created_at timestamptz not null default now()
);
create index takes_author_time on public.takes(author_id,created_at desc);
create table public.blocked_terms (term text primary key check(char_length(btrim(term))>0));
alter table public.takes enable row level security;
alter table public.blocked_terms enable row level security;
revoke all on public.takes,public.blocked_terms from public,anon,authenticated;

create function public.social_subject_exists(p_kind text,p_ref text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_kind when 'place' then exists(select 1 from public.places where id=p_ref)
 when 'product' then exists(select 1 from public.products where id=p_ref) else false end
$$;
create function public.social_text_blocked(p_body text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocked_terms where public.contains_moderation_term(p_body,term))
$$;
create function public.submit_take(p_kind text,p_ref text,p_body text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user(); take_id bigint; visibility text;
begin
 p_body:=btrim(p_body);
 if p_body is null or char_length(p_body) not between 1 and 280 or not public.social_subject_exists(p_kind,p_ref)
 then raise exception 'invalid_take'; end if;
 if (select count(*) from public.takes where author_id=actor and created_at>now()-interval '24 hours') >= 10
 then raise exception 'take_limit'; end if;
 visibility:=case when public.social_text_blocked(p_body) then 'hidden'
 when exists(select 1 from public.takes where author_id=actor and status='published') then 'published'
 else 'pending' end;
 insert into public.takes(author_id,subject_kind,subject_ref,body,status)
 values(actor,p_kind,p_ref,p_body,visibility) returning id into take_id;
 if visibility<>'published' then
  insert into public.moderation_queue(reporter_id,kind,content_ref,ai_label)
  values(actor,'take',take_id::text,case when visibility='hidden' then 'blocked_term' end);
 end if;
 return visibility;
end $$;

create function public.moderation_content(p_kind text,p_ref text)
returns jsonb language sql stable security definer set search_path='' as $$
 select case p_kind
 when 'take' then (select jsonb_build_object('body',body,'subject_id',author_id) from public.takes where id::text=p_ref)
 when 'username' then (select jsonb_build_object('body',handle,'subject_id',id) from public.profiles where id::text=p_ref)
 end
$$;
create function public.sync_content_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='take' and new.status in ('approve','hide') then
  update public.takes set status=case new.status when 'approve' then 'published' else 'hidden' end
  where id::text=new.content_ref;
 end if;
 return new;
end $$;
create trigger moderation_review after update of status on public.moderation_queue
for each row execute function public.sync_content_review();

create or replace function public.moderation_inbox()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_nugget_moderator();
 return jsonb_build_object(
 'queue',coalesce((select jsonb_agg(to_jsonb(q)||coalesce(public.moderation_content(q.kind,q.content_ref),'{}'))
  from (select id,kind,content_ref,flagged_at from public.moderation_queue where status='pending' order by id limit 100) q),'[]'),
 'appeals',coalesce((select jsonb_agg(a) from (select strike_id,reason from public.strike_appeals where decision is null order by created_at limit 100) a),'[]'));
end $$;
create or replace function public.report_content(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_social_user(); report_id bigint;
begin
 if not coalesce((p_kind='username' and exists(select 1 from public.profiles where id::text=p_ref))
 or (p_kind='take' and exists(select 1 from public.takes where id::text=p_ref and status='published')),false)
 then raise exception 'invalid_content'; end if;
 if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours') >= 20
 then raise exception 'report_limit'; end if;
 insert into public.content_reports(reporter_id,kind,content_ref,reason)
 values(actor,p_kind,p_ref,p_reason) on conflict do nothing returning id into report_id;
 if report_id is not null then
  insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,p_kind,p_ref);
 end if;
end $$;

create function public.export_wave2_take_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('takes',coalesce((select jsonb_agg(t) from public.takes t where author_id=auth.uid()),'[]'))
$$;
revoke execute on function public.social_subject_exists(text,text),public.social_text_blocked(text),public.moderation_content(text,text),public.sync_content_review() from public,anon,authenticated;
revoke execute on function public.submit_take(text,text,text),public.export_wave2_take_data() from public,anon;
grant execute on function public.submit_take(text,text,text),public.export_wave2_take_data() to authenticated;
commit;
