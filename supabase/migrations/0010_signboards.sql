-- ParaPo — a direction's signboards, as pictures
--
-- The owner's ask, 2026-10-01: "in studio, per route, papunta and balikan
-- is there a way that I could upload signboard in svg format", shown on the
-- trip card under its tiles (Figma RouteTripDetail, 3778:3183). The owner's
-- yes to applying it came the same day.
--
-- `route.signboard` stays: the words, one for the route. These are the boards
-- themselves, per direction — the jeep going there and the one coming back
-- show different ones — in the order the editor put them. Each is an object
-- name in the `signboards` bucket ("<uuid>.svg"); the publish copies them
-- beside the map's own files (public/data/signboards/), so the public map
-- never reads the bucket.
--
-- Additive, with a default and no rewrite: reversible with
--   alter table route_variant drop column signboards;
--   drop policy ... on storage.objects (the four below);
--   delete from storage.buckets where id = 'signboards';
-- (after emptying it). The column is read and written as the row's others
-- are, under route_variant's policies (0005).

alter table route_variant
  add column signboards text[] not null default '{}';

comment on column route_variant.signboards is
  'Object names in the signboards bucket, in order: the boards this direction shows.';

-- ----------------------------------------------------------------- bucket
-- Public, as the tables are: anyone may read a board. SVG only, and small —
-- a signboard is a few shapes and words; 100 kB is far past one. The studio
-- cleans each file before it is sent (shared/model/signboardSvg.ts) and the
-- publish cleans it again before it lands on the map's own domain.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signboards', 'signboards', true, 102400, array['image/svg+xml']);

-- Only an editor writes. As in 0005, (select ...) evaluates once a statement.
-- The public URL reads past these; the storage API's delete and upsert read
-- the row first, so an editor may read it there too.
create policy signboards_select on storage.objects
  for select to authenticated
  using (bucket_id = 'signboards' and (select private.is_editor()));

create policy signboards_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signboards' and (select private.is_editor()));

create policy signboards_update on storage.objects
  for update to authenticated
  using (bucket_id = 'signboards' and (select private.is_editor()))
  with check (bucket_id = 'signboards' and (select private.is_editor()));

create policy signboards_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'signboards' and (select private.is_editor()));
