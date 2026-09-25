-- ParaPo — a direction remembers the line it was extended from
--
-- Decided 2026-09-25; see "Extend — built" in PLAN.md.
--
-- Extend starts a new route from part of a direction already drawn: Tala –
-- Novaliches keeps the first 15 km of Tala → SM Fairview and adds its own road
-- after. The borrowed part is copied into the new line, point for point
-- (option A): nothing downstream — hotspot links, publishing, tapping — has to
-- follow a reference. These three columns only remember where the copy came
-- from, so a later change to the parent can offer to follow into this line.
--
-- `borrowed_part` is which end of *this* line is borrowed: 'start' when it
-- keeps the parent's start and carries on, 'end' when it joins the parent and
-- keeps its end. `borrowed_m` is how far the two still run together, measured
-- at save time.
--
-- `on delete set null`: deleting the parent leaves the child whole — it owns
-- its copy — and only forgets which line it came from. Part and metres stay,
-- as history, which is why the check below lets `borrowed_from` be null alone.

alter table route_variant
  add column borrowed_from uuid references route_variant (id) on delete set null,
  add column borrowed_part text check (borrowed_part in ('start', 'end')),
  add column borrowed_m double precision check (borrowed_m >= 0);

-- A borrow names its part and its length together; a parent needs both.
alter table route_variant
  add constraint route_variant_borrow_whole check (
    (borrowed_part is null) = (borrowed_m is null)
    and (borrowed_from is null or borrowed_part is not null)
  );

-- A line cannot borrow from itself.
alter table route_variant
  add constraint route_variant_borrow_not_self check (borrowed_from is distinct from id);

-- "Which lines borrowed from this one?" — asked whenever a parent is saved.
create index route_variant_borrowed_from on route_variant (borrowed_from)
  where borrowed_from is not null;
