# ParaPo: the studio for a team, staged

2026-10-04. Written from a grilling session with the owner on the same day.
His answers are quoted where they decide something. Nothing here is built
yet. Every stage starts on his go, and every migration is his to apply.

## Why

**The target.** The owner wants to "draw many routes fast": **200 or more
routes by the end of November**. Today there are 10 routes (20 directions)
and 102 hotspots.

**The problem.** That is about 190 routes in 8 weeks, roughly 24 a week. One
person cannot draw that, so the studio has to take helpers. His order was
"helpers and review first", then make drawing faster.

**Not a new direction.** He chose "same studio, refined". The studio stays a
laptop tool ("on a laptop, like me"), and the public map does not change.

**Where the time goes.** All four pains were named: drawing the line,
hotspots, saving and naming, finding and fixing. The worst is **drawing the
line**, and within it all four of these:
- the router takes wrong roads;
- too many clicks;
- fixing mid-line;
- drawing the return trip twice.

## The owner's answers, 2026-10-04

| Question | Answer |
|---|---|
| What the studio is for, next two months | Draw many routes fast |
| Target by the end of November | 200 or more |
| Who edits in three months | Me plus a few I trust, later in three roles (below) |
| How helpers work | On a laptop, in the same studio |
| What comes first | Helpers and review |
| What a helper sends | A whole route: both directions plus their new hintuans |
| Helpers and hotspots | Add new ones, propose edits to existing ones |
| Review needs | Accept or refuse; fix, then accept; send back with a note; see it against the map |
| Two helpers on one route | Claim before drawing |
| Where the list of routes comes from | "I write the list" |
| Accounts | "I invite by email" (the Super admin only) |
| The owner's own saves | Straight to the map, as today |
| History | Full history, undoable |
| Admins draw? | Yes, and their saves go straight to the map |
| After an Admin accepts | Public right away (the next publish) |
| Who reviews | Any Admin, from one shared queue |
| An Editor sees a wrong turn on a public route | Propose a fix; the public line stays until it is accepted |
| Who may roll back or delete | The Super admin and Admins |
| Our own router, about US$5–15 a month | "Yes, worth it"; no server yet, so I pick one |
| Return trip | Reversed and re-routed, then checked |
| Fewer clicks, first | Click only the turns (all four ideas wanted, in time) |
| Worst hotspot pain | Four corners every time |
| Worst save pain | The end doesn't exist yet |
| A screen to open every day | A route list with gaps |
| Time per route today | Not known; the owner times his next one |

## The roles

**Super admin** (the owner):
- makes and removes accounts, by email invitation;
- gives each account its role;
- writes the to-do list of routes;
- polishes any route, any time;
- can do everything an Admin can.

**Admin:**
- draws, and their saves go straight to the map, as the owner's do today;
- reviews Editors' work from one shared queue;
- on each route sent for review: accepts, refuses, sends it back with a note, or fixes it and then accepts;
- may undo any change and delete a route, and both are kept in the history.

**Editor:**
- claims a route from the to-do list, so nobody else draws it;
- draws it in the same studio;
- sends the whole route for review: both directions plus the hintuans they added or changed;
- may propose a fix to any public route, or an edit to an existing hotspot. These go through the same review.

Nothing an Editor does reaches the public map until an Admin accepts it.

**Visitor:** unchanged. The public map reads the published file, and work
waiting for review is never in it.

**New words for CONTEXT.md**, added with stage A1:
- **Super admin**, **Admin** and **Editor** are the roles. "Editor" stops meaning "anyone on the editor list", and "Owner" becomes the Super admin.
- **To-do list**: the routes the Super admin wants drawn, each one *planned*, *claimed*, *in review*, *sent back* or *public*.
- **Claim**: an Editor taking a route on the to-do list.
- **Submission**: what an Editor sends for review. Avoid "draft": that is the unsaved drawing kept in the browser (`parapo.draft.v1`).

## A route's way through, end to end

1. The Super admin writes `Tala – Novaliches` on the to-do list.
2. An Editor claims it, and everyone else sees it is taken.
3. The Editor draws both directions and any new hintuans. Save writes to their submission, not to the map. Their studio draws the submission over the public routes, in its own style.
4. **Send for review** puts it in the shared queue.
5. Any Admin opens it on the map, over the public data, and sees what it would change:
   - the new route, or the old and new line of a fix;
   - hintuans added or moved;
   - the other directions that would gain or lose a hintuan because a box moved;
   - a warning if a route with the same ends is already public or waiting.
6. The Admin decides:
   - **Accept:** written to the live tables and recorded in the history, then public at the next publish (the nightly run, or "Publish map").
   - **Refuse.**
   - **Send back with a note:** "Takes Mindanao Ave, not Quirino, here."
   - **Fix, then accept:** opens it in the drawing tools.
7. The Super admin polishes whatever he likes, whenever. Any Admin or the Super admin can undo a change from the history.

## What changes in the database

Migrations 0013 and 0014 (from the 2026-10-03 review fixes) are written but
not applied yet. They go first, then these, each applied by the owner when
its stage is ready:

- **0015 roles.**
  - `private.editor` gains a `role`: `super_admin`, `admin` or `editor`. The owner's row becomes `super_admin`.
  - The live tables (`route`, `route_variant`, `stop`, `route_stop`) become writable by Admins and the Super admin on **any** row, so they can fix anyone's work.
  - Editors cannot write the live tables at all.
  - `owner_id` stays, and now means "who drew it".
- **0016 history.**
  - One `history` table, filled by triggers on the four live tables. Each row keeps the row before and after, who made the change, when, and the submission it came from.
  - Admins and the Super admin can read it. An undo writes the "before" back, and is itself a history row.
- **0017 the to-do list.**
  - Columns: head and tail (as text, because the place may not exist yet), via, a note, the status, who claimed it and when, and the route once it is public.
  - The Super admin writes the list. Editors claim and release through a function, never by writing the table.
- **0018 submissions.**
  - What it holds: the author, the kind (*new* or *fix*), the to-do item or the route it fixes, the body (the route, both directions with their control points and segments, and the hotspots added or changed), the status, the reviewer's note, and the times.
  - Who can see it: the author reads and edits their own while it is a draft or sent back, and Admins read everything sent.
  - Visitors can read none of it, and **the publish never reads this table**. A check in the publish script holds that.
- **Accounts.** A small Supabase Edge Function, `invite`, keeps the service key on the server. It checks that the caller is the Super admin, sends the invitation email and writes the role row. The owner deploys it, or I do with his word.

**How Accept writes.** The Admin's studio runs the same save the studio uses
today (`routesWrite.ts`, `stopsWrite.ts`, already tested by `save-test`), then
marks the submission accepted. A save that fails half-way is retried, as it
already is. The "passes" links are worked out in the browser, and writing that
geometry again in SQL would mean two answers. "Fix, then accept" is the same
path with the drawing tools open.

## The stages

Two tracks:
- **Track A, the team,** comes first, as the owner asked.
- **Track B, faster drawing,** runs alongside it, because its first stage waits on a server account the owner creates.

Each stage is a branch from `staging` and a pull request into it, as in the
clean-up. Each passes `npm run check` and every suite, and adds a PLAN.md
entry when it merges.

### A1. Roles and accounts
- **What:**
  - Migration 0015 and the `invite` function.
  - A **People** screen, for the Super admin only: invite by email, change a role, remove an account.
  - The account pill shows your role.
  - The studio hides what your role cannot do, and the database refuses it anyway.
- **The owner does:** applies 0013, 0014 and 0015; deploys `invite`; names the first Admins and Editors.
- **Done when:**
  - `save-test` gains an Admin and an Editor.
  - An Editor's write to a live table is refused, both in the stand-in database and in a policy check against a local Postgres.
  - An Admin can save anyone's route.

### A2. History and undo
- **What:**
  - Migration 0016.
  - **History** on a route's and a hotspot's facts: who, when, and what changed.
  - **Undo this change.**
- **The owner does:** applies 0016.
- **Done when:**
  - Every write path in `save-test` leaves its history rows.
  - An undo restores the row exactly, and is undone in turn.

### A3. The to-do list, claims, and the route list with gaps
- **What:**
  - Migration 0017.
  - A **Routes** screen in the studio, with four tabs:
    - **To draw:** planned or claimed, with who claimed each.
    - **In review:** for Admins, the queue; for Editors, their own work.
    - **Sent back.**
    - **Public:** every route, with its gaps — no return trip, no signboard, no hintuans, freehand stretches, U-turns.
  - Each row opens the route on the map. Claim and release are buttons.
  - This is the "route list with gaps" the owner wants every day, and the to-do board, as one screen.
- **The owner does:** applies 0017 and writes the list. It can start today as a plain text file, `Head – Tail (via …)` one per line, and A3 imports it.
- **Done when:** a claim is refused for a second Editor, and the list survives a reload and a publish.

### A4. Editors' submissions
- **What:**
  - Migration 0018.
  - For an Editor, Save writes the submission, not the map. Their own work draws over the public data.
  - **Send for review**, and a "sent back" note they can answer by fixing and sending again.
- **The owner does:** applies 0018.
- **Done when:**
  - An Editor's route, hintuans and hotspot edits round-trip through a submission without touching a live table.
  - The publish's check proves no submission reaches the file.

### A5. The review queue
- **What:**
  - The queue in the Routes screen.
  - The review view: the submission over the public map, with what it changes and the duplicate warning.
  - Accept, Refuse, Send back with a note, and Fix then accept.
- **Done when:** in `save-test`, each of the four ends where it should, and an accepted route is in the next published file.

### A6. Fixes to public routes, and hotspot edits
- **What:**
  - A submission of kind *fix* on a public route: the public line stays until it is accepted.
  - Hotspot moves and renames, with the directions that gain or lose the hintuan listed for the Admin.
- **Done when:** a fix accepted on one direction leaves its other direction and every other route as they were, apart from the links the moved box changes.

### B1. Our own router
- **What:**
  - **The server.** I propose a small cloud server in Singapore (the nearest region to Manila at the usual providers), compared on price and memory when we start. About US$5–15 a month.
  - **The router.** OSRM, the router we use today, on an OpenStreetMap extract of Metro Manila and its neighbours. Its profile is tuned for jeepneys: it prefers main roads, makes side streets cost more, and allows U-turns where jeeps make them.
  - It sits behind HTTPS, answers only the studio's address, and takes a fresh map weekly.
  - The studio uses it first and falls back to the public router.
- **The owner does:** creates the account and a payment method. I send the exact steps.
- **Done when:** the 20 drawn directions, re-snapped from their own control points, show fewer wrong roads and fewer refusals than the public router, with the numbers in the PR.

### B2. Click only the turns
- **What:** with the tuned router, a point per turn should be enough. The studio's own limits are relaxed to match: how far a point may be from a road, and the forced intermediate points.
- **Done when:** points per kilometre on a fresh drawing of an existing route fall clearly, measured on three routes the owner picks.

### B3. The return trip, reversed and re-routed
- **What:**
  - "Draw the return trip" starts from the outbound's points, backwards, re-run through the router so one-ways are respected.
  - The stretches where the return takes another road are marked for checking.
- **Done when:** on Tala – SM Fairview, the generated return matches the drawn one except where the owner says it should differ.

### B4. A hintuan in one click
- **What:**
  - Click beside a road, and a box is drawn on that side, sized and turned to the road, with its corners still adjustable.
  - Four corners by hand stays possible.
- **Done when:** the box lands on the clicked side on a two-way road, a one-way road and a corner, and the "passes" rule picks it up for the right directions.

### B5. A new end from the save panel
- **What:**
  - When the place a route ends at does not exist, the end picker offers **New place here**.
  - It draws the box at the line's end, asks its name and informal name, and comes back to the save with it picked.
- **Done when:** a route ending somewhere new saves without leaving the panel.

### Later, in this order unless the owner changes it
- Between two hotspots: pick the head and tail, the router drafts the line.
- Import a GPS ride (a GPX file from any phone app), snapped to the roads by our router's map matching.
- Paint along the road.
- Hints for new Editors.

## The timeline, honestly

- **When Editors can start.** If A1–A5 take about two weeks, the owner's checks and migrations included, Editors start drawing around **20 October**. That leaves about six weeks for about 190 routes: **some 32 a week across all Editors**.
- **What that costs at 45 minutes a route** (unknown: the owner times his next one): about 24 hours of drawing a week, plus about 10 minutes of Admin review per route, roughly 5 hours a week.
- **Who that needs:** about **4–6 active Editors and 1–2 Admins from late October**.
- **Track B's effect:** it shortens the 45 minutes. Each stage's measure says by how much.
- **If there are fewer people,** the date slides, not the checks.

## What the owner does

1. Time the next route, from the first click to saved, both directions and their hintuans.
2. Start the to-do list as a text file.
3. Apply 0013 and 0014. Merge PR #127 into `staging` when ready.
4. Pick the first Admins and Editors, and have their emails ready for A1.
5. Say go for A1. Then I send the server steps for B1.

## Taken as defaults unless the owner says otherwise

- An Editor holds at most 2 claims. A claim with no saved work for 7 days is released.
- Rail and ferry lines are drawn by Admins only.
- A removed account's submissions stay, unassigned. Its public routes keep "who drew it".
- An Editor never sees another Editor's unsent work. Sent work is visible to Admins only.
- Admins cannot invite, remove or change roles. That is the Super admin's alone.
