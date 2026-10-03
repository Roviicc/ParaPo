-- ParaPo — every hotspot's point, recomputed from its box
--
-- Review of 2026-10-03, finding 1. A hotspot's `point` (its label and the
-- spot the map flies to) is the centroid of its box, computed once by the
-- studio when the box is saved (ringCentroid, src/shared/geo/ring.ts). That
-- function took its shoelace sums from 0°, and at 121°E they cancelled the
-- digits that mattered: a 10 m box's centroid landed some 60 m away. On the
-- map published that day 23 of the 102 hotspots had their point outside
-- their own box. The function is fixed (sums from the ring's first corner);
-- this rewrites the points already stored, with the same maths, rounded to
-- 6 decimals as the studio saves them. A box saved after the fix gets the
-- same answer here, so running this twice changes nothing.
--
-- Not applied by the session that wrote it: the owner applies it, then runs
-- the publish ("Run workflow" on publish-map.yml) so the public map reads
-- the new points; until then the published file keeps the old ones.
-- Reversible only from a backup: the old points were wrong, and are not kept.

create or replace function pg_temp.ring_centroid(area jsonb) returns jsonb
language plpgsql immutable as $$
declare
  pts jsonb := area -> 'coordinates' -> 0;
  n int := jsonb_array_length(pts);
  ox float8; oy float8;
  x1 float8; y1 float8; x2 float8; y2 float8; f float8;
  a2 float8 := 0; cx float8 := 0; cy float8 := 0;
  i int;
begin
  -- The ring is stored closed (ringToPolygon); its corners are the points
  -- before the closing one, as polygonToRing reads them.
  if n >= 2 and pts -> 0 = pts -> (n - 1) then n := n - 1; end if;
  if n = 0 then return null; end if;
  ox := (pts -> 0 ->> 0)::float8;
  oy := (pts -> 0 ->> 1)::float8;
  for i in 0 .. n - 1 loop
    x1 := (pts -> i ->> 0)::float8 - ox;
    y1 := (pts -> i ->> 1)::float8 - oy;
    x2 := (pts -> ((i + 1) % n) ->> 0)::float8 - ox;
    y2 := (pts -> ((i + 1) % n) ->> 1)::float8 - oy;
    f := x1 * y2 - x2 * y1;
    a2 := a2 + f;
    cx := cx + (x1 + x2) * f;
    cy := cy + (y1 + y2) * f;
  end loop;
  if abs(a2) < 1e-12 then
    -- A zero-area trace: the average of its corners, as the studio does.
    cx := 0; cy := 0;
    for i in 0 .. n - 1 loop
      cx := cx + (pts -> i ->> 0)::float8 - ox;
      cy := cy + (pts -> i ->> 1)::float8 - oy;
    end loop;
    cx := ox + cx / n;
    cy := oy + cy / n;
  else
    cx := ox + cx / (3 * a2);
    cy := oy + cy / (3 * a2);
  end if;
  return jsonb_build_object(
    'type', 'Point',
    'coordinates', jsonb_build_array(round(cx::numeric, 6)::float8, round(cy::numeric, 6)::float8)
  );
end
$$;

update stop
   set point = pg_temp.ring_centroid(area)
 where area is not null
   and pg_temp.ring_centroid(area) is not null
   and point is distinct from pg_temp.ring_centroid(area);
