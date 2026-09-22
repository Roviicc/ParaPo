-- ParaPo — a hotspot's two names, and the other things people call it
--
-- Decided 2026-09-21; see "Hotspot names" in PLAN.md.
--
-- `name` stays what is written on the ground: "SM Fairview Terminal B". The
-- new `informal` is what people say — "SM Fairview" — and it is what the
-- generated route name reads (R1) and what groups several boxes into one
-- place: a terminal and two hintuans that share an informal name are one
-- hotspot to a commuter. No group table: the shared string is the group.
--
-- `aliases` are the other ways people say the same place, so a search or a
-- suggestion list can match any of them. Nothing reads them yet; the column
-- lands now because the table holds five rows and naming is cheapest before
-- the sixth.

alter table stop
  add column informal text,
  add column aliases text[] not null default '{}';

-- "Terminal: one box max only." Hintuans may share an informal name freely;
-- terminals may not, so a second SM Fairview terminal is refused rather than
-- silently doubling the place a route can end at. Case-folded, because the
-- app trims and collapses spaces but does not change case.
create unique index stop_terminal_informal_unique
  on stop (lower(informal))
  where kind = 'terminal' and informal is not null;
