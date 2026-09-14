-- 0005: lock writes to an editor list (build order, step 1).
--
-- Until now every write policy asked one question, "does this row belong to
-- you?", and anyone could make an account: the sign-up API is public and the
-- publishable key ships in the bundle. So any account could put rows of its own
-- on the public map. Sign-ups are off in the dashboard (2026-09-14); this makes
-- the database itself refuse those writes, whatever the auth settings say.
--
-- Every insert, update and delete policy on route, route_variant, stop,
-- route_stop and gps_session now also asks: is the caller on the editor list?
-- The owner checks stay. Reads are unchanged.
--
-- The list and its check live in `private`, a schema the API does not expose.
-- is_editor() must be security definer, so that a policy can consult a table
-- the caller cannot read. Placed in `public` it would also be callable by anyone
-- through /rest/v1/rpc, which Supabase's advisor flags (lints 0028 and 0029).
--
-- The list starts empty, and no uid is written here: the repo is public, and
-- the file should work for any project. Right after applying it, as postgres:
--
--   insert into private.editor (user_id) values ('<uid from auth.users>');
--
-- Until that insert, nobody can write, the owner included.

-- No "if not exists": a `private` schema that already exists may be owned by
-- another role, which could then drop and replace the list. Fail loudly instead.
create schema private;

-- --------------------------------------------------------------- the list

create table private.editor (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- Unreachable through the API already. RLS on with no policies as well, so a
-- mistaken grant or a newly exposed schema still shows nobody anything.
alter table private.editor enable row level security;
revoke all on table private.editor from public, anon, authenticated;

-- -------------------------------------------------------------- the check

-- stable: one answer per statement. search_path is pinned and every name is
-- qualified, so a caller cannot swap in a lookalike table or auth.uid().
create function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.editor where user_id = (select auth.uid())
  );
$$;

-- Policies run as the caller, so signed-in users must be able to reach the
-- check. It answers one question, about the caller alone. Visitors never need
-- it: no write policy applies to anon.
--
-- Postgres makes every new function executable by PUBLIC, and a per-schema
-- default cannot take that away. Any function added here later must revoke it
-- in the same migration, as this one does.
revoke all on function private.is_editor() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_editor() to authenticated;

-- --------------------------------------------------------------- policies
-- Each expression is written out in full, so it reads on its own. As in 0003,
-- (select ...) evaluates a function once per statement instead of per row.

-- route
alter policy route_insert on public.route
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy route_update on public.route
  using ((select auth.uid()) = owner_id and (select private.is_editor()))
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy route_delete on public.route
  using ((select auth.uid()) = owner_id and (select private.is_editor()));

-- route_variant
alter policy route_variant_insert on public.route_variant
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy route_variant_update on public.route_variant
  using ((select auth.uid()) = owner_id and (select private.is_editor()))
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy route_variant_delete on public.route_variant
  using ((select auth.uid()) = owner_id and (select private.is_editor()));

-- stop
alter policy stop_insert on public.stop
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy stop_update on public.stop
  using ((select auth.uid()) = owner_id and (select private.is_editor()))
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy stop_delete on public.stop
  using ((select auth.uid()) = owner_id and (select private.is_editor()));

-- gps_session (its select policy stays owner-only, and needs no list)
alter policy gps_session_insert on public.gps_session
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy gps_session_update on public.gps_session
  using ((select auth.uid()) = owner_id and (select private.is_editor()))
  with check ((select auth.uid()) = owner_id and (select private.is_editor()));
alter policy gps_session_delete on public.gps_session
  using ((select auth.uid()) = owner_id and (select private.is_editor()));

-- route_stop: no owner_id of its own; ownership comes from its variant.
alter policy route_stop_insert on public.route_stop
  with check ((select private.is_editor()) and exists (
    select 1 from public.route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));
alter policy route_stop_update on public.route_stop
  using ((select private.is_editor()) and exists (
    select 1 from public.route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ))
  with check ((select private.is_editor()) and exists (
    select 1 from public.route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));
alter policy route_stop_delete on public.route_stop
  using ((select private.is_editor()) and exists (
    select 1 from public.route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));

-- --------------------------------------------------------------- truncate
-- TRUNCATE empties a table without looking at row-level security at all; only
-- the privilege stands in its way. Supabase grants it to anon and authenticated
-- on every public table, with TRIGGER and REFERENCES, which the API never needs
-- either. No API route sends TRUNCATE today; this makes sure none ever can.
-- SELECT, INSERT, UPDATE and DELETE keep their grants, and RLS still rules them.
revoke truncate, trigger, references on all tables in schema public
  from anon, authenticated;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
