-- 0003: RLS performance, per the Supabase performance advisor (2026-09-08).
--
-- 1. auth.uid() written bare inside a policy is re-evaluated for every row;
--    (select auth.uid()) is evaluated once per query.
-- 2. The *_write policies were `for all`, which also covers SELECT, so every
--    signed-in read ran two permissive SELECT policies. Writes are now split
--    into insert / update / delete, and SELECT is governed by *_read alone.
-- 3. Foreign keys get covering indexes.
--
-- Semantics are unchanged: anyone reads routes, stops and variants; only the
-- owner writes; gps_session is private to its owner.

-- ---------------------------------------------------------------- route
drop policy if exists route_write on route;
create policy route_insert on route for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy route_update on route for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy route_delete on route for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- -------------------------------------------------------- route_variant
drop policy if exists route_variant_write on route_variant;
create policy route_variant_insert on route_variant for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy route_variant_update on route_variant for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy route_variant_delete on route_variant for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------- stop
drop policy if exists stop_write on stop;
create policy stop_insert on stop for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy stop_update on stop for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy stop_delete on stop for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------- gps_session
drop policy if exists gps_session_read on gps_session;
drop policy if exists gps_session_write on gps_session;
create policy gps_session_select on gps_session for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy gps_session_insert on gps_session for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy gps_session_update on gps_session for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy gps_session_delete on gps_session for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------- route_stop
-- No owner_id of its own; ownership comes from the variant it belongs to.
drop policy if exists route_stop_write on route_stop;
create policy route_stop_insert on route_stop for insert to authenticated
  with check (exists (
    select 1 from route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));
create policy route_stop_update on route_stop for update to authenticated
  using (exists (
    select 1 from route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));
create policy route_stop_delete on route_stop for delete to authenticated
  using (exists (
    select 1 from route_variant v
    where v.id = route_stop.route_variant_id and v.owner_id = (select auth.uid())
  ));

-- -------------------------------------------------------------- indexes
create index if not exists route_owner_id_idx on route (owner_id);
create index if not exists route_variant_owner_id_idx on route_variant (owner_id);
create index if not exists stop_owner_id_idx on stop (owner_id);
create index if not exists gps_session_owner_id_idx on gps_session (owner_id);
create index if not exists gps_session_route_variant_id_idx on gps_session (route_variant_id);
create index if not exists route_stop_stop_id_idx on route_stop (stop_id);
