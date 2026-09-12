-- ParaPo M6 — hotspots
--
-- A hotspot is a named polygon where people gather to ride or wait. Two kinds:
--   terminal — where a route originates and stages; its route list is
--              hand-picked by the owner, because terminals change with LTFRB
--              memos and local arrangements.
--   hintuan  — where people wait and board along the way; its route list is
--              computed from which route lines pass under the polygon, and
--              re-checked every time a route direction is saved.
--
-- Both lists live in route_stop. stop_sequence is the index of the first
-- route vertex inside (or just before crossing into) the polygon — enough to
-- order hotspots along a route later without another migration.
--
-- `point` stays required and holds the polygon's centroid: a cheap label
-- anchor, and it keeps the M1 shape of the table for anything reading it.
--
-- RLS: stop and route_stop policies from 0003 already cover these columns.

create type stop_kind as enum ('terminal', 'hintuan');

alter table stop
  add column kind stop_kind not null default 'hintuan',
  add column area jsonb,          -- GeoJSON Polygon, closed outer ring
  add column note text;

-- Superseded by `kind`. The table has no rows yet, so nothing to migrate.
alter table stop drop column is_terminal;
