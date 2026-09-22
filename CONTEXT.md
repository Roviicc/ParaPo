# ParaPo

Ground-truthed jeepney routes for Metro Manila: an editor draws where the jeeps
actually go and where people actually board, and a public map shows it. The
words below are the ones the app, the plan and the owner use; where several
existed, one was chosen.

## Language

### Routes

**Route**:
A named pair of ends that jeeps run between, in both directions — `Tala – SM
Fairview`. A route is its two ends; it has no name of its own.
_Avoid_: line, service

**Direction**:
One way of riding a route — `Tala → SM Fairview` or `SM Fairview → Tala`.
Every route has exactly two. A direction owns its line; the route owns the ends.
_Avoid_: variant, trip, leg

**Outbound** / **Return**:
The direction from head to tail (papunta), and the direction from tail to
head (balikan). Both are just directions; neither is the "real" one.
_Avoid_: forward/backward, inbound (meaningless here)

**Slot**:
A direction that exists but has no line yet. Every route is born with its
return as a slot, so the card can always be flipped and the studio always
knows what is undrawn.
_Avoid_: missing direction, placeholder

**Head** / **Tail**:
A route's two ends, both places. The head is where the jeeps are based and
wait; the name reads head first. Shared by both directions. Either end may
be a hintuan — "Tala – Malaria" ends where the jeeps turn around, terminal
or not.
_Avoid_: origin/destination, start/end, from/to (those belong to a direction)

**Via**:
The one place that tells apart two routes sharing both ends by different
roads — `Tala – Novaliches via Zabarte`. Absent unless needed.

**Line**:
The drawn geometry of one direction: the road it follows, snapped to the
street network.
_Avoid_: shape, path, geometry (implementation words)

**Signboard**:
The short informal wording a jeep is called out by — `TALA – SM FAIRVIEW` —
written by the editor in the jeepneys' own style. Optional. It is the
editor's words, never the app's: the route name is generated, the signboard
is not.
_Avoid_: route name, label

### Places

**Hotspot**:
One drawn box on the ground where something about jeeps happens: a terminal
or a hintuan. A hotspot has a name (what is written there) and may have an
informal name (what people say).
_Avoid_: stop, box, area, polygon

**Terminal**:
A kind of hotspot: where a route's jeeps are based, stage and wait. A place
has at most one.
_Avoid_: using "terminal" to mean a route's end — that is head or tail, and
a tail can be a hintuan

**Hintuan**:
A kind of hotspot: where people wait and board along the way. A place may
have any number.
_Avoid_: stop, bus stop, pick-up point

**Place**:
Every hotspot that shares one informal name — SM Fairview's terminal and its
hintuans are one place. Routes end at places; route names read places. A
place is nothing but its name shared by its hotspots.
_Avoid_: cluster, group, general hotspot

**Name** (of a hotspot):
What is written on the ground: "SM Fairview Terminal B".
_Avoid_: official name, formal name

**Informal name**:
What people say: "SM Fairview". What route names, cards and pickers read;
what makes hotspots one place.
_Avoid_: nickname, alias (an alias is something else)

**Alias**:
Another way people say the same place — "Fairview", "SM City Fairview" — kept
so a search can match it. Never shown as the place's name.

### A direction and its places

**Passes** (a direction passes a hotspot):
The direction's line enters the hotspot's box, or comes within five metres of
its edge — a hintuan is drawn on the roadside and the line follows the road,
so they touch without crossing. Five metres reaches the box on this side of
the road and not the one across it. Nothing else makes a hotspot part of a
direction. On the map, the stretch of the line that passes a hintuan is
painted orange.
_Avoid_: near (without the number), serves, links to

**Timeline**:
A direction as its string of places in travel order: where it leaves from,
every hintuan it passes, where it is going. What a signboard lists, generated.
A row is the place; when the place has several boxes and the box has a name
of its own, the row reads both — `SM Fairview – Main Babaan`.
_Avoid_: stop list, itinerary, sequence

### People and surfaces

**Owner**:
The one person who runs ParaPo and edits its data.

**Editor**:
Anyone on the editor list, allowed to write. Today the owner alone.
_Avoid_: admin, user

**Visitor**:
Anyone who opens the public map. Asks nothing of anyone: no account, no
permission, no tracking.
_Avoid_: user, commuter (a visitor may be a driver or a dispatcher)

**Studio**:
The editor at `/studio/`: the map plus every drawing and saving tool.
_Avoid_: admin, dashboard, editor (that is a person)

**Public map**:
The map at `/`, read by visitors from the published file.
_Avoid_: visitor map, commuter map, the site

**Published file**:
The one file the public map reads, rebuilt nightly from the studio's data.
Visitors never read the database.
_Avoid_: export, snapshot, API

### Planned, decided, not built

**Short turn**:
A direction that ends early at a hotspot its parent already passes — "Tala to
Malaria only" — with no line of its own, only a window onto the parent's.
_Avoid_: sub-route, partial route

**Extension**:
A new route that borrows an existing direction's line and adds road at one
end — `Tala – SM Fairview` becomes `Tala – Novaliches`. Its own route, grouped
by the end it shares.
_Avoid_: variant, branch

**Shortcut**:
A stretch of road a jeep sometimes takes instead of its usual stretch,
leaving the road at one point and rejoining it further on — `Tala Shortcut`,
nights only, rare. Drawn once, from the road and back to it; it belongs to
every direction that runs that part of the road, so one shortcut sits under
both `SM Fairview – Tala` and `Novaliches – Tala`. Not a route: same ends,
same timeline, only the middle differs.
_Avoid_: via (a whole different road, always), detour, alternate route
