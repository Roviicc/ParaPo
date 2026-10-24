# ParaPo

Ground-truthed jeepney routes for Metro Manila: an editor draws where the jeeps
actually go and where people actually board, and a public map shows it. The
words below are the ones the app, the plan and the owner use; where several
existed, one was chosen.

## Language

### Routes

**Route**:
A named pair of ends that jeeps run between, in both directions — `Tala – SM
Fairview`. A route is its two ends; it has no name of its own. A loop is the
exception: it has no ends at all, and its signboard is its name.
_Avoid_: line, service

**Direction**:
One way of riding a route — `Tala → SM Fairview` or `SM Fairview → Tala`.
Every route has exactly two; a loop, one. A direction owns its line; the route owns the ends.
_Avoid_: variant, leg; trip (a direction is a trip only while its card is open — see Trip)

**Outbound** / **Return**:
The direction from head to tail (papunta), and the direction from tail to
head (balikan). Both are just directions; neither is the "real" one. On a
train line a direction is called by its bound: Northbound or Southbound on
LRT-1 and MRT-3, Eastbound or Westbound on LRT-2.
_Avoid_: forward/backward, inbound (meaningless here)

**Slot**:
A direction that exists but has no line yet. Every route but a loop is born
with its return as a slot, so the card can always be flipped and the studio
always knows what is undrawn.
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

**Loop**:
A route that goes round one way with no ends — `UP – Ikot`. Commuters and
editors read it as **Ikot** (the owner's word, 2026-10-17, in a list's row and
in a trip's header where "Papunta" would stand); the concept is Loop in code
and here. It has one direction, its line closed on where it began, and no
head, tail, return or SWITCH; every place on it is a stop, a terminal box on
it counting as one. It is called by its signboard, which a loop must have. The
same streets the other way round are another loop with a signboard of its own
— `UP – Toki`.
_Avoid_: paikot (said of two-ended routes whose two directions make a circle,
as `loop-closing.ts` has it), circular route, ring

**Tip** (of a loop's trip):
Where a loop's timeline starts: the place whose card the trip was opened
from, else the one nearest the commuter, else the first its line passes as
drawn. A place, not only a hintuan: a terminal's box on a loop counts. Not an
end: a ride goes on round past it, and it is chosen once, when the trip opens,
so nothing moves under the rider.
_Avoid_: start (a ride's), head, origin

**Line**:
The drawn geometry of one direction: the road it follows, snapped to the
street network.
_Avoid_: shape, path, geometry (implementation words)

**Extension**:
A new route that borrows an existing direction's line and adds road at one
end — `Tala – SM Fairview` becomes `Tala – Novaliches`. Its own route, grouped
by the end it shares. Drawn with the studio's Extend (built 2026-09-25).
_Avoid_: variant, branch

**Signboard**:
The short informal wording a jeep is called out by — `TALA – SM FAIRVIEW` —
written by the editor in the jeepneys' own style. Optional, except on a loop,
which is called by it. It is the editor's words, never the app's: the route
name is generated, the signboard is not.
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
painted green.
_Avoid_: near (without the number), serves, links to

**Babaan side** (of a direction at a hintuan):
The right-hand side of the road in the direction's travel, papunta and
balikan alike. A box drawn across both sides of the road serves both
directions; each uses the half on its own right. No second box, and nothing
to record per direction — the side follows from which way the line runs.
_Avoid_: east side, north side (compass sides change with the road)

**Timeline**:
A direction as its string of places in travel order: where it leaves from,
every hintuan it passes, where it is going; on a loop, from its tip round to
the tip again. What a signboard lists, generated.
A row is the place; when the place has several boxes and the box has a name
of its own, the row reads both — `SM Fairview – Main Babaan`.
_Avoid_: stop list, itinerary, sequence

**Ride**:
A direction as it is ridden: its line in travel order from the place it
leaves, whichever way it was drawn, and what that order gives — the hintuans
in the order reached, the metres, the fare. A ride may start and end at any
hintuan it passes, or end at either end of the direction: the ride from
there to there, priced between them, on
the direction's own line; an end picked before the start is ridden back
along it, its arrows turned to run from the start to the end. On the map a
lit direction is drawn as its ride: its arrows, its ends named, the stretch
between the picks. On a loop a ride only goes forward, round past the tip if
need be.
_Avoid_: journey, leg, run; trip (that is the card a ride is shown on)

**Start** / **End** (of a ride):
Where a ride starts and where it ends, marked S and E on the trip and on the
map. Until a rider picks them, where the direction leaves and where it goes.
A row tapped on the trip becomes the end; Set as start under it makes it the
start, and × Remove as start puts the start back where the direction leaves.
A start alone is no ride yet: the tiles and the map stay the whole trip's
until an end is picked.
_Avoid_: head/tail (those are the route's), origin/destination

### People and surfaces

**Owner**:
The one person who runs ParaPo and edits its data.

**Editor**:
Anyone on the editor list, allowed to write. Since migration 0015
(2026-10-14) every editor edits every route and hotspot, not only their own;
a row still records who made it. The owner added two editors that day.
_Avoid_: admin, user

**Commuter**:
Anyone who opens the public map. Asks nothing of anyone: no account, no
permission, no tracking. On the contributor page the same person may become a
contributor, by choice
([ADR 0004](docs/adr/0004-location-leaves-the-phone-only-by-choice.md)).
_Avoid_: user, visitor

**Studio**:
The editor at `/studio/`: three maps behind one switch, Contributors,
Playground and Public, and every drawing and saving tool.
_Avoid_: admin, dashboard, editor (that is a person)

**Contributors map**:
The studio's map of every contribution as it came: faint lines and hintos, for
editors only.
_Avoid_: Tracking map, heatmap

**Playground**:
The studio's map where editors draw. Every route and hotspot goes Draft →
Pending → Approved there.
_Avoid_: Drafts map, sandbox, staging

**Draft** / **Pending** / **Approved**:
A route or hotspot being drawn or changed, seen by editors only, one at a time
per route or hotspot; a draft submitted for review; what commuters get at the
next publish. Any editor approves, their own work included.
_Avoid_: push, publish (the nightly publish is something else), staging

**Send back**:
Return a pending draft to its editor, with a note.

**Take down** / **Put back**:
Remove an approved route or hotspot from the public map at the next publish;
undo it.
_Avoid_: delete (a taken-down row is kept)

**Public map**:
The map at `/`, read by commuters from the published map.
_Avoid_: visitor map, commuter map, the site

**Trip**:
A direction opened as a card, on the public map or in the studio: the ride's
timeline, kilometres and fare, SWITCH to the other direction, the other
routes out of where it leaves. One trip is open at a time; the card keeps
its colour and its height until it closes. A start and an end picked on
the trip price the ride between them.
_Avoid_: ride (that is what the trip shows), selected route, variant; and
never for a direction that is not open — the studio's "Draw the return trip"
means the return direction

**SWITCH**:
The button that turns a trip, a route list or a hintuan's card to the
route's other direction. It names the way a tap leads to: Pabalik on a
Papunta card, Papunta on a Pabalik card, and on a train the other bound
(Southbound on a Northbound card). A list with jeeps and trains together, and
the ferry, keep Papunta and Pabalik. Not a toggle. On a jeep or the ferry it
keeps a picked start and end, each found on the other direction: the same
hintuan, else the nearest box of the same place, else let go. On a train it
lets them go, and the card shows the whole ride.

**Map design**:
The map drawn under the routes: Monochrome (the default, gray), Colour
(OpenFreeMap's Liberty in Apple Maps' light palette, since 2026-10-16) and
Fiord (dark blue-gray, for night). The studio adds Terrain (Colour with the
hills) and Satellite. A commuter's pick is kept on the phone.

**Map Style card**:
The card the layers button opens under it, at the map's top-right corner: a
picture of each map design with its name, the one shown ringed. A pick
switches the map behind it; ✕, Escape or a tap outside closes it.

**Published map**:
The set of files the public map reads, rebuilt nightly from the studio's
approved data: the index, one line file per direction, and the signboards.
Commuters never read the database.
_Avoid_: export, snapshot, API, published file (the word from when it was one
file)

**Index**:
The first file the public map reads: every route with its ends and names,
every hotspot, the links, and an overview line per direction. It carries a
schema number; an app reads only the shape it knows.

**Line file**:
One direction's full line, read when the direction is lit or opened.

### Contributors

**Contributor**:
A person with an account on the contributor page: a name, an email, a number
and a password. The account is the person, not the phone: it keeps its
recordings across phones. The studio shows a contributor's name; the email and
number are the owner's, to contact testers, and never reach the studio. A
commuter becomes one by creating an account on that page only.
_Avoid_: driver, user, reporter

**Contribution**:
One recording on the contributor page, from tapping Start to tapping Save, as
it reaches the studio: its points (about one a second), its hintos and gaps, and what the
contributor typed: a start point name, an end point name, a description, what
was ridden. Never public.
_Avoid_: trip and ride (both taken), ikot (said of a contribution it would be wrong: Ikot is the word shown for a loop, a route; see Loop), biyahe, session, track, trace

**Hinto**:
A time the phone stood still in one spot during a contribution: 8 seconds or
more within 25 metres, for now. Many hintos at one spot, across many
contributions, suggest a hintuan. The database uses the same word.
_Avoid_: stop (the database's name for a hotspot), dwell, idle

**Gap**:
A stretch of a contribution with no location: the screen went off, a call came,
another app was in front, no fix came for 5 seconds, or the page was reloaded.
Not a Stop, which the contributor chose.
_Avoid_: pause; lost signal (only one of its causes)

**Contributor page**:
The page at `/contribute/` where a contribution is recorded: Ready, Recording,
Stopped, Saved. A page of its own, so the public map carries none of it.
_Avoid_: driver app, driver link, tracker

**Contributor button**:
The button at the public map's top left: a plain link to the contributor page.
Shown once the test period ends.

### Planned, decided, not built

**Short turn**:
A direction that ends early at a hotspot its parent already passes — "Tala to
Malaria only" — with no line of its own, only a window onto the parent's.
_Avoid_: sub-route, partial route

**Shortcut**:
A stretch of road a jeep sometimes takes instead of its usual stretch,
leaving the road at one point and rejoining it further on — `Tala Shortcut`,
nights only, rare. Drawn once, from the road and back to it; it belongs to
every direction that runs that part of the road, so one shortcut sits under
both `SM Fairview – Tala` and `Novaliches – Tala`. Not a route: same ends,
same timeline, only the middle differs.
_Avoid_: via (a whole different road, always), detour, alternate route
