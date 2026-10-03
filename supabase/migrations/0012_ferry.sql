-- ParaPo — the ferry: the Pasig River Ferry
--
-- The owner's ask, 2026-10-03: the Pasig River Ferry on the map, "same
-- interaction as LRT and MRT, even the showing of hintuans". A ferry is a
-- line as a train is (0011): a route whose mode is 'ferry' and whose
-- `route_code` names its line, 'PRFS'; its stations are hintuans whose
-- `line` is the same name. It stops only at them, and no jeep or train at
-- them (servedBy, routes.ts). The ride is free (MMDA, 2026), so its trip
-- card says Free.
--
-- Additive, with no rewrite and no new value used here (a value added to an
-- enum cannot be used in the transaction that adds it; the import that uses
-- it runs later). Reversible with
--   alter table stop drop constraint stop_line_named;
--   alter table stop add constraint stop_line_named check (line is null or line in ('LRT-1', 'LRT-2', 'MRT-3'));
-- once no stop is a PRFS station. An enum value cannot be dropped; one no
-- row uses is harmless.

alter type transport_mode add value if not exists 'ferry';

alter table stop
  drop constraint stop_line_named,
  add constraint stop_line_named check (line is null or line in ('LRT-1', 'LRT-2', 'MRT-3', 'PRFS'));

comment on column stop.line is
  'The line this hintuan is a station of: a train''s (LRT-1, LRT-2, MRT-3) or the ferry''s (PRFS); null for every other hotspot.';
