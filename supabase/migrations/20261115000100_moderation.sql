begin;
alter table public.profiles add column is_moderator boolean not null default false;
alter table public.profiles add column posting_locked_until timestamptz;

create table public.moderation_queue (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 reporter_id uuid references public.profiles on delete set null,
 kind text not null, content_ref text not null, transcript text,
 ai_label text, ai_confidence real check (ai_confidence between 0 and 1),
 flagged_at timestamptz not null default now(),
 status text not null default 'pending' check (status in ('pending','approve','hide')),
 reviewed_by uuid references public.profiles on delete set null, reviewed_at timestamptz
);
create table public.moderation_strikes (
 id bigint generated always as identity primary key,
 subject_id uuid not null references public.profiles on delete cascade,
 moderator_id uuid references public.profiles on delete set null,
 action text not null check (action in ('warning','24h','7d','ban')),
 created_at timestamptz not null default now(),
 reversed_at timestamptz
);
create table public.strike_appeals (
 strike_id bigint primary key references public.moderation_strikes on delete cascade,
 reason text not null check (char_length(reason) between 1 and 500),
 created_at timestamptz not null default now(),
 decision text check (decision in ('uphold','reverse')),
 reviewed_by uuid references public.profiles on delete set null
);
create table public.user_blocks (
 user_id uuid references public.profiles on delete cascade,
 blocked_id uuid references public.profiles on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,blocked_id), check(user_id <> blocked_id)
);
create table public.content_reports (
 id bigint generated always as identity primary key,
 reporter_id uuid not null references public.profiles on delete cascade,
 kind text not null check (kind in ('username','take','reply')),
 content_ref text not null,
 reason text not null check (reason in ('abuse','spam','other')),
 created_at timestamptz not null default now(),
 unique(reporter_id,kind,content_ref)
);
alter table public.moderation_queue enable row level security;
alter table public.moderation_strikes enable row level security;
alter table public.strike_appeals enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
revoke all on public.moderation_queue,public.moderation_strikes,public.strike_appeals,public.user_blocks,public.content_reports from public,anon,authenticated;
revoke insert,update,delete on public.profiles from public,anon,authenticated;

create function public.is_nugget_moderator()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and is_moderator and not banned)
$$;
create function public.require_nugget_moderator()
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.is_nugget_moderator() then raise exception 'moderator_required'; end if;
 return auth.uid();
end $$;
create function public.require_social_user()
returns uuid language plpgsql security definer set search_path='' as $$
declare profile public.profiles;
begin
 select * into profile from public.profiles where id=auth.uid() for update;
 if not found then raise exception 'sign_in_required'; end if;
 if profile.banned or not profile.age_confirmed then raise exception 'posting_unavailable'; end if;
 if profile.posting_locked_until > now() then raise exception 'posting_locked'; end if;
 return profile.id;
end $$;

create function public.set_user_block(p_user uuid,p_block boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_social_user();
begin
 if p_block then
  if (select count(*) from public.user_blocks where user_id=actor) >= 500 then raise exception 'block_limit'; end if;
  insert into public.user_blocks(user_id,blocked_id) values(actor,p_user) on conflict do nothing;
 else
  delete from public.user_blocks where user_id=actor and blocked_id=p_user;
 end if;
end $$;

create function public.report_content(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_social_user(); report_id bigint;
begin
 if not coalesce(p_kind='username' and exists(select 1 from public.profiles where id::text=p_ref),false)
 then raise exception 'invalid_content'; end if;
 if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours') >= 20
 then raise exception 'report_limit'; end if;
 insert into public.content_reports(reporter_id,kind,content_ref,reason)
 values(actor,p_kind,p_ref,p_reason) on conflict do nothing returning id into report_id;
 if report_id is not null then
  insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,p_kind,p_ref);
 end if;
end $$;

create function public.moderation_inbox()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_nugget_moderator();
 return jsonb_build_object(
 'queue',coalesce((select jsonb_agg(q) from (select id,kind,content_ref,flagged_at from public.moderation_queue where status='pending' order by id limit 100) q),'[]'),
 'appeals',coalesce((select jsonb_agg(a) from (select strike_id,reason from public.strike_appeals where decision is null order by created_at limit 100) a),'[]'));
end $$;

create function public.review_content(p_id bigint,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_nugget_moderator();
begin
 if p_decision is null or p_decision not in ('approve','hide') then raise exception 'invalid_decision'; end if;
 update public.moderation_queue set status=p_decision,reviewed_by=actor,reviewed_at=now(),transcript=null
 where id=p_id and status='pending';
 if not found then raise exception 'review_unavailable'; end if;
end $$;

create function public.refresh_strike_status(p_user uuid)
returns void language sql security definer set search_path='' as $$
 update public.profiles set
 strikes=(select count(*) from public.moderation_strikes where subject_id=p_user and reversed_at is null),
 banned=exists(select 1 from public.moderation_strikes where subject_id=p_user and action='ban' and reversed_at is null),
 posting_locked_until=(select max(created_at+case action when '24h' then interval '24 hours' when '7d' then interval '7 days' end)
  from public.moderation_strikes where subject_id=p_user and reversed_at is null)
 where id=p_user;
$$;

create function public.issue_strike(p_user uuid)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_nugget_moderator(); next_action text;
begin
 perform 1 from public.profiles where id=p_user and not is_moderator and not banned for update;
 if not found then raise exception 'account_unavailable'; end if;
 select case count(*) when 0 then 'warning' when 1 then '24h' when 2 then '7d' else 'ban' end into next_action
 from public.moderation_strikes where subject_id=p_user and reversed_at is null;
 insert into public.moderation_strikes(subject_id,moderator_id,action) values(p_user,actor,next_action);
 perform public.refresh_strike_status(p_user);
 return next_action;
end $$;
create function public.my_strikes()
returns table (id bigint, action text, created_at timestamptz, decision text)
language sql stable security definer set search_path='' as $$
 select s.id,s.action,s.created_at,a.decision from public.moderation_strikes s
 left join public.strike_appeals a on a.strike_id=s.id where s.subject_id=auth.uid()
 order by s.created_at desc
$$;
create function public.appeal_strike(p_id bigint,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.moderation_strikes where id=p_id and subject_id=auth.uid() and reversed_at is null)
 then raise exception 'strike_unavailable'; end if;
 insert into public.strike_appeals(strike_id,reason) values(p_id,btrim(p_reason));
end $$;
create function public.review_appeal(p_id bigint,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := public.require_nugget_moderator(); subject uuid;
begin
 if p_decision is null or p_decision not in ('uphold','reverse') then raise exception 'invalid_decision'; end if;
 select subject_id into subject from public.moderation_strikes where id=p_id;
 perform 1 from public.profiles where id=subject for update;
 update public.strike_appeals set decision=p_decision,reviewed_by=actor where strike_id=p_id and decision is null;
 if not found then raise exception 'appeal_unavailable'; end if;
 if p_decision='reverse' then
  update public.moderation_strikes set reversed_at=now() where id=p_id;
  perform public.refresh_strike_status(subject);
 end if;
end $$;

create function public.reset_reported_username(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_nugget_moderator();
 update public.profiles set handle='nugget'||substr(replace(id::text,'-',''),1,14),handle_set=false
 where id=p_user and not is_moderator;
 if not found then raise exception 'account_unavailable'; end if;
end $$;

revoke execute on function public.require_nugget_moderator(),public.require_social_user(),public.refresh_strike_status(uuid)
 from public,anon,authenticated;
revoke execute on function public.is_nugget_moderator(),public.set_user_block(uuid,boolean),public.report_content(text,text,text),
 public.moderation_inbox(),public.review_content(bigint,text),public.issue_strike(uuid),public.my_strikes(),
 public.appeal_strike(bigint,text),public.review_appeal(bigint,text),public.reset_reported_username(uuid) from public,anon;
grant execute on function public.is_nugget_moderator(),public.set_user_block(uuid,boolean),public.report_content(text,text,text),
 public.moderation_inbox(),public.review_content(bigint,text),public.issue_strike(uuid),public.my_strikes(),
 public.appeal_strike(bigint,text),public.review_appeal(bigint,text),public.reset_reported_username(uuid) to authenticated;
commit;
