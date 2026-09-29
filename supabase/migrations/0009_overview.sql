-- ParaPo — a direction's overview, for the editor's list
--
-- Decided 2026-09-29: stage 8 of docs/plan-cleanup-2026-09-29.md, on the
-- numbers in docs/review-2026-09-29.md section 8 ("The studio at scale"). The
-- owner's yes to applying it came the same day.
--
-- The editor's list of directions carries every direction's `shape`, its full
-- line — a point every 20 m or so, ~15 kB a direction with a save's six
-- decimals, ~27 kB with the fifteen older saves kept. At a thousand directions
-- that is 15–27 MB each time the studio opens. The list needs only enough to
-- draw every line and to tap one; the full line matters when a direction is
-- lit, opened, followed, or its links are worked out, and is read then.
--
-- `overview` is the line thinned at 5 m with 5-decimal coordinates, about a
-- quarter of the points — what the public map's index carries (stage 7).
-- Written by the save beside `shape`, from the same line; `shape` stays the
-- line of record. The lines are JSONB GeoJSON and there is no PostGIS, so the
-- client thins it. Rows saved before this have none until they are saved
-- again or backfilled (scripts/publish/backfill-overview.mjs); the list
-- reads their `shape` in their place meanwhile.
--
-- Nullable, additive, no default and no rewrite: reversible with
--   alter table route_variant drop column overview;
-- Policies are per row, so the column is read and written as `shape` is.

alter table route_variant
  add column overview jsonb;

comment on column route_variant.overview is
  'The line thinned at 5 m, 5 decimals: what the editor''s list draws. Null until saved or backfilled; shape is the line of record.';
