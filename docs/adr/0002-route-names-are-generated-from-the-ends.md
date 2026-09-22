---
status: accepted
date: 2026-09-22
---

# A route's name is generated from its ends, with no override

A route is named from its head and tail places — `Tala – SM Fairview`, with
`via X` only when two routes share both ends — and each direction from the
same pair, `Tala → SM Fairview`. There is no field to type a route name, and
none is planned. We chose this over a free-text name because a generated name
that reads wrong is evidence that a *place* is named wrong, which is then
fixed at the source and improves every route touching it; an override is how
a naming rule quietly dies, the escape hatch becoming the habit.

## Consequences

- Naming a route is naming its ends. The pickers list places, never boxes.
- What jeeps actually paint on the windshield is a separate optional field,
  the signboard, typed by the editor and never generated.
- If a real route ever needs a name its ends cannot express, the trigger is
  that case, and the fix to resist is a per-direction override.
