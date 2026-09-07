-- ParaPo M1 — initial schema
--
-- Run this in the Supabase SQL editor.
--
-- Geometry is stored as JSONB GeoJSON rather than PostGIS geometry. PostgREST
-- returns PostGIS columns as WKB hex, which means encoding/decoding on every
-- read and write for no benefit at MVP scale. Spatial queries ("routes near
-- me") are a Phase 3 feature; when they land, add a generated geography column
-- alongside these and index that. Nothing here blocks it.

-- ---------------------------------------------------------------- enums

create type transport_mode as enum (
  'jeepney', 'e_jeepney', 'uv_express', 'bus', 'p2p', 'tricycle'
);

-- Everything drawn starts as 'drawn'. Nothing is 'verified' until it has been
-- ridden with a GPS trace. Keeping the distinction from day one is the only
-- way to answer "how accurate is this?" honestly later.
create type route_confidence as enum ('drawn', 'verified');

-- ---------------------------------------------------------------- routes

create table route (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id),

  -- What is painted on the windshield. This is what commuters actually
  -- recognise, so it is the required field, not the tidy official name.
  signboard     text not null,

  route_code    text,          -- GTFS route_id analogue, if one exists
  short_name    text,
  long_name     text,
  mode          transport_mode not null default 'jeepney',

  -- Fares change. Store what was observed and when, never a computed value.
  fare_note     text,
  fare_as_of    date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per direction. Jeepney routes are rarely symmetric: one-way streets
-- and different loading points mean the return trip is its own geometry.
create table route_variant (
  id             uuid primary key default gen_random_uuid(),
  route_id       uuid not null references route (id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users (id),

  -- Named by destination terminal. "Inbound/outbound" is meaningless here.
  direction_name text not null,
  origin_terminal      text,
  destination_terminal text,

  -- The clicks, in order: [[lng, lat], ...]
  --
  -- Stored separately from the snapped line on purpose. Keep only the snapped
  -- output and editing a route later means redrawing it from scratch.
  control_points jsonb not null default '[]'::jsonb,

  -- One entry per gap between consecutive control points, so
  -- length(segments) == length(control_points) - 1:
  --   { "snap": "snapped" | "freehand", "coordinates": [[lng, lat], ...] }
  --
  -- Per-segment snap mode is the escape hatch for when the router refuses a
  -- path a jeepney actually takes. Moving one control point only invalidates
  -- the two segments touching it.
  segments       jsonb not null default '[]'::jsonb,

  -- Concatenated segments as a GeoJSON LineString. Derived, stored for cheap
  -- reads and export.
  shape          jsonb,

  confidence     route_confidence not null default 'drawn',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (route_id, direction_name)
);

create index route_variant_route_id_idx on route_variant (route_id);

-- ---------------------------------------------------------------- stops
-- Schema only for the MVP: no stop-placing UI until after the first routes
-- exist. Terminals live as text on route_variant for now. Defining the tables
-- now costs nothing and avoids a migration later.

create table stop (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id),
  name        text not null,
  is_terminal boolean not null default false,
  point       jsonb not null,        -- GeoJSON Point
  created_at  timestamptz not null default now()
);

create table route_stop (
  route_variant_id uuid not null references route_variant (id) on delete cascade,
  stop_id          uuid not null references stop (id) on delete cascade,
  stop_sequence    integer not null,
  primary key (route_variant_id, stop_id)
);

create index route_stop_sequence_idx
  on route_stop (route_variant_id, stop_sequence);

-- ---------------------------------------------------------- gps sessions
-- Raw traces, never overwritten and never edited. Cleaned geometry always
-- lives on route_variant instead. Unused until verification (Phase 2).

create table gps_session (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id),
  route_variant_id uuid references route_variant (id) on delete set null,
  recorded_at      timestamptz not null default now(),
  -- [{ lng, lat, t, accuracy, speed }, ...]
  points           jsonb not null default '[]'::jsonb,
  note             text
);

-- ------------------------------------------------------------ updated_at

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger route_touch before update on route
  for each row execute function touch_updated_at();

create trigger route_variant_touch before update on route_variant
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------ RLS
-- Anyone may read: the whole point is a public dataset.
-- Only the authenticated owner may write.

alter table route         enable row level security;
alter table route_variant enable row level security;
alter table stop          enable row level security;
alter table route_stop    enable row level security;
alter table gps_session   enable row level security;

create policy route_read         on route         for select using (true);
create policy route_variant_read on route_variant for select using (true);
create policy stop_read          on stop          for select using (true);
create policy route_stop_read    on route_stop    for select using (true);

-- Raw traces are working material, not published data.
create policy gps_session_read on gps_session
  for select using (auth.uid() = owner_id);

create policy route_write on route
  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy route_variant_write on route_variant
  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy stop_write on stop
  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy gps_session_write on gps_session
  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- route_stop has no owner_id of its own; it inherits from its variant.
create policy route_stop_write on route_stop
  for all to authenticated
  using (
    exists (
      select 1 from route_variant v
      where v.id = route_stop.route_variant_id and v.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from route_variant v
      where v.id = route_stop.route_variant_id and v.owner_id = auth.uid()
    )
  );
