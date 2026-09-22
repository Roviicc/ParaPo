-- ParaPo — a route's two ends, and a direction that exists before its line
--
-- Decided 2026-09-21; see "Naming and creating a route" in PLAN.md.
--
-- A route's name is no longer typed. It is generated from the hotspots at its
-- two ends — `Tala – SM Fairview` — so renaming a hotspot renames every route
-- through it, and a name cannot drift from the map. `via` separates two routes
-- that share both ends by different roads (the kanan/kaliwa case).
--
-- The route table is empty, so the columns are required from the start rather
-- than added nullable and backfilled.

alter table route
  add column head_stop_id uuid not null references stop (id),
  add column tail_stop_id uuid not null references stop (id),
  add column via text;

-- Two routes may share a pair of ends only when `via` tells them apart. Nulls
-- never collide in a unique index, so `via` is folded to '' for the comparison
-- — otherwise "no via" would be free to repeat, which is the case that matters.
create unique index route_ends_unique
  on route (head_stop_id, tail_stop_id, coalesce(via, ''));

-- The generated name now carries what the signboard used to: being the thing
-- that makes a route recognisable. So the signboard goes back to being what it
-- really is — an observed fact, in the jeep's own words, filled in when the
-- owner is sure of it. Deferred 2026-09-21: "that one is really informal".
alter table route alter column signboard drop not null;

-- A direction is which way round the route is ridden. That is a flag, not a
-- name, so the name is generated from the ends like the route's own.
--
-- `direction_name` stays as a column and stops being written: dropping it now
-- would break the published file's shape before the card that reads it has
-- been rebuilt (slice 2). It goes when that lands.
alter table route_variant
  add column reversed boolean not null default false;

alter table route_variant alter column direction_name drop not null;

-- Exactly two directions per route, enforced rather than promised. M10's short
-- turns will need this relaxed to "two full directions, plus any number of
-- windows onto them" — a partial index on parent_variant_id is null.
alter table route_variant
  drop constraint if exists route_variant_route_id_direction_name_key;

create unique index route_variant_one_per_direction
  on route_variant (route_id, reversed);
