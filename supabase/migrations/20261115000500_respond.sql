begin;
create table public.take_reactions (
 take_id bigint references public.takes on delete cascade,
 user_id uuid references public.profiles on delete cascade,
 reaction text not null check(reaction in ('with','against')),
 updated_at timestamptz not null default now(),
 primary key(take_id,user_id)
);
create table public.take_replies (
 id bigint generated always as identity primary key,
 take_id bigint not null references public.takes on delete cascade,
 author_id uuid not null references public.profiles on delete cascade,
 body text not null check(char_length(body) between 1 and 180),
 status text not null check(status in ('pending','hidden','published')),
 created_at timestamptz not null default now()
);
create index take_replies_author_time on public.take_replies(author_id,created_at desc);
alter table public.take_reactions enable row level security;
alter table public.take_replies enable row level security;
revoke all on public.take_reactions,public.take_replies from public,anon,authenticated;

create function public.take_visible(p_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.takes t join public.profiles p on p.id=t.author_id and not p.banned
 where t.id=p_id and t.status='published' and not exists(select 1 from public.user_blocks b where
 (b.user_id=auth.uid() and b.blocked_id=t.author_id) or (b.blocked_id=auth.uid() and b.user_id=t.author_id)))
$$;
create function public.respond_take(p_take bigint,p_reaction text default null,p_body text default null)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user(); reply_id bigint; visibility text;
begin
 if not public.take_visible(p_take) then raise exception 'take_unavailable'; end if;
 if p_reaction in ('with','against') and p_body is null then
  if exists(select 1 from public.takes where id=p_take and author_id=actor) then
   raise exception 'cannot_react_to_own_take';
  end if;
  if (select count(*) from public.take_reactions where user_id=actor and updated_at>now()-interval '24 hours')>=60
  then raise exception 'reaction_limit'; end if;
  insert into public.take_reactions(take_id,user_id,reaction) values(p_take,actor,p_reaction)
  on conflict(take_id,user_id) do update set reaction=excluded.reaction,updated_at=now()
  where public.take_reactions.updated_at<=now()-interval '5 seconds';
  if not found then raise exception 'reaction_cooldown'; end if;
  return 'saved';
 end if;
 if p_reaction is not null or p_body is null or char_length(btrim(p_body)) not between 1 and 180 then raise exception 'invalid_reply'; end if;
 if (select count(*) from public.take_replies where author_id=actor and created_at>now()-interval '24 hours')>=15
 then raise exception 'reply_limit'; end if;
 visibility:=case when public.social_text_blocked(p_body) then 'hidden' else 'pending' end;
 insert into public.take_replies(take_id,author_id,body,status)
 values(p_take,actor,btrim(p_body),visibility) returning id into reply_id;
 insert into public.moderation_queue(reporter_id,kind,content_ref,ai_label)
 values(actor,'reply',reply_id::text,case when visibility='hidden' then 'blocked_term' end);
 return visibility;
end $$;

create function public.take_responses(p_take bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.take_visible(p_take) then jsonb_build_object(
 'with',(select count(*) from public.take_reactions r join public.profiles p on p.id=r.user_id and not p.banned where r.take_id=p_take and r.reaction='with'),
 'against',(select count(*) from public.take_reactions r join public.profiles p on p.id=r.user_id and not p.banned where r.take_id=p_take and r.reaction='against'),
 'mine',(select reaction from public.take_reactions where take_id=p_take and user_id=auth.uid()),
 'replies',coalesce((select jsonb_agg(x) from (
 select r.id,r.author_id,p.handle,r.body from public.take_replies r
 join public.profiles p on p.id=r.author_id and not p.banned
 where r.take_id=p_take and r.status='published' and not exists(select 1 from public.user_blocks b where
 (b.user_id=auth.uid() and b.blocked_id=r.author_id) or (b.blocked_id=auth.uid() and b.user_id=r.author_id))
 order by r.id desc limit 30) x),'[]')) end
$$;
create or replace function public.take_heat(p_take bigint)
returns integer language sql stable set search_path='' as $$
 select count(*)::int from public.take_reactions r
 join public.profiles p on p.id=r.user_id and not p.banned
 where r.take_id=p_take and r.updated_at>now()-interval '7 days'
$$;
create or replace function public.moderation_content(p_kind text,p_ref text)
returns jsonb language sql stable security definer set search_path='' as $$
 select case p_kind
 when 'reply' then (select jsonb_build_object('body',body,'subject_id',author_id) from public.take_replies where id::text=p_ref)
 when 'take' then (select jsonb_build_object('body',body,'subject_id',author_id) from public.takes where id::text=p_ref)
 when 'username' then (select jsonb_build_object('body',handle,'subject_id',id) from public.profiles where id::text=p_ref)
 end
$$;
create or replace function public.sync_content_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare visibility text:=case new.status when 'approve' then 'published' else 'hidden' end;
begin
 if new.kind='take' and new.status in ('approve','hide') then update public.takes set status=visibility where id::text=new.content_ref; end if;
 if new.kind='reply' and new.status in ('approve','hide') then update public.take_replies set status=visibility where id::text=new.content_ref; end if;
 return new;
end $$;
create or replace function public.report_content(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user(); report_id bigint;
begin
 if not coalesce((p_kind='username' and exists(select 1 from public.profiles where id::text=p_ref))
 or (p_kind='take' and exists(select 1 from public.takes where id::text=p_ref and public.take_visible(id)))
 or (p_kind='reply' and exists(select 1 from public.take_replies where id::text=p_ref and status='published' and public.take_visible(take_id))),false)
 then raise exception 'invalid_content'; end if;
 if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=20
 then raise exception 'report_limit'; end if;
 insert into public.content_reports(reporter_id,kind,content_ref,reason) values(actor,p_kind,p_ref,p_reason)
 on conflict do nothing returning id into report_id;
 if report_id is not null then insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,p_kind,p_ref); end if;
end $$;
create or replace function public.export_wave2_take_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'takes',coalesce((select jsonb_agg(t) from public.takes t where author_id=auth.uid()),'[]'),
 'following',coalesce((select jsonb_agg(f.followed_id) from public.user_follows f where user_id=auth.uid()),'[]'),
 'replies',coalesce((select jsonb_agg(r) from public.take_replies r where author_id=auth.uid()),'[]'),
 'reactions',coalesce((select jsonb_agg(r) from public.take_reactions r where user_id=auth.uid()),'[]'))
$$;
revoke execute on function public.take_visible(bigint),public.respond_take(bigint,text,text),public.take_responses(bigint) from public,anon,authenticated;
grant execute on function public.respond_take(bigint,text,text) to authenticated;
grant execute on function public.take_responses(bigint) to anon,authenticated;
commit;
