-- ParaPo — the train lines: LRT-1, LRT-2 and MRT-3
--
-- The owner's ask, 2026-10-02: the three lines on the map, "same design and
-- interaction as our hintuan and route line". A line is a route like any
-- other, its two directions drawn on the track; its stations are hintuans.
-- What makes them a train's:
--
--   * the route's mode, 'lrt' or 'mrt', and its `route_code`, which names
--     the line ('LRT-1', 'LRT-2', 'MRT-3'). The column has been there since
--     0001 and was empty;
--   * a station's `line`, the same name. A train stops only at its own
--     line's stations, and a jeep at no station (servedBy, routes.ts), so an
--     elevated line over Taft, EDSA or Aurora never lists the jeep hintuans
--     under it, nor a jeep the stations above it.
--
-- Additive, with no rewrite and no new value used here (a value added to an
-- enum cannot be used in the transaction that adds it; the import that uses
-- them runs later). Reversible with
--   alter table stop drop column line;
-- An enum value cannot be dropped; one no row uses is harmless.

alter type transport_mode add value if not exists 'lrt';
alter type transport_mode add value if not exists 'mrt';

alter table stop
  add column line text,
  -- A station is a hintuan: a terminal belongs to the place, not to a line.
  add constraint stop_line_hintuan check (line is null or kind = 'hintuan'),
  add constraint stop_line_named check (line is null or line in ('LRT-1', 'LRT-2', 'MRT-3'));

comment on column stop.line is
  'The train line this hintuan is a station of (LRT-1, LRT-2, MRT-3); null for every other hotspot.';
