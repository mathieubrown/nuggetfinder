begin;
-- Remove inherited legacy grants, including TRUNCATE, which bypasses row security.
revoke all on public.profiles,public.reports,public.blocked_handle_terms from public,anon,authenticated;
grant select(id,handle,handle_set,created_at) on public.profiles to anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke create on schema public from public,anon,authenticated;

-- Both map and product observations must honor moderation's temporary posting lock.
-- Retain the existing serialized cooldown, two-person trust and daily-limit rules.
create or replace function public.enforce_report_limits()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile public.profiles;
begin
 select * into profile from public.profiles where id=new.user_id for update;
 if not found then raise exception 'sign_in_required'; end if;
 if profile.banned then raise exception 'banned'; end if;
 if not profile.age_confirmed then raise exception 'age_required'; end if;
 if profile.posting_locked_until>clock_timestamp() then raise exception 'posting_locked'; end if;
 new.created_at:=clock_timestamp();
 if exists(
  select 1 from public.reports where user_id=new.user_id and place_id=new.place_id and created_at>new.created_at-interval '10 minutes'
  union all
  select 1 from public.stock_reports where user_id=new.user_id and place_id=new.place_id and created_at>new.created_at-interval '10 minutes'
 ) then raise exception 'cooldown'; end if;
 if (select count(*) from public.reports where user_id=new.user_id and created_at>new.created_at-interval '24 hours')+
    (select count(*) from public.stock_reports where user_id=new.user_id and created_at>new.created_at-interval '24 hours')>=60
 then raise exception 'daily_limit'; end if;
 return new;
end $$;
revoke execute on function public.enforce_report_limits() from public,anon,authenticated;

-- A browser retry reuses the same random request ID, never creating a second take or price.
create table public.submission_receipts (
 user_id uuid not null references public.profiles on delete cascade,
 request_id uuid not null,
 kind text not null check(kind in ('take','price')),
 payload_hash text not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.submission_receipts enable row level security;
revoke all on public.submission_receipts from public,anon,authenticated;
create function public.submit_take_request(p_request uuid,p_kind text,p_ref text,p_body text,p_stamp text default null,
 p_parent bigint default null,p_tagged uuid default null,p_place text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=public.require_social_user(); prior public.submission_receipts;
 fingerprint text:=md5(jsonb_build_array(p_kind,p_ref,p_body,p_stamp,p_parent,p_tagged,p_place)::text);
 outcome jsonb;
begin
 if p_request is null then raise exception 'request_required'; end if;
 select * into prior from public.submission_receipts where user_id=actor and request_id=p_request;
 if found then
  if prior.kind<>'take' or prior.payload_hash<>fingerprint then raise exception 'request_mismatch'; end if;
  return prior.result;
 end if;
 outcome:=public.submit_context_take(p_kind,p_ref,p_body,p_stamp,p_parent,p_tagged,p_place);
 insert into public.submission_receipts(user_id,request_id,kind,payload_hash,result)
 values(actor,p_request,'take',fingerprint,outcome);
 return outcome;
end $$;
create function public.submit_price_request(p_request uuid,p_place text,p_product text,p_price numeric,p_quantity numeric,p_unit text)
returns void language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=public.require_social_user(); prior public.submission_receipts;
 fingerprint text:=md5(jsonb_build_array(p_place,p_product,p_price,p_quantity,p_unit)::text);
begin
 if p_request is null then raise exception 'request_required'; end if;
 select * into prior from public.submission_receipts where user_id=actor and request_id=p_request;
 if found then
  if prior.kind<>'price' or prior.payload_hash<>fingerprint then raise exception 'request_mismatch'; end if;
  return;
 end if;
 perform public.submit_price(p_place,p_product,p_price,p_quantity,p_unit);
 insert into public.submission_receipts(user_id,request_id,kind,payload_hash,result)
 values(actor,p_request,'price',fingerprint,'null'::jsonb);
end $$;
alter function public.export_discovery_data() rename to export_before_receipts;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sign_in_required'; end if;
 return public.export_before_receipts() || jsonb_build_object('submission_receipts',coalesce(
 (select jsonb_agg(r) from public.submission_receipts r where user_id=auth.uid()),'[]'::jsonb));
end $$;
revoke execute on function public.export_before_receipts() from public,anon,authenticated;
revoke execute on function public.submit_take_request(uuid,text,text,text,text,bigint,uuid,text),
 public.submit_price_request(uuid,text,text,numeric,numeric,text),public.export_discovery_data() from public,anon,authenticated;
grant execute on function public.submit_take_request(uuid,text,text,text,text,bigint,uuid,text),
 public.submit_price_request(uuid,text,text,numeric,numeric,text),public.export_discovery_data() to authenticated;

-- Serialize username choices before checking the 30-day cooldown.
create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h text := lower(btrim(coalesce(p_handle, '')));
  squashed text := replace(public.moderation_words(h), ' ', '');
  prof public.profiles;
begin
  if uid is null then raise exception 'sign_in_required'; end if;
  select * into prof from public.profiles where id = uid for update;
  if not found then raise exception 'sign_in_required'; end if;
  if prof.banned then raise exception 'banned'; end if;

  if h !~ '^[a-z0-9_]{3,20}$' then raise exception 'handle_invalid'; end if;

  -- Keeping the same name is always fine.
  if h = lower(prof.handle) then
    update public.profiles set handle_set = true where id = uid;
    return h;
  end if;

  -- After choosing once, a change is allowed every 30 days.
  if prof.handle_set and prof.handle_changed_at is not null
     and prof.handle_changed_at > now() - interval '30 days' then
    raise exception 'handle_cooldown';
  end if;

  -- Reserved words, and the auto-generated pattern so nobody squats on it.
  if exists (select 1 from unnest(array['admin','moderator','nuggetfinder','support','staff','official','verified']) word
          where strpos(squashed, word) > 0)
     or h ~ '^nugget([0-9a-f]{6}|[0-9a-f]{14})$' then
    raise exception 'handle_reserved';
  end if;

  if exists (
    select 1 from public.blocked_handle_terms t
    cross join lateral (select replace(public.moderation_words(t.term), ' ', '') as term) normalized
    where case when char_length(normalized.term) >= 4
      then strpos(squashed, normalized.term) > 0
      else public.moderation_words(t.term) = any(
        array(select public.moderation_words(part) from unnest(string_to_array(h, '_')) parts(part))
      ) and normalized.term <> ''
    end
  ) then
    raise exception 'handle_blocked';
  end if;

  begin
    update public.profiles
       set handle = h, handle_set = true, handle_changed_at = now()
     where id = uid;
  exception when unique_violation then
    raise exception 'handle_taken';
  end;
  return h;
end;
$$;


commit;
