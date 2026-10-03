-- ParaPo — a place has one terminal, whatever its names
--
-- Review of 2026-10-03, finding 2. 0007 holds a place to one terminal with
-- an index on lower(informal) where informal is not null. But the studio
-- stores informal as null whenever it says the same as the ground name
-- (saveStop, src/studio/data/stopsWrite.ts), and a box with no informal
-- name is a place by its ground name (stopLabel, placeKey). So two
-- terminals both named "Tala", nothing informal, were both accepted: one
-- place, two terminals, and the pickers stand a route on whichever came
-- first. The index now reads the place as the app does: the informal name
-- when there is one, else the ground name, case-folded.
--
-- The new index is built before the old one is dropped, so if the live
-- table already holds two terminals at one place the create fails and
-- nothing changes. They are listed by
--   select lower(coalesce(nullif(btrim(informal), ''), name)) as place,
--          array_agg(name order by created_at)
--     from stop where kind = 'terminal'
--    group by 1 having count(*) > 1;
-- and one is made a hintuan (or renamed) in the studio before applying.
--
-- Not applied by the session that wrote it; the owner applies it. The
-- studio's message matches both index names, so it reads the same before
-- and after. Reversible with
--   drop index stop_terminal_place_unique;
--   create unique index stop_terminal_informal_unique on stop (lower(informal))
--     where kind = 'terminal' and informal is not null;

create unique index stop_terminal_place_unique
  on stop (lower(coalesce(nullif(btrim(informal), ''), name)))
  where kind = 'terminal';

drop index stop_terminal_informal_unique;
