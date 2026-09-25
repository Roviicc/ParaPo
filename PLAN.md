# ParaPo — MVP Plan

Ground-truthed jeepney route data for Metro Manila.

Official transit data is a decade stale and routes change constantly. ParaPo's
premise is a current, hand-verified map of how the city actually moves.

---

## MVP goal

**Get 5–8 real jeepney routes drawn and stored, by one person, on a laptop —
and visible to anyone who opens the site.**

ParaPo is two things sharing one map: an editor only the owner can use, and a
public page where everyone sees what has been drawn. The database has been
shaped that way since M1 (public read, owner-only write).
Success is measured in routes in the database — not in how the app looks. If it
is ugly and produces correct geometry, it worked.

---

## Where things stand — 2026-09-21

The one section to read first. Everything below it is detail, history, or plans
not yet started.

**Built and live.** M0–M6 and the six build steps. The site is a gray map
anyone can open, with a card on tap, a share link, offline use and an install
prompt; the owner has it on a real phone. The editor is behind a sign-in and an
editor list. The published map is a file (`public/data/map.json`), rebuilt by a
nightly workflow, so visitors ask the database nothing.

**The route table is empty, on purpose.** On 17–19 September the owner deleted
every route. The nightly publish then refused a 2 → 0 shrink until it was
pushed once with `--force`, and the workflow gained a Force box for the next
deliberate clear-out. The four hotspots are untouched. So the map is live and
correct, and it currently shows no routes.

**Also on 19 September:** the basemap moved from OpenFreeMap's Liberty to
Positron — gray, so routes and hotspots carry the colour — shared by both the
visitor map and the studio. **On 21 September** a control at the top right
lets a viewer pick Gray, Colour (Liberty) or Dark — see "Map design control". **On 22 September** a fourth design, Gray, detailed, draws the terminals, stops and landmarks the tiles already carry.

**Built today, 2026-09-21, awaiting the owner's check.** The route naming
rules as slice 1 (migration 0006, applied) and the hotspot naming rules
(migration 0007, applied) — see "Naming and creating a route" and "Hotspot
names". The four drawing actions beyond Draw and Draw the return trip are
decided, not built.

**Worked out but not decided.** The hotspot and interaction model from the
sketch session, 2026-09-18. Three parts of it *are* settled, because they were
measured or answered rather than argued: side of road, the absence of usable
barangay boundaries, and a route owning its head and tail.

**2026-09-22, in one day.** The owner checked both slices and drew **the first
route**: Tala – SM Fairview, both directions, in the table. On the way: the
map labels a box by its ground name; a fourth design, Gray, detailed, draws the
terminals, stops and landmarks the tiles already carry; Ctrl+Z, Enter and F
while drawing; the end pickers list places, not boxes; a save that failed
half-way is explained, fixed and made self-healing; a direction is named from
both ends (`SM Fairview → Tala`) and leads the save panel; and the route card
is titled by its direction with a switch to the other — slice 2's first half.
Each has a dated section below.

**2026-09-22 evening to 2026-09-23.** A grilling session settled slice 2's
second half as a page the owner confirmed line by line, and `CONTEXT.md`
became the shared glossary (with two decision records in `docs/adr/`). Built
and checked, each on his go: the **timeline** (a direction as its string of
places, with "the line enters the box *or comes within 5 m*" as the rule
after the live boxes showed roadside hintuans a metre off the line); **the
tap, the lighting and the sheet** (every direction rests light; a tap lights
all of it; hotspots first, one row per route; the tapped line wins where the
two roads split; ⇄ swaps the bright line); the **"Part of SM Fairview"** line
on the hotspot card with tappable siblings; and the **place highlight**
(siblings stronger under a soft wash, studio and public map). visitor-test
131/131, phone-test 38/38. Each has a dated section below.

**Next.** The design foundation before the owner designs in Figma: tokens in
one place and a screen inventory in Storybook. Then slices 3 and 4 (short
turn, extension), the shortcut after the extension, then the rest of step 0:
the spellings on the owner's list, side of road, the field method behind
`confidence`, the mode enum.

---

## Locked decisions

| Area | Decision |
|---|---|
| Platform | Web on Cloudflare. Desktop-only through M6. From M13 the editor stays desktop at `/studio/`; the commuter map at `/` goes mobile-first (M14) and installable as a PWA (M15). An APK is later and unplanned; the PWA is kept ready for one. No iOS. |
| Stack | Vite + React + TypeScript + Tailwind |
| Map | MapLibre GL JS |
| Basemap | OpenFreeMap (no key, no bill) |
| Primary input | Draw with snap-to-road |
| Snapping | FOSSGIS public OSRM — no API key |
| Backend | Supabase — Postgres + PostGIS |
| Auth | Email + password, single user (was magic link until 2026-09-12; owner did not want sign-in routed through Gmail). Forgot-password is the one flow that still sends mail. Change-password lives in the account pill. Visitors have no accounts (decided 2026-09-14); from step 2 only the owner signs in, at `/studio/`, with no sign-up. |
| Write access | Public read. Writes only by accounts on the editor list, and only to rows they own (migration 0005, build-order step 1, applied 2026-09-15). The list has one member: the owner. Until then any signed-in account could write rows it owned (found 2026-09-14) |
| Repo | github.com/Roviicc/ParaPo |
| Live | https://parapo.villaralvorovic2.workers.dev |
| Verified | 2026-09-07: local and live both render Metro Manila (real-clock headless screenshot, 718 KB, no error box) |

---

## Interface

One piece of persistent chrome. Everything else is contextual. The map is the
document; nothing competes with it.

### Idle

Full-screen map with saved routes drawn on it. One floating button.

```
┌────────────────────────────────┐
│                                │
│         [ the map ]            │
│      ╱‾‾‾ saved routes         │
│                                │
│                  ┌───────────┐ │
│                  │ + New     │ │
└──────────────────┴───────────┴─┘
```

### Drawing

The button becomes a small toolbar. Nothing else appears.

```
┌────────────────────────────────┐
│                                │
│         ●───●───● drawing      │
│                                │
│      ┌───────────────────────┐ │
│      │ ↶  〰 freehand  ✓  ✕  │ │
└──────┴───────────────────────┴─┘
```

- **↶ Undo** — mandatory. With snapping, a misclick reroutes the line through a
  different neighbourhood rather than nudging a vertex.
- **〰 Freehand** — per-segment escape hatch for when the router refuses a real
  jeepney path.
- **✓ Done** — opens the save panel.
- **✕ Cancel** — discard.

### Saving

One panel, once, at the end: signboard text, route name, mode, direction,
terminals, fare note.

After saving, offer **"draw the return trip"** immediately — jeepney routes are
almost never symmetric, and you want both while the route is fresh.

### Editing

Click any route line on the map to make it editable; the drawing toolbar
returns. **No route list** — the map is the list.

Known limit: this works at 8 routes and fails at 200, when overlapping lines in
places like Cubao become unclickable. Correct for MVP; revisit when it hurts.

### Elsewhere

- Login is email + password, asked for at Done, then invisible. No header, no
  avatar — just the account pill (email · Password · Sign out).
- Export lives in a single small corner menu. Not worth hiding for purity.

---

## Core design rule

**Store the control points, not just the snapped line.**

Save both your clicks and the resulting LineString, plus the snap mode per
segment. If only the snapped output is kept, editing a route later means
redrawing it. Cheap now, impossible to retrofit.

When a control point moves, re-snap **only the two adjacent segments** — for
responsiveness and to stay polite to a shared public router.

---

## Data model

GTFS-shaped names throughout, even though nothing emits GTFS yet. This is the
only path to A-to-B directions later without a schema rewrite.

Geometry is stored as JSONB GeoJSON, not PostGIS geometry — PostgREST returns
PostGIS columns as WKB hex, which costs encoding on every read and write for
no benefit at eight routes. Spatial queries are Phase 3; add a generated
geography column then. Deviates from the Supabase/PostGIS line above on
purpose.

Modes: `jeepney` · `e_jeepney` · `uv_express` · `bus` · `p2p` · `tricycle`

- **route** — `route_id`, signboard text, short name, long name, mode, fare note
- **route_variant** — one per direction. `control_points`, `shape`, per-segment
  `snap_mode`, `confidence`, terminal names
- **stop** — point, name, `is_terminal` *(table exists, no UI in MVP)*
- **route_stop** — `stop_sequence` *(table exists, no UI in MVP)*
- **gps_session** — raw traces, never overwritten *(table exists, no UI in MVP)*

Each direction is its own `route_variant`.

`confidence` is `drawn` or `verified`. Everything in the MVP will be `drawn`.
Keep the field anyway — it is what allows an honest answer to "how accurate is
this?" later, and the distinction cannot be reconstructed after the fact.

---

## Milestones

**M0 — Scaffold + deploy. ✅ Done.** Vite/React/TS/Tailwind, MapLibre rendering
OpenFreeMap over Metro Manila, live on Cloudflare Pages. Deploy before there is
anything to lose.

**M1 — Supabase. ✅ Done.** Schema, RLS keyed to one uid, magic-link login. All
plumbing, nothing visible. No Edge Function: OSRM needs no key, and sends
`Access-Control-Allow-Origin: *`, so the browser calls it directly.

**M2 — Drawing. ✅ Done — confirmed working by the user, 2026-09-07.** Click to place control points, snap each new segment, render
points and line as separate layers, undo.

**M3 — Editing. Built 2026-09-08; verified by scripts/uitest.mjs.** Drag to move, insert mid-segment, delete, per-segment freehand
toggle, adjacent-only re-snap.

**M4 — Persistence, and the public map. ✅ Verified on real data 2026-09-08.**
First route saved by the owner: "Tala" (Tala – SM Fairview, to SM Fairview,
jeepney, ₱28): 5 clicks → 654 road-snapped coordinates, 17.41 km. Edit
loaded it back, a change (5 → 6 points) was written in place. 23 headless
checks pass against it. Delete is untested by choice. Save panel (sign-in required here,
not before), then load and draw every saved route for every visitor — that
is the platform's first real version, not a later phase. Click-to-edit on
the map, delete, return-trip prompt.

Deploy note: there is no `wrangler.jsonc` in the repo — Cloudflare Workers
Builds handles a plain static `dist` without one. Add one when client-side
routing lands, or deep links will 404 without
`assets.not_found_handling: "single-page-application"`.

Local dev note: `vite.config.ts` excludes `maplibre-gl` from `optimizeDeps`.
MapLibre 6 spawns its tile worker from a sibling file via `import.meta.url`;
Vite's pre-bundler relocates the library without that file, the worker 404s
silently, and the map never fires `load` — a white page with no error. The
dev server log does say so ("does not exist at .../.vite/deps/
maplibre-gl-worker.mjs"); read it first next time. Production is unaffected.

Why the map was white until 2026-09-07 (all three were real, stacked):

1. Container height 0. MapLibre adds `maplibregl-map` to its container and
   its unlayered `position: relative` beats Tailwind v4's layered
   `absolute inset-0`. Size a wrapper; give MapLibre a plain child.
2. Dev: Vite pre-bundling relocated the library away from its worker file
   (`optimizeDeps.exclude`).
3. Prod: the build emitted no worker at all; MapLibre computes the worker URL
   at runtime from `import.meta.url`. Fixed with `?worker&url` + `setWorkerUrl`.

Verification tool: `node scripts/realshot.mjs <url> out.png` — real-clock
headless Chrome screenshot plus an in-page probe. Use it before asking a
human to look.

**M5 — Export + tidy.** GeoJSON export, keyboard shortcuts, rough edges.

**M6 — Hotspots. ✅ Built and verified 2026-09-12.** First real data: terminal
"Tala Novaliches Jeep Terminal" and hintuan "Malaria", both linked to
Tala → to SM Fairview (sequence 2 and 132). The hintuan is the interesting
case: no route vertex lies inside it — the line crosses its edge between
vertices 132 and 133 — so the "crossing between vertices" logic was needed on
the very first hotspot. Links were recomputed independently from the stored
polygons and matched.

Verified by `scripts/pw/*.mjs` (67 headless checks: route gestures ported from
uitest.mjs, hotspot tracing, visitor view, sign-in gating) plus 49 unit checks
on the geometry and link math. See `scripts/pw/README.md`.

Changed during the build, from what was planned:

- Terminal pre-tick is "the route enters the outline within its first 100 m",
  not "first vertex inside": the first real terminal had the route start
  **20 cm** outside its hand-traced outline. Measured to the exact entry point
  (`entryDistance` in geo.ts).
- `stop_sequence` for a crossing with no vertex inside is the index of the
  vertex *before* the crossing (`firstTouchIndex`), never -1.

Known, not fixed: a draft (route or hotspot) does not save the map view, so
after a reload the trace can be off-screen. Pre-existing; a small follow-up.

A hotspot is a named polygon where people gather to ride or wait. Two kinds,
and the kind decides how its route list is filled:

| | Terminal | Hintuan |
|---|---|---|
| Meaning | Where a route originates and stages | Where people wait and board along the way |
| Colour | Light blue fill, darker outline (plain blue clashes with route lines) | Orange |
| Route list | **Hand-picked.** Save panel shows a checklist of every route; routes whose first point falls inside the polygon are pre-ticked | **Computed.** Every route direction whose line passes under the polygon. No manual override — the polygon is the truth |
| Kept fresh | By the owner | Automatically: every route-direction save re-checks that direction against every hintuan |

Both lists are stored in `route_stop`, so the tap card, export, and any later
"next stop" logic read one table. `stop_sequence` is the index of the first
route vertex inside the polygon — enough to order stops along a route later
without another migration.

Entry point: a **+ New hotspot** button under **+ New Route**, opening a
two-item menu (Terminal / Hintuan). Tracing reuses the route drawing hook in
an `area` mode: no snapping, straight edges, the ring closes itself, Done needs
three points. Click to add, drag, insert on an edge, right-click to delete,
undo. The localStorage draft records the kind.

Visitors see every hotspot as a shaded shape drawn *below* the route lines, so
a route crossing a hotspot still gets the click; empty interior selects the
hotspot. Tap → card: name, kind badge, note, routes grouped by signboard with
their directions (each row selects that route). Owner sees Edit and Delete.

Schema — `0004_stop_hotspot.sql`:

```sql
create type stop_kind as enum ('terminal', 'hintuan');
alter table stop
  add column kind stop_kind not null default 'hintuan',
  add column area jsonb,          -- GeoJSON Polygon
  add column note text;
alter table stop drop column is_terminal;
```

`point` stays as the polygon centroid. RLS for `stop` and `route_stop` already
exists from 0003; nothing new.

Files — new: `supabase/migrations/0004_stop_hotspot.sql`, `lib/stops.ts`,
`lib/useSavedStops.ts`, `components/HotspotPanel.tsx`,
`components/HotspotCard.tsx`. Changed: `lib/geo.ts` (point-in-polygon, segment
intersection, centroid), `lib/useDrawing.ts` (`kind`), `lib/routes.ts`
(hintuan re-check in `saveVariant`), `DrawToolbar.tsx`, `App.tsx`.

Build order — each step ended in a check and a test, and a failed test stopped
the line before the next step started. All five done 2026-09-12:

1. ✅ Migration 0004 (applied on the owner's yes; columns and advisor verified)
   + geometry helpers, 40 unit checks.
2. ✅ Area drawing mode + menu button. Diff review: no original `useDrawing`
   line removed, only widened with an `area` guard. 21 headless checks.
3. ✅ Save panel, `route_stop` writes, hintuan re-check on route save. 9 unit
   checks; the owner saved one hotspot of each kind and the rows were
   confirmed by SQL and recomputed independently.
4. ✅ Saved-hotspots layer + tap card. 17 headless checks incl. layer order
   and click priority (route line inside a hotspot selects the route).
5. ✅ Full regression (27 gesture checks, route + hotspot), this file, push.

Headless note for CI-like sandboxes: this Chromium build did not deliver the
Shift modifier on synthesized mouse input, so `regression-gestures.mjs`
dispatches shift-click as DOM events. `PARAPO_NODE_FETCH=1` serves https
through Node fetch where the browser itself has no network.

---

---

## Build order — agreed 2026-09-14

Decided with the owner after a long planning session. **No step starts without
the owner's go, one step at a time.** Inside a step, each part ends in a check;
a failed check stops the line.

### Decisions

| | Decision |
|---|---|
| Visitors | View only. No accounts, no sign-in, no sign-up, no contributions, no tracking |
| Admins | One: the owner. Signs in at `/studio/` |
| Interfaces | Two on one site: the visitor map at `/`, the editor at `/studio/` |
| Installable | A PWA now. An APK later, not planned; the PWA is kept ready for one |
| Data for visitors | A published file on Cloudflare (step 5). The database becomes the admin's workshop only |
| Database | Stay on Supabase, Free plan. Moving would cost a rewrite and save nothing: the saving comes from the published file, which works with any database |

### The six steps

| # | Step | Detail | The owner does |
|---|---|---|---|
| 1 | Lock writes to the one admin | Below | Change to a strong password, then turn off sign-ups and raise the password rule |
| 2 | Two front doors | M13, plus below | Add `/studio/` to Supabase's redirect URLs; test one password reset |
| 3 | Snapping quality | M7, minus simplification (moved to step 5) | Edit one real route to confirm |
| 4 | Visitor map on a phone | M14 | Try it on a real phone |
| 5 | Publish the map as a file | Below | Press "Run workflow" once |
| 6 | Installable PWA | M15, revised below | Icon, theme colour, short name; install on a real Android phone |

Why this order: security first, while it is small. The split is the base the
rest builds on. Snapping before many more routes are drawn, so they are drawn
well once. The published file before the PWA, so offline is built once, around
the file — not around the database and then again.

**Alongside, at any time, the owner:** keeps drawing routes (the MVP goal is
still 5–8); settles the free decisions under "Decide before the next route is
drawn"; takes a private backup monthly (see step 5).

**After the six:** M8 linear referencing → M9 looping → M10 sub-routes → M11
annotating → M12 matching. Then, when wanted: an APK wrapper, and visitor
accounts (see "Accounts, later").

### Step 1 — Lock writes to the one admin

**Found 2026-09-14.** The live policies say `auth.uid() = owner_id`: *any*
signed-in account may write rows it owns, and the public map shows every row.
The sign-up API is public — the publishable key ships in the bundle — so hiding
the "Create an account" button stops nobody. "Writes locked to one uid" in
Locked decisions was never what the rules did. Nothing has happened: the
project has exactly one account, created 2026-09-07, and it owns all 2 routes,
2 directions and 4 hotspots.

The owner, in the Supabase dashboard:

- Authentication → turn off new user sign-ups. This alone closes the gap today.
  *Done by the owner, 2026-09-14.*
- First change the owner's own password to a long, unique one (a password
  manager's), using Password in the account pill. Then, Authentication → Email
  provider settings: minimum length 12, and require digits, lower- and uppercase
  letters and symbols. In that order: Supabase warns that an existing password
  below a raised rule meets a `WeakPasswordError` at sign-in, and the sign-in
  panel treats any error as a failure.
- The security advisor's only warning, leaked-password protection, is Pro plan
  and above (checked 2026-09-14). On Free it stays a warning; the strong,
  unique password is the substitute.

Code and database:

- Migration `0005_editor_role.sql`: a `private.editor` table (`user_id`
  referencing `auth.users`) and `private.is_editor()` — `security definer`,
  `stable`, `search_path` pinned — true when the caller's uid is listed. Every
  insert, update and delete policy on `route`, `route_variant`, `stop`,
  `route_stop` and `gps_session` gains `(select private.is_editor())`. The
  owner checks stay.
- **In `private`, not `public` as first planned.** A security definer function
  in an exposed schema is callable by anyone through `/rest/v1/rpc`, which the
  advisor flags (lints 0028 and 0029), and Supabase's RLS guide says never to
  put one there. `private` is not exposed: the API answers PGRST106, "only
  public, graphql_public". The table has RLS on, no policies and no grants.
  `authenticated` gets only USAGE on the schema and EXECUTE on the function,
  because policies run as the caller.
- TRUNCATE, TRIGGER and REFERENCES are revoked from `anon` and `authenticated`
  on every public table, and from the schema's defaults for new tables.
  TRUNCATE ignores RLS; no API route sends it, and now none can. Found by the
  independent review.
- The owner's uid is inserted straight after applying, not written into the
  file: the repo is public, and the migration should stay reusable. Until that
  insert nobody can write, the owner included (it fails closed).
- A list rather than a hard-coded uid, so future accounts (see "Accounts,
  later") can exist without edit rights.
- `SignIn.tsx` loses its sign-up mode. The change- and reset-password forms ask
  for at least 12 characters, to match the password rule above.

*Checks:* inside a transaction that is rolled back, an authenticated uid that is
not an editor is refused an insert on `route` and the owner is allowed one; the
security advisor is clean; all headless checks pass; the owner saves one real
edit on the live site.

**Applied 2026-09-15** (Manila time; the migration `editor_role` is version
20260914172324, in UTC).

| Check | Result |
|---|---|
| Dry run before applying: the migration plus a throwaway second account with rows of its own, all rolled back | 57 / 57. Before the change the second account could write. After it, every insert on the five tables is refused (42501), every update and delete of its own rows touches 0 rows, and TRUNCATE is refused; it can neither read nor join the list; visitors cannot call `is_editor()`; both still read the map; the owner inserts, updates and deletes on all five tables. With an empty list the owner is refused too |
| Independent review, by a separate read-only agent | No way found for a non-editor to write. Led to the TRUNCATE revoke and to `create schema` without `if not exists`. Its other findings are under Known risks #3 and #5 |
| Live check after applying: the same tests, rolled back | 53 / 53. The list holds exactly the owner |
| Public API, as a visitor | Read routes: 200. Insert a route: 401, 42501. `rpc/is_editor`: 404. The `private` schema: PGRST106 |
| Security advisor | Leaked-password protection (Pro plan only, accepted), plus one new INFO, `rls_enabled_no_policy` on `private.editor`. Intended: only `is_editor()` ever reads the list |
| Data afterwards | 1 account, 2 routes, 2 directions, 4 hotspots, 4 links — unchanged |
| `npm run build` | Passes; 1,426 kB / 384 kB gzipped, unchanged |
| Headless checks | gate-test 2/2, hotspot-test 21/21, regression-gestures 27/27. visitor-test 5 pass, 4 fail, exactly as in the baseline (Known risks #1) |
| The owner saves real edits on the live site | Done 2026-09-15, 01:39–01:40 Manila, through the lock: a new route, signboard "asd", a test (inserts on `route` and `route_variant`), and an edit to Tala → to SM Fairview (an update). Both rows belong to the owner's account; still one account |
| The owner's password rule | Set 2026-09-15: at least 12 characters, with lowercase and uppercase letters, digits and symbols. Leaked-password protection stays off (Pro plan only). The owner signed in again afterwards with no weak-password error |

### Step 2 — Two front doors

As **M13**, in its own build order, plus: the visitor app asks only for the
columns it draws — not `control_points`, not `segments` — which halves what a
visit downloads (measured: 17.2 → 8.4 kB gzipped for the two saved directions).
Sign-in at the door, with no sign-up.

*Done when:* the visitor bundle contains no editor or sign-in code (build
check); `/studio/` asks for sign-in; a reset email completes end to end; the
headless checks pass against both pages.

**Built 2026-09-15**, following M13's build order, one commit per part on
`build-order`.

| Part and check | Result |
|---|---|
| 1 — untangle, still one page | Build passes; headless checks unchanged: gate 2/2, hotspot 21/21, gestures 27/27, visitor as in the baseline |
| 2 — folders and `/studio/` | Both pages build; the same checks pass against `/studio/`. hotspot-test passed on its third run: the first hit a network error, the second a 20 s load timeout, while Supabase answered in 0.3 s and the page drew its routes in 1.1 s |
| 3 — the public page at `/` | `check-boundaries`: every import holds. `check-build`: the public page's chunks carry no editor-only string, and the studio's carry all six. The public page draws 3 routes and 4 hotspots with no buttons, no `draw-` layers and nothing in localStorage, and loads no studio module |
| 4 — the studio door | gate-test 14/14. On `/studio/?e2e=1`: hotspot 21/21, gestures 27/27. The production build, in a local preview: `/studio/?e2e=1` still shows only the door, `window.__map` is absent, `/` draws the routes with no buttons and stores nothing, and `/?type=recovery` is forwarded to `/studio/` intact — 8/8 |
| What a visit downloads, 3 directions | 71.3 → 34.3 kB raw, 9.3 → 7.5 kB gzipped. The halving holds before compression only. `segments` mostly repeats `shape`, and gzip already folds repeats away, so on the wire the saving is 20%. The 17.2 → 8.4 kB estimate above did not hold when re-measured |
| Bundle | The public page's own chunk 1.7 kB, the studio's own 41 kB, shared 1,386 kB (MapLibre, supabase-js, shared code). As M13 predicted, the split does not make the public download smaller |
| 5 — tests retargeted | Four helper agents, one per test file, working in parallel; each file was reviewed before it was kept. Every test opens its new page and reads today's data before asserting, and the drawing tests first move the map onto a saved route so their clicks land on streets (known risk #1, fixed). With a plain `npm run dev` and no settings: gate-test 15/15, visitor-test 35/35 (five more per hotspot as data grows), hotspot-test 21/21, regression-gestures 27/27, uitest 24/24 |
| Independent review, by a separate read-only agent | Nothing critical or high: no editor code reaches the public page. Acted on: the leak checks now run inside `npm run build`, so a leaking deploy fails; the build check now also proves by module that no `src/studio/` file reaches the public page, because the string markers came from only four editor files; the door guards the first entry only, so a session that ends mid-edit no longer throws away a half-filled save panel; the forwarder matches only `type=recovery`, `error_code` or `error_description`, and never on `/studio`; `public/.assetsignore` keeps `.vite/` off the live site. Noted, not changed: a direction with no stored `shape` would be missing from `/`, because summaries carry no segments. All 3 have one, and `saveVariant` always writes it |
| The module check catches a leak | Probed on purpose: `src/studio/CardActions.tsx`, which contains none of the marker words, imported into the public page. `check-boundaries` failed on the import. With the build forced through anyway, `check-build`'s module check failed and named that file, while its string check alone still passed — the gap the review found. Restored and rebuilt: every check passes |
| realshot on both live URLs, and the deploy | Done 2026-09-15 on the owner's go: `main` fast-forwarded to `c53562a` and pushed; the live site served the new build about 50 s later, with the same asset hashes as the local build. `npm run check` passed first. `/`: "3 routes · 4 hotspots", no buttons, no `window.__map`. `/studio/`: the sign-in door only, no map canvas. `/.vite/manifest.json`, `/.vite/modules.json` and `/.assetsignore` return the page fallback, not the files |
| A real reset email, end to end, on the live site | Done 2026-09-15, by the owner, after the deploy: requested on `/studio/`, completed from the email, as the owner reports |

### Step 3 — Snapping quality

As **M7**: `radiuses`, joins re-routed together with both neighbours, and
street names from `steps=true` shown in the save panel. M7's fourth item —
simplified geometry for visitors — moves to step 5, where the published file
is made.

*Checks:* a click inside a block, away from any road, gives a visible failed
(dashed) segment instead of a far-away snap; dragging a middle point leaves no
U-turn spur at either join; all gesture checks pass; the owner edits one real
route and confirms.

**Built 2026-09-15** on `build-order`.

**Owner's decision, 2026-09-15: U-turns are shown, never changed.** Where the
route turns back on itself at a control point — a click a little past a
corner, or a jeepney that really turns there — the line stays as the router
drew it. The doubled-back stretch is painted amber, the point is ringed, the
toolbar counts "⚠ N U-turns" and the save panel warns before saving. The check
"no U-turn spur at either join" becomes "no hidden U-turn at any join". What
was weighed, measured on real Novaliches streets: forcing the route forward
(M7's three-waypoint request with `continue_straight=true`, plus start
bearings) removed spurs by driving round the block, +532 m, +619 m and
+1,060 m in three layouts, each a plausible-looking route that is easy to miss
before saving; an arrival bearing made the router drive past and U-turn
anyway; cutting short stubs off automatically would also cut a detour the
owner had just dragged onto a side street.

| Part and check | Result |
|---|---|
| `radiuses=25` | A click in the La Mesa watershed that snapped to Quirino Highway 1,213 m away now draws a dashed segment. A refused point makes only the gaps touching it straight; the others are routed on their own |
| A moved or inserted point | Its two segments go to the router in one request (`continue_straight=false`). Only the two adjacent segments are re-snapped, as the core design rule says |
| U-turns shown | `findUTurns`: the two segments pass the same road nodes in opposite order, or the edge in and the edge out are more than 150° apart. snap-test: append rings B; drag rings B and C, not D; insert rings P, not B — exactly where the line turns back. A straight-on join rings nothing |
| Street names | `steps=true`; each segment stores its street runs with lengths. The save panel lists "via Sinai Street → Assyria Street", counts straight stretches, and says when older segments have no names yet. A `?e2e=1` session cannot open the panel, so it is seen in the Studio/SavePanel story; snap-test reads the names from the draft |
| Router etiquette | One request a second, page-wide; one retry after a 429; a 10 s timeout that starts when a request's turn comes. Back-to-back requests are what the public router refuses, and a refusal draws a good stretch dashed |
| Replies written by identity | A reply is written where its straight stand-in still is, and dropped if the stand-in is gone. This replaced per-position counters, which the review traced writing road geometry into the wrong gap after an insert and leaving a fake routed segment behind. A draft reloaded mid-request routes its stand-ins again |
| First independent review, by a separate read-only agent | 10 findings on the first version (bearings plus a repair re-route). Acted on: rate limits, reply placement, stand-ins after a reload, the save panel hint, a timeout, gesture tests passing for the wrong reason. The heading and forced-forward findings went with the owner's decision |
| `scripts/pw/snap-test.mjs` | New, written by a helper agent and run against the old code first: it failed there on the far click, the spurs and the street names, which is the proof it can see them. Then rewritten for the owner's decision |
| The existing gesture tests | They clicked fixed pixel offsets. With the radius, regression-gestures' drag landed off-road, and "shift-clicking marks it freehand" passed because the segment was already dashed; uitest showed "2 freehand" after one shift-click. They now click a saved route's own vertices, drag along a segment's own road, and check the segment is routed before the shift-click |
| Checks | `npm run check` passes. Offline, snap.ts against scripted router answers: 37/37. Headless on a dev server: snap-test 20/20, regression-gestures 29/29, hotspot-test 22/22, uitest 26/26, gate-test 15/15, visitor-test 35/35. uitest's route-card tap now picks a vertex no other saved route shares: at the fitted zoom the short test route "asd" lies on Tala, and a tap there opened Tala's card |
| Visitors | Nothing they run changed. The shared CSS file grew 104.33 → 104.42 kB with the editor's amber classes, because Tailwind writes one file for both pages; after the second review the warnings reuse amber shades the file already had |
| Second independent review, by a separate read-only agent | On the shown-not-changed version. Acted on: a loop round a one-way or divided block now counts as a U-turn; a retrace under 5 m, or a sharp turn onto another road, no longer does; duplicate vertices and malformed stored segments no longer break the check or the save panel; a press and release on a point no longer re-routes it or inserts a second point on top of it (a bug older than step 3); a drag released over the toolbar ends; a request whose stand-ins are gone is cancelled; Done stays disabled while any stand-in is left; the draft marks stand-ins `pending`, and a reload asks the router once more. Its test findings: the drawing tests now read the draft to tell a routed segment from a stand-in, a wait for "snapping…" that times out fails, and hotspot-test's router check must see a request |
| A probe with router answers held back | The press-and-release, the drag released over the toolbar (Done disabled while the answer is out) and a reload mid-request, each checked with the router's answer deliberately delayed: 11/11 |
| The owner edits one real route | Done 2026-09-15: "snapping is good" |

Found while testing: starting `npm run dev` while another dev server is
running fails on the port, but first rebuilds the shared `node_modules/.vite`
cache. The server already running then answers "504 Outdated Optimize Dep" for
React and supabase-js, the studio never loads, and every headless test times
out, until it is restarted.

### Step 4 — Visitor map on a phone

As **M14**, unchanged.

**Built 2026-09-15** on `build-order`, with the owner's go and the test route
"asd" deleted first (it lay on top of Tala, so every tap there would have
offered a chooser with a route called "asd" in it).

| Part and check | Result |
|---|---|
| A forgiving tap | `src/shared/tap.ts`: the map is asked what lies in a box around the tap, ±20 px for a finger, ±5 px for a mouse, read off the tap's own `pointerType` so a touched laptop screen counts as a finger and a phone's mouse as a mouse. A route drawn right under the tapped pixel wins outright, as it always has; otherwise everything in the box is offered |
| Several hits open a chooser | Two or more things in the box, routes, hotspots or both, select nothing and hand the app `candidates` from each hook; `Chooser` lists them under "2 routes here" or "1 route · 1 hotspot here" with signboard and direction, in a sheet. A terminal with its own route running through it is the normal case, and this is how it stays tappable. Both pages render it, the studio too, because its ±5 px box can still land on a shared road |
| The chosen route stands out | Drawn again on top in `saved-routes-selected(-casing)`, thick, while the others dim to 0.35 (casing 0.5). The old width switch is gone. The editor's hidden copy stays hidden across all five layers |
| Cards become a bottom sheet | `src/shared/Sheet.tsx` wraps RouteCard, HotspotCard and Chooser. Under a 40 rem container width it is a bottom sheet: peek (signboard and direction; name and kind), a handle to tap or drag, open shows the rest, pulled down at peek it closes. At 40 rem and up it is the floating card exactly as before. A container query, not a viewport one, so Storybook's phone frames show it |
| Chrome | No zoom buttons on a coarse pointer (pinch does it); attribution moves to the top right there so an open sheet never covers it; MapLibre's corners and the pill sit inside the safe areas; `viewport-fit=cover` on both pages |
| Share a route | `/?r=<direction id>`: opening it selects the direction and fits the view to it; selecting writes `?r=` to the address bar, closing clears it, a link to a deleted direction is cleared too. A Share button uses the phone's share sheet, else copies the link, else (a plain-http address, such as a build served on the home network, where browsers allow neither) shows the link to copy by hand: the owner's first phone try found the button doing nothing there |
| No "where am I" dot | Not built, as decided: it needs the location permission, and deserves its own decision |
| Found by the phone test | After tapping the handle to collapse the sheet, the browser's follow-up `click` landed on the map where the sheet had been, the map read it as a tap on nothing, and the card vanished. `Sheet` now swallows that one click (capture phase on the document, forgotten after 500 ms if none comes). A real finger would have done the same |
| `scripts/pw/phone-test.mjs` | New, 43 checks at 390×844 with touch emulation, positions computed from the map's own data: chrome, the ±20 px tap with a negative control 40 px out, the sheet's tap and drag gestures and a ✕ pressed right after a handle tap, the chooser on the road Tala and Bagong Silang 5 share, a tap inside the hintuan "Phase 1" beside its route ("1 route · 1 hotspot here", then its card), a tap 15 px outside a hotspot, the share link and its copy button, a desktop control (±5 px, buttons back), housekeeping. Today 42 pass and 1 SKIP for a shape the data lacks (two overlapping hotspots). Its "N px beside the line" steps measure the true pixel distance to the whole line and step to the far side, because at a bend the route's next stretch can lie 10 px off one side; the hotspot steps run at zoom 18, where a person tapping a terminal would be |
| The other suites | visitor-test's card selector is `[data-testid="card"]` now that the card is not always 20 rem wide. After the review's fixes: gate-test 15/15, visitor-test 35/35, regression-gestures 29/29, hotspot-test 22/22, snap-test 20/20, uitest 26/26; `npm run check` passes |
| Stories | `Chooser.stories.tsx` (two routes, three, two hotspots) and a `Phone` story on RouteCard, HotspotCard and Chooser, in a 390 px container. `npm run build-storybook` passes and the phone stories were screenshotted |
| Visitors' download | The public page's own chunk is 3.65 kB; the shared CSS 104.42 → 106.86 kB with the sheet, chooser and container-query classes |
| Second independent review, by a separate read-only agent | 11 findings. Acted on: the "routes win" rule had been widened to the finger box, which made a terminal untappable anywhere near its own route (now: under the pixel wins, in the box shares a chooser); the swallowed click was armed after drags too and caught the ✕ pressed within half a second (now armed only after a tap, only for clicks outside the sheet, for 300 ms); a chooser left open when drawing started came back stale after it; a chooser reopened at peek from the second tap on (keyed on what it lists now); the count pill drew over the chooser's title on a wide screen; a tap on two routes one of which had not loaded yet cleared the selection and showed nothing; a share link to a deleted direction stayed in the address; the error banner covered the attribution on a phone; `pointer: coarse` was read per tap but cannot change per tap, so the tap's own `pointerType` is used; three sheet checks passed when their starting state had not been reached; Escape closes a sheet and it is a `dialog`. Left: `max-h-[60vh]` is viewport-based inside a container-based layout (harmless on a phone); no focus move into the sheet; hover and click disagree by up to 5 px on a mouse |
| The owner tries it on a real phone | Done 2026-09-15 on a build served over the home network (`npx vite preview --host`). The first report was that Share did nothing there, which found the plain-http case above; after the review's fixes: "it's working now!" |

### Step 5 — Publish the map as a file

Visitors stop asking the database anything.

- `scripts/publish-map.mjs` reads the public tables with the publishable key,
  simplifies each line (±5 m, 5 decimals — measured on Tala: 655 → 99 points,
  about 7× smaller), and writes `public/data/map.json` with its `published_at`
  time. Stable key order, so unchanged data gives a byte-identical file.
- `.github/workflows/publish-map.yml` runs it daily and on "Run workflow". It
  commits only when the file changed; the push deploys as today. The repo is
  public, so Actions minutes are free.
- The visitor app reads `/data/map.json` and stops shipping `supabase-js`
  (~55 kB gzipped). The studio keeps reading the live database.
- Visitors see a change when it is published, not the moment it is saved. For a
  curated map that is the right way round.

What the file buys, at $0: Supabase's 5 GB/month egress stops mattering,
because Cloudflare serves static files free and without limit. The daily run
counts as database activity, so the Free project is not paused for idleness —
and if it were, the public map would keep working. Git history keeps every
published version.

Two cautions:

- **Never commit a full database dump.** It includes `auth` — emails and
  password hashes. The map file holds public data only. The owner runs
  `npx supabase db dump` monthly and keeps it off the repo: Supabase Free has no
  downloadable backups and recommends exactly this.
- GitHub disables scheduled workflows in a public repo after 60 days without
  repository activity. It emails first; one click re-enables.

`/data/map.json` has no hash in its name, so it keeps Cloudflare's default
revalidating headers. Never put it under the `immutable` rule.

*Checks:* the simplified line stays within 5 m of the original everywhere; a
second run with no data change makes no commit; the live visitor map draws from
the file; the visitor bundle contains no Supabase client; data per visit is
measured and recorded here.

**Built 2026-09-15** on `build-order`, with the owner's go. Nothing was needed
from the owner first: the publishable key is already committed, a workflow can
ask for write access itself, and Actions are on.

| Part and check | Result |
|---|---|
| `scripts/publish-map.mjs` | Reads the public tables over Supabase's REST API with the publishable key from `.env.production` (or the environment), page by page (PostgREST answers 1,000 rows at a time), with a 30 s timeout and one retry: the columns the public map shows and nothing else — no owner ids, no control points, no segments. Douglas–Peucker at 4.2 m, then 5 decimals, and the script checks its own work: every original point within 5 m of the simplified line or it fails. Fixed key order, rows by id (so re-saving a direction unchanged does not reorder the file), and `published_at` is carried over when nothing else changed, so unchanged data gives a byte-identical file; a second run printed "Unchanged". It refuses to publish a collection that lost more than 30% of its rows since the last file, because a table that answers with no rows is a normal HTTP 200 and a policy slip would otherwise blank the live map; `--force` is for a deliberate clear-out. Measured: Bagong Silang 5 675 → 110 points (within 4.5 m), Tala 656 → 109 (within 4.2 m); the whole map 7,831 bytes, 2,199 gzipped. (The plan's "655 → 99" was measured with a different tolerance.) |
| `.github/workflows/publish-map.yml` | Daily at 20:00 UTC (04:00 Manila) and on "Run workflow"; `permissions: contents: write` raises the token above the repo's read-only default; one at a time; always from and to `main`. `git add` then `git diff --cached`, because plain `git diff` cannot see a file git does not track yet and would say "unchanged" forever. Commits as github-actions[bot] with the date and time, rebases once behind anything the owner pushed meanwhile, and the push deploys as any other. A push made with the workflow's token starts no other GitHub Actions workflow, so a CI workflow added later would skip these commits; the file says so |
| The visitor app | `src/shared/mapFile.ts` fetches `/data/map.json` once per page (`cache: 'no-cache'`, so a cheap 304 when unchanged; Cloudflare already serves unhashed files as must-revalidate) and both hooks share it; `useSavedStops` now takes a `load` function like `useSavedRoutes`. `commuter/main.tsx` creates no Supabase client. A load failure shows "The routes could not be loaded. Check your connection and try again." with a Try again button. The live-table readers moved to `src/studio/live.ts`: first to `shared/live.ts`, because `routes.ts` and `stops.ts` importing `supabase.ts` put the database's address in a chunk both pages share (`check-build` caught that on the first build), then into `studio/` on the reviewer's point that the import-boundary check is the strongest guarantee and only applies there |
| `check-build.mjs` | Two new checks with studio-side controls: no `@supabase/*` module in the public chunks, and no `.supabase.co` string |
| Data per visit | Before: 18.2 kB gzipped from Supabase per visit at 2 directions, growing with each. After: one 2.2 kB gzipped file, or a 304 when unchanged, from Cloudflare, free. The shared JS chunk fell 1,390 → 1,179 kB (375 → 321 kB gzipped) with supabase-js gone; the public page's own chunk is 4.6 kB. The "Measured 2026-09-14" table below keeps the before figures |
| The first file | Published from this machine and committed with this step, so the merged site works before the workflow's first run; the owner's "Run workflow" then finds it unchanged, which is the "no commit on no change" check on GitHub itself |
| Suites | visitor-test gains two checks (no request to `*.supabase.co`; `/data/map.json` served exactly once): 37/37. phone-test 42/42, gate-test 15/15, regression-gestures 29/29, hotspot-test 22/22, snap-test 20/20, uitest 26/26, on the owner's dev server, after the review's fixes. Two lessons about running them: one visitor-test run alongside the studio suites saw the file fetched three times and a click land on nothing, because the dev server had reloaded its pages to re-optimise dependencies after an edit; and five suites started at once crash on launch on this machine. Run them two at a time at most, and not right after a code change |
| Independent review, by a separate read-only agent | 17 findings and 9 small ones. Acted on: the workflow's change test could not see an uncommitted file and would have reported "unchanged" daily with a green tick (the file is committed with this step, and the test is `git add` + `git diff --cached`); an empty or truncated answer was publishable truth (the shrink guard, and paging past 1,000 rows); `live.ts` into `studio/`; a rebase before the push; a note that the token's push starts no other workflow; the deviation check's early break could abort a good publish on a route that doubles back (gone); a null route embed, a hung request (timeout and retry), `.env` quoting and trailing comments; rows by id; `published_at` validated on load; visitor-test counts responses that were served, not requests; visitor-facing error copy with a retry; the studio banner shows `stops.error` too; the dates and numbers in this plan. Left: `loading` is returned by `useSavedRoutes` and read by nobody |
| Two things step 5 makes true | **Published data is permanent.** Every publish is a commit in a public repo: a hotspot note that should not have been written (a name, a phone number) stays in git history after it is deleted from the database. Write notes as if they were already public, because from the next publish they are. And **a quiet map disables its own schedule**: the workflow commits only on change, GitHub disables schedules after 60 days without commits, and with the schedule goes the daily database activity that keeps the Free project from pausing. GitHub emails first; one click re-enables, and the map keeps working from the file throughout |
| Merged and deployed | 2026-09-15, `0583051`. The live page's asset names match a build of the committed tree; `/data/map.json` is served with `public, max-age=0, must-revalidate` and an ETag, as expected of an unhashed file; a visit makes one request for it (200) and none to `*.supabase.co` or the router; the pill reads "2 routes · 4 hotspots", a tap opens a card, the studio still shows its door |
| The owner presses "Run workflow" once | Done 2026-09-15: run 34953042104 on `0583051`, success in 16 s. Its log: "Unchanged public/data/map.json: 2 direction(s), 4 hotspot(s), 4 link(s); 7831 bytes, 2199 gzipped" then "The map is unchanged; nothing to commit." — GitHub's machine read the database with the publishable key, produced the same file, committed nothing. One warning: `actions/checkout@v4` and `setup-node@v4` target Node 20, which GitHub is retiring on its runners; both moved to `@v5` on `build-order`, to reach `main` with the next merge. **Step 5 done** |

### Step 6 — Installable PWA

As **M15**, with the file from step 5 in place of database caching:

- `/data/map.json`: NetworkFirst with a short timeout, then the cached copy. The
  Supabase row in M15's cache table no longer applies — visitors never call the
  database.
- The offline notice reads the file's own `published_at`: "Offline · map as of
  14 Sep". It is exact, and M15's known gap — a timeout fallback not flagged
  while the phone reports itself online — disappears, because the date travels
  with the data.

Everything else in M15 stands: the manifest on `/` only, its link stripped from
`/studio/`, no studio chunks in the precache, a capped tile cache, the update
prompt, `_headers`, and the APK-ready checklist.

**Built 2026-09-15** on `build-order`, with the owner's go and the owner's
inputs: the name "Para Po" (short name the same, "generic for now"), and the
icon and theme colour to be made from the logo in `public/branding/`.

| Part and check | Result |
|---|---|
| Icon and colours | Measured from the logo through a canvas: the pin's fill is `#b27676`, the jeepney body and the wordmark `#8a595a`, the windows `#d5d1cb`. Theme colour `#8a595a`, the wordmark's maroon — dark enough for a status bar with white text; background `#f5f1ee`, a warm off-white, behind the splash and the maskable icon. Icons drawn from the pin mark alone (the wordmark is unreadable at 48 px): `public/icons/icon-192.png` and `icon-512.png` on a transparent ground, `icon-512-maskable.png` with the pin at 64% inside the safe circle on the off-white, `apple-touch-icon.png` 180 px for the iPhone's by-hand install, `favicon.png` 48 px on both pages. The logo itself stays uncommitted in `public/branding/` |
| Manifest, on `/` only | `vite-plugin-pwa` 1.3.0, `generateSW`: name and short name "Para Po", `id`, `start_url` and `scope` `/`, `display: standalone`, the colours, the three icons; `index.html` carries the matching `theme-color`, the favicon and the apple-touch-icon. `injectRegister: false`, so the plugin writes no registration script anywhere, and `studioWithoutManifest`, a post-order plugin after it, takes the `<link rel="manifest">` back out of `studio/index.html`. The studio's `<title>` stays "ParaPo Studio"; the visitor page's is "Para Po" now |
| What the phone keeps | Precache: `index.html`, the public page's own chunk, the shared chunk and its CSS, the MapLibre worker, the manifest and the three icons — 10 files, 2.0 MB (the plugin reports 14 entries; four are the manifest and icons listed twice). The glob keeps out `studio/`, `.vite/`, `data/` and `_headers` by construction, and a `manifestTransforms` step reads `dist/.vite/manifest.json` (written before the worker is generated) and drops every chunk `index.html` does not load, so the studio chunk with the Supabase client never reaches a phone. Runtime: `/data/map.json` NetworkFirst with a 3 s timeout (one entry), and a copy served from the store is stamped `x-parapo-served-from: cache` so the page can tell; OpenFreeMap's style, TileJSON, sprites and glyphs StaleWhileRevalidate (500 entries — a glyph range is an entry, and Liberty uses three faces — 30 days); its tiles CacheFirst, 1,000 entries, 30 days, the first cache to go on a quota error. The plan said "~3,000", but the vector source stops at zoom 14, where a central-Manila tile is about 450 kB stored and the metro is about 110 tiles: a normal visitor keeps 30–100 MB, and 1,000 is a ceiling only a cross-country pan reaches. Only real 200s are stored — an opaque response costs several MB of quota. Nothing else is ever cached: non-GET, Supabase, the router all pass straight through. The stored page answers `/` (and `?r=`) and nothing else: `/studio`, with or without its slash, the data file and the manifest typed into a tab go to the server as themselves |
| Registration and updates | `src/commuter/pwa.ts`, from `commuter/main.tsx` only, through `virtual:pwa-register` — a no-op under `npm run dev`, so every other suite meets a plain page. `registerType: 'prompt'`: a changed worker installs, waits, and the page shows "New version · Reload"; the tap sends `SKIP_WAITING` and the page reloads itself once the new worker controls it (the plugin's own reload only fires when the page was already controlled at registration, which a first visit is not). The page also asks for an update once an hour, because an installed app can stay open for days |
| Found by the first offline run | On a first visit the page fetches the map file and the basemap's style before the new worker has taken control, so neither reached its caches: only the tiles fetched later did, and an install followed by airplane mode would have opened to a basemap with no routes. `warmCaches()`, on a first visit only (a page nobody controls yet), waits for the worker to control the page, then asks again for `map.json`, the style, the TileJSON and the sprite — a conditional request each, answered 304, stored by the worker this time. Tiles and glyphs are many and are left to normal use; a second online visit fills them the same way |
| Found by a probe | Panning offline into tiles the phone had never seen made MapLibre fire `error` for each, and `MapView` turned the first into "The map failed to load." with diagnostics — over a map that was drawn and working. An error after `load` is a resource that did not arrive, not a failed map: it goes to the console only. Before `load` nothing changes, so a phone with nothing cached still gets the banner |
| Saying it is stale | "Offline · map as of 15 Sep": `navigator.onLine` for the first word, the file's own `published_at` for the date, spelled by hand ("15 Sep") so every browser agrees. And "Not refreshed · map as of 15 Sep" when the phone believes it is online but the network did not answer within the worker's 3 s and the stored copy was used — the page reads the worker's stamp on it, so M15's unflagged-timeout gap is closed as the plan promised rather than merely narrowed. Bottom left above the pill on a phone (the credit line opens across the top there), under the pill on a wide map. Gone the moment a fresh copy arrives |
| `public/_headers` | `/assets/*` immutable for a year (hashed names), `/studio/*` `X-Robots-Tag: noindex`. Nothing else: `index.html`, `sw.js`, `manifest.webmanifest` and `/data/map.json` keep Cloudflare's `max-age=0, must-revalidate` with an ETag, so a new version is noticed on the next visit |
| `check-build.mjs` | 15 new checks on the build: the manifest link in `index.html` and not in `studio/index.html`, no registration script in either, a valid manifest with the name, `/` for id, start and scope, standalone, the three icons on disk, the `theme-color` meta equal to the manifest's; the precache holds the public page's chunks, CSS, the worker and the icons, and no studio-only chunk, nothing from `studio/`, `.vite/`, `data/`, `branding/`, no `_headers`; the worker's navigation allowlist is `/` alone and `/studio` is on its denylist; the four cache rules and the cache stamp present; one `skipWaiting()` and only inside the `SKIP_WAITING` handler |
| `scripts/pw/pwa-test.mjs` | New, 41 checks against the production build in its own `vite preview` on :4173: the manifest and icons served and valid; `/studio/` in a fresh browser renders its door (the positive control), links no manifest and registers no worker; on `/` the worker is ready with scope `/`, the pill shows the published map, the four caches hold the file, the style, the TileJSON and tiles, no studio chunk, `map.json` never precached; with the page controlled, `/` comes from the worker and `/studio` and `/studio/` do not, while the data file and the manifest are served as themselves; network cut and `/` reloaded — the routes still show, the notice reads "Offline · map as of 15 Sep", the basemap draws with tiles counted from the worker's cache, no failure banner, panning into unseen tiles raises none, a shared link `/?r=<id>` still opens its card; back online the notice goes; the map file delayed past 3 s while online shows "Not refreshed · map as of 15 Sep", and goes when fast again; a byte changed in the built worker is offered as "New version · Reload" while the old worker keeps the page, and the tap brings the new one in. No page errors, no request to the database |
| The other suites | On the owner's dev server after the change: visitor-test 37/37, phone-test 42/42 (1 SKIP), gate-test 15/15; `npm run check` passes with 22 build checks; `npm run build-storybook` passes, with the plugin filtered out of Storybook's Vite config (`viteFinal` in `.storybook/main.ts`): stories are not an app, and the precache step would look for a build manifest Storybook never writes |
| Housekeeping | `.gitignore` now keeps root `*.png` (the suites' screenshots) and `public/branding/` (the owner's logo, 483 kB, which a local build was already copying to `dist/`) out of commits and deploys. The share title's fallback says "Para Po" like the page; the credit line, the README heading and the studio keep "ParaPo" |
| Independent review, by a separate read-only agent | 3 must-fix, 12 nice-to-have, 8 confirmed fine. Acted on: the navigation fallback would have answered `/studio` without its slash — and `/data/map.json` typed into a tab — with the map's HTML on any browser holding the worker (allowlist `/` only, denylist widened, and the test drives all five addresses through a controlled page); the offline notice only knew `navigator.onLine`, so a slow-but-connected phone got the stored copy with no notice — M15's gap intact (the worker's stamp, "Not refreshed", and a test that delays the file past the timeout); the studio checks had no positive control (the door is asserted first); a first-session update never reloaded, because the plugin's reload is gated on the page having been controlled at registration (the page reloads itself on `controllerchange`); the warm-up ran on every visit, doubling the file's requests (first visit only now); the tile cap's arithmetic; glyphs crowding the 200-entry meta cache; opaque responses admitted; "the basemap draws" proved nothing about tiles (counted from the worker now); screenshots and the logo unignored; Storybook carrying the plugin; the manifest transform's missing-file case (a clear error now); "three icons" precached five (the glob names the three); the share title. Left: the three Cloudflare checks below, and a note that `ShareButton` shares `window.location.href`, which under a Capacitor wrapper (`https://localhost`) would be a dead link — irrelevant for a TWA |
| To verify once live, in `vite preview` these cannot be seen | Workbox fetches `index.html?__WB_REVISION__=…` to precache it, and Cloudflare redirects `/index.html` to `/` (307); Workbox's redirect plugin is written for exactly that, but check that the live precache is populated. `/assets/<chunk>.js` answers `immutable`; `/_headers` is not served (Workers static assets document that it is not; it must not go in `.assetsignore`, which would stop it applying). And the plan's last check: the owner installs it on a real Android phone, turns on airplane mode and opens it — pending |
| Merged and deployed | 2026-09-15, `ffd6041`, live within 30 s. Checked on the live site: `/` links the manifest with the theme colour; `/assets/<chunk>.js` answers `public, max-age=31536000, immutable`, so `_headers` is applied; `sw.js`, the manifest and `/data/map.json` keep `max-age=0, must-revalidate`; `/index.html` and `/studio` redirect (307) to `/` and `/studio/`; `/studio/` has no manifest link and answers `X-Robots-Tag: noindex`. In headless Chromium at phone size the worker is ready with scope `/`, the precache is populated through Cloudflare's redirect (the same 10 files the local build lists), the map-file cache holds the file, no studio chunk is in any cache, and with the network cut a reload shows the routes, the basemap and "Offline · map as of 15 Sep"; no page errors. One surprise: `/_headers` itself is served (200), although Cloudflare's own page says it "will not itself be served as a static asset". Harmless — it holds two public rules and comments — and left alone: listing it in `.assetsignore` stops the upload, and it is unclear whether the rules would still apply |
| The owner installs it on a real Android phone | Done 2026-09-15, on the live site: "it's good, it's fast". **Step 6 done — and with it the six build steps** |
| Dependencies | `vite-plugin-pwa@1.3.0` and `@types/node` (the config reads Vite's manifest with `node:fs`), both dev-only; `workbox-build` and `workbox-window` come with the plugin. `npm install` rewrote 299 existing lockfile entries in place — every key package keeps its version |
| Visitors' download | The public page's own chunk 5.0 → 8.9 kB (3.7 kB gzipped) with the registration and the warm-up; `workbox-window` is a 5.7 kB chunk of its own (2.2 kB gzipped). The worker itself is fetched once and re-checked on each visit |

**APK-ready checklist**, verified: installable from Chrome on Android (manifest
with a maskable icon, `display: standalone`, a registered worker with an offline
start page — the three things Chrome asks for); opens offline to the map with
last-seen data (tested); no permission is requested anywhere (none in the code);
the commuter code assumes nothing about its origin (the map file and the worker
are fetched by path, the origin check in the map-file rule reads
`self.location.origin`) and holds no auth. Still before any APK, not now: a
domain the owner controls, and a privacy policy.

### Measured 2026-09-14 — the numbers behind these decisions

| | |
|---|---|
| Production bundle | One chunk, 1,426 kB / 384 kB gzipped. MapLibre is about 282 kB of it; editor-only source a few percent |
| One visit today | 18.2 kB gzipped from Supabase, with two directions saved |
| One direction | 8.6 kB full · 4.2 kB visitor columns only · about 1.2 kB simplified |
| Supabase Free | 5 GB egress a month · 500 MB database · 50,000 monthly active users · paused after 7 idle days · no downloadable backups |
| Cloudflare | Static files free and unlimited on every plan. Worker scripts: 100,000 requests a day on Free — keep them off the visitor path |
| OpenFreeMap | "No limits on the number of map views or requests" |
| Resend, for later | Free: 100 emails a day, 3,000 a month · Pro, $20 a month: 50,000 |
| Supabase auth email via custom SMTP | 30 new users an hour by default, adjustable |
| Leaked-password protection | Pro plan and above — not available on Free |

At 8 routes, today's code would put 100,000 visits a month about 3× over
Supabase Free. After steps 2 and 5 they cost nothing.

### Accounts, later

Not planned. Recorded so that nothing above blocks it.

- Three roles: **visitor** (no account), **member** (email account, may
  suggest), **editor** (publishes). Step 1's editor list is what separates a
  member from an editor.
- Members' suggestions go to a separate inbox table; an editor approves one by
  copying it into the real tables. The public map only ever shows what an
  editor published.
- Before sign-ups reopen: custom SMTP (the built-in mailer reaches only the
  project's team); email confirmation and CAPTCHA on; a privacy policy (emails
  are personal data, and the Philippines' Data Privacy Act, RA 10173, applies);
  a reset page in the visitor app, because M13's forwarder sends every reset
  link to `/studio/`; and Supabase Pro once real accounts exist, for daily
  backups and no pausing.
- Viewing the map never requires an account. The tightest limit will be email —
  about 100 sign-ups a day on a free sender — not the database.

---

## Ideas — dropped by the owner, 2026-09-15, after step 6

A running list, in the order they came. Nothing here is decided or scheduled;
each is written down so it is not lost, with a note on what it touches. They
feed the next phase: the owner's editor use cases and edge cases, then the
visitor interface planned together with the route cases and hotspot cases.

The owner's framing: ideas 3–6 are not Tala's quirks but how jeepney routes
work across the Philippines — directions that share road with different
partners, shortcuts, descriptive signboards, informal stops held in common.
Tala–Fairview is the worked example; the model has to hold for the rest. The
ideas get unpacked together, one at a time, into cases before anything is built.

**1. Use cases and edge cases for the editor, before the visitor interface.**
The editor is where the complexity lives ("it's complex the way I see it");
every hard case it absorbs is one the visitor never meets. Shape agreed for
writing them: the situation on the ground · what the editor must let the owner
say · what the visitor sees, in one sentence · what can go wrong. If the third
line cannot be written simply, the case is not finished. Owner writes them in
his own words; they get sorted into route, hotspot and interface cases, marked
by whether today's tables hold them or M8's metres are needed first, and the
visitor screens are sketched from them.

**2. Show the direction that starts near the person.** **Retired 2026-09-18** —
the sketch session replaced it with a direction anchored to the tap plus a
switch, which needs no sense of "where they are" at all. Kept below for the edge
cases it worked out, which the replacement still has to answer. Near SM Fairview the
card says "SM Fairview to Tala"; near Tala, the other way. Touches two
decisions: no location permission (step 4, APK checklist) and no tracking.
Permission-free sources of "where they are", weakest to strongest: the centre
of the map as panned; the tap itself; GPS behind a "Near me" button the person
presses, never a prompt on open — its own decision, later. Whatever the source,
the direction is a suggestion with a one-tap flip (⇄), because a person
mid-route wants the direction of where they are *going*, which no location
knows. Edge cases: both ends near (show both); a shared link `/?r=` names a
direction on purpose and is never flipped; a loop (M9) has no other direction,
only "which way round is shorter"; a short turn (M10) makes it a chooser, not a
flip; "near" is metres along the road (M8), not straight-line — straight-line
to the terminal is fine for a suggestion until then. Pushed one step this
becomes journey planning ("I'm here, I want to go there, which jeep?"), which
the plan holds back until the data is richer; this is its right first slice.

**3. Puntahan and balikan are not mirrors.** Tala to Fairview and Tala to
Novaliches go the same way out; Fairview to Tala and Novaliches to Tala come
back by different roads. So the two directions of one route share road with
*different* partners, and "the return trip" of a route is its own line, never
the outbound reversed. Touches: the direction naming convention (a direction is
the unit, not the route); corridor overlap (M12), which must be found per
direction; the editor's "Draw the return trip" prompt, which is right to draw
it separately.

**4. Shortcuts.** On the same route some jeepneys take a shortcut and some do
not. Touches: a sub-route that diverges with its own geometry (M10, the
"genuinely diverges" case) or an annotation on the stretch — "some drivers cut
through X" (M11); and confidence, since which drivers do it is a driver's-word
fact. A visitor should see one route with a note, not two routes.

**5. Signboards list the places along the way.** Every jeepney carries a
descriptive signboard — the string of places it passes — and those places are
the same thing as hotspots. Touches: the `signboard` field (today free text)
could be generated from, or checked against, the hotspots the direction passes,
in order; naming conventions (signboard casing was already on the list); the
visitor card, where the signboard is the first thing shown.

**6. Hotspots are the informal stops, and routes that share road share them.**
Tala to Fairview, in the owner's words: Barracks, Malaria, Pangarap, Amparo,
Dela Costa, Fatima, Lagro, "SM Terraccess" (SM Terraces?), SM Fairview Front,
"SM Fairview side Landers", SM Fairview Main. Fairview to Tala meets all of them
too. Fairview to Bigte uses part of Tala to Fairview's road, so its hotspots are
the same hotspots — consistent across routes, not copied per route. This is how
M6 already stores them: a hotspot is one shape on the map, linked to every
direction that passes through it. What is still missing is the *order* along
each direction, which M8's metres give, and a pass count for a direction that
meets the same hotspot twice (M9). Note for the cases: "meets" is decided by
the line crossing the shape, so a hotspot on the northbound side of a divided
road is a convention to settle (side-of-road, already under "Decide before the
next route is drawn").

**7. What idea 3 means for the editor — branching.** Asked by the owner:
"if I write Tala to SM Fairview, then I write SM Fairview to Tala again, so we
are branching each route?" Yes: each direction is its own drawn line, which is
already the model (route → directions → one line each; "Draw the return trip"
draws, never mirrors). The open question is Tala to Novaliches, which shares
the road out of Tala with Tala to SM Fairview. Two ways: **A**, two routes and
four lines, the shared stretch drawn twice, M12 detecting the overlap and the
hotspots on it shared by construction; **B**, one trunk with branches, drawn
once but a tree editor with every case harder. Recommendation A until the data
hurts; at 30 routes, if fixing one road in five lines is real pain, M12's
overlap is enough to add a "reuse this stretch" tool without changing what
visitors see. Short turns are not branches: M10's window. For the naming
session: is "Tala – Novaliches" its own route (a terminal pair with its own
signboard — my view) or a third direction under "Tala"?

**8. The editor should show trunk and branches.** Even if lines are stored
separately (idea 7, option A), the owner wants to *see* the sharing: Bagong
Silang has "kanan" and "kaliwa" variants, and Bagong Silang is also the end of
routes to Philcoa, Quiapo, T. Sora, Commonwealth and sometimes MRT (highway) —
a hub with many lines fanning out over the same first kilometres. Touches: M12
corridor overlap (the data behind the picture); the studio's map, which could
dim every other line and thicken the shared stretch when one is selected;
naming ("kanan"/"kaliwa" as direction or route names — for the conventions
session). The picture can exist without a tree in the database.

**9. Snap to lines already drawn.** When drawing a new direction — the return
trip, or a route that shares road with an earlier one — the snapper should
grab the earlier line, so the shared kilometres are not redrawn point by point.
Today it snaps to OSRM's roads only. Touches: M7 (`snap.ts`); this is the
"reuse this stretch" tool from idea 7 expressed as a magnet rather than a
command, which is the better form. Two cautions: the return trip is a different
road (idea 3), so the magnet must be a suggestion the owner can leave, never
automatic; and a stretch copied from another line stays a separate line — the
copy is a convenience at drawing time, not a shared trunk (idea 7, A).

**10. Arrows moving along the line.** On the visitor map a line should show
which way the jeep goes — an animated arrow flow along the direction. Touches:
the map layers (a symbol layer with `symbol-placement: line` and an arrow
icon, offset stepped each frame, or an animated dash), the editor too. Caution
for phones: animate only the selected direction, and static arrows at intervals
for the rest; MapLibre repaints the whole canvas per frame, so a permanent
animation on every line costs battery.

**11. Visitors confirm a route, without an account.** A one-tap "is this
route right?" on the card, for analytics on how true the routes are. Touches
two decisions: visitors are view-only with no contributions and no tracking
(build order), and visitors never write to the database (step 5). It would be
the first write from the public. Shape that keeps both mostly intact: one tap
per direction, "Tama" / "Mali" (or "Sakay ko na 'to"), counted per direction
per day, nothing personal stored — no account, no IP, at most a random
per-device token in the phone's storage to dampen repeats; a Cloudflare Worker
endpoint with Turnstile (free bot check) writing to D1 or KV, so the
publishable database key never gains an insert right; counts shown to the
owner in the studio, not to visitors at first. What it buys: a weak but real
second signal next to `confidence` and M11's provenance — which directions to
re-ride. What it cannot do: tell a rider's "yes" from a guess; resist a
determined spammer beyond the bot check. Recommendation: worth doing, as its
own late step after the hotspot lists exist (Phase 3 step 4), because a
"wrong" tap is only useful when the card shows enough to be wrong *about*.
Needs the owner to narrow the "no contributions" decision to "no free-text
contributions".

## Sketch session — 2026-09-18. Ideas, plus three things that are now settled

Six sketches from the owner, worked through in one sitting; the model was
reshaped four times, each smaller than the last. His closing words were "we're
just exhausting ideas, then we can reconcile everything later" — so most of
this is **not decided**, and Phase 3 below still stands except where this
section says otherwise. Written down 2026-09-21, three days late, which is how
long it existed nowhere but in one conversation.

**Settled, because they were measured or answered rather than argued:**

- **Side of road is not a feature; it is a drawing rule.** Overpass counts of
  oneway versus two-way ways in the owner's area (via `overpass.kumi.systems`;
  `overpass-api.de` returned 406): Commonwealth 81/82, Mindanao 73/74, Regalado
  41/46 — all divided, so OSM already carries two separate lines and each
  direction snaps to its own with nothing added. Zabarte 1/26, Camarin 2/24,
  Susano 0/10 — single centreline, and both directions genuinely share the
  hintuan there. **Quirino Highway is mixed, 51/105**, and it is the owner's
  main Tala–Novaliches road, so it behaves both ways along its own length. The
  only rule that follows: on a divided stretch, keep the box to one carriageway.
- **There are no barangay boundaries to use.** Tested live: Nominatim returns
  Novaliches as a *point* with a fabricated ~4.4 km square bounding box, no
  polygon; the three barangays searched returned only buildings. Any grouping
  by area would have to be drawn by hand, so it is not worth doing.
- **A route owns its head and tail** — answered 2026-09-21, see "Naming and
  creating a route".

**The model, as it stands after four reshapes** (not decided):

- A hotspot is **a name and one or more boxes**; a terminal is exactly one box.
  The same name in several places is what matches a papunta's end to a
  balikan's start. This kills the "cluster" or "general hotspot" table that was
  invented for that job, and the four rules invented with it. Cost if adopted:
  `stop.area` holds one polygon today, so it needs a migration. *Adopted
  2026-09-21 without that cost: the "name" is a shared informal name on each
  box, not a shape, so one polygon per row is exactly right — see "Hotspot
  names".*
- A route is a name, a head hotspot, a tail hotspot, and two drawn directions.
- If grouping is ever wanted — "routes ending anywhere in Novaliches" — the
  cheap retrofit is a text label on the hotspot, never geometry.

**The interaction (sketches 3–6), not decided:**

- **Arrows inside one line beat two offset lines.** An offset drifts at low
  zoom and mitres badly on sharp corners, and only says "there are two"; an
  arrow says *which way*. Full overlap is the exception anyway, because the two
  directions take different roads (idea 3).
- **Arrows only on selection.** Tap a hotspot and arrows appear over a *range*
  around it, fading out; tap a route and they run the whole line. MapLibre
  cannot slide symbols along a line, so the cheap approximation of the owner's
  mockup is static arrows plus an animated dash.
- **Group directions at a hotspot by bearing**, not by a two-way toggle. Two
  groups render as the owner's switch; a junction hotspot gets sections instead
  of a broken toggle. Free to decide now, expensive later.
- **This retires idea 2 entirely** — see the note on it in the ideas list.

**Free, found during the session:** the dimming of unselected routes is already
built (`useSavedRoutes.ts:202`, opacity 0.35), and `entryDistance()` in
`geo.ts` already gives metres along a line into a hotspot's ring — so the fade
range needs no migration and no M8. Sketch 6's trunk-and-branch picture
therefore needs no M12 overlap work either: bright-selected over dim, on
separately stored lines, *is* the picture.

**The blue dot, from a later sketch the same day.** The owner asked whether a
person's location could open a hotspot card without a tap. This is exactly the
decision step 4 parked. It is three separable decisions, not one: show a dot on
request (small); nudge the nearest hotspot (small); auto-open its card — the
one to resist, because the hotspots on the owner's own list sit about 500 m
apart and GPS at ±10–50 m against 30–80 m boxes makes "inside the box"
unreliable; his own sketch draws the dot *outside* the box. If it is ever
built: "nearest within ~150 m", and `getCurrentPosition` behind a button, never
`watchPosition`. **Location picks the place, never the direction** — a rider
mid-route wants where they are *going*, which no location knows — so the switch
survives either way. No geolocation code exists yet, and the no-tracking
promise survives literally: visitors read a static file, and there is no backend
to send a coordinate to.

---

## Phase 3 — the plan from the ideas. Drafted 2026-09-15, awaiting the owner's go

Consolidates ideas 1–10 and M8–M12 into one order. Same rules as the build
order: **no step starts without the owner's go, one at a time**; each part ends
in a check; a failed check stops the line.

**Status 2026-09-21.** Step 0 is under way: the route name and the four drawing
actions are decided (see "Naming and creating a route"); direction names,
hotspot spellings, side of road, `confidence` and the mode enum are not. Steps
6 and 7 were revised by the 2026-09-18 sketch session and now depend on less
than they did. Nothing is built.

### The model, in four sentences

1. **The direction is the unit.** "Tala to SM Fairview" and "SM Fairview to
   Tala" are two lines, two signboards, two hotspot lists. A route is a name
   over its directions.
2. **Hotspots are the shared vocabulary.** One shape per place, linked to every
   direction that crosses it; never copied per route.
3. **The editor absorbs the complexity.** Every case is written for the editor
   first; the visitor gets one sentence per case, or the case is not done.
4. **Lines stay separate; sharing is a picture and a magnet, not a tree.**

### The steps

| # | Step | What it is | Needs | The owner does |
|---|---|---|---|---|
| 0 | Naming conventions | The decisions under "Decide before the next route is drawn", now with the ideas' questions added: a route is a terminal pair with its signboard (so "Tala – Novaliches" is its own route); how directions are named; "kanan"/"kaliwa"; hotspot names and spellings ("SM Terraces"?); side of road for a hintuan; the field method behind `confidence`; the mode list. I propose, the owner decides. A short migration if a decision needs a constraint | Nothing | Decide. Then draw again |
| 1 | Cases | The owner's use cases and edge cases for the editor, in the four-line shape (situation · what the editor must let you say · what the visitor sees · what can go wrong). Sorted into route, hotspot and interface cases; each marked "today's tables" / "needs M8" / "needs a decision". The visitor screens sketched from them | Step 0 | Write them, rough is fine |
| 2 | Snap to earlier lines (idea 9) | The magnet grabs a line already drawn before OSRM's roads, shown clearly, always leavable. Borrowed points are identical, which makes overlap exact later. *Check:* draw Tala to Novaliches borrowing the first kilometres of Tala to SM Fairview without placing a point on them; the return trip is not grabbed where it takes another road | Nothing; best done while routes are few | Draw the next route with it |
| 3 | M8 — metres along the line | Every hotspot link gets `dist_m`; `allTouches` for a line that meets a shape twice; migration 0006. The foundation for order, short turns, loops and "near" | Step 0 (names settle before positions are stored) | — |
| 4 | Hotspots in order, and the signboard (ideas 5, 6) | Each direction lists its hotspots in order of metres; the signboard is generated from that list, or checked against it, so it cannot drift. The visitor card shows the string of places. *Check:* Tala to SM Fairview reads Barracks … SM Fairview Main in order; Fairview to Tala reads it back; Fairview to Bigte shares the same hotspot shapes | Step 3 | Confirm the lists against the signboards |
| 5 | Short turns and loops (M10, M9), as the cases demand | "Tala to Malaria only" as a window onto its parent, no drawing; a loop as one direction with pass numbers, and no "Draw the return trip" for it. Only the shapes the cases actually contain | Steps 1, 3 | Name the real short turns and loops |
| 6 | The visitor: direction and arrows (ideas 2, 10) | **Revised 2026-09-18.** Idea 2's "nearest direction" is retired: the direction is anchored to the tap, with a switch, and no sense of location is needed — so this step no longer depends on step 4's metres. Arrows go *inside* the line, not as an offset, and appear only on selection: over a fading range around a tapped hotspot, over the whole line for a tapped route; static arrows plus an animated dash, because MapLibre cannot slide a symbol along a line. Directions at a hotspot group by bearing, which is what renders as the switch. *Check:* on the real phone, the switch reads right at both ends; battery and frame rate acceptable | Nothing, after the revision | Try it on the phone, both ends |
| 7 | The trunk picture and shortcut notes, then M12 overlap (ideas 8, 4) | **Revised 2026-09-18.** The picture comes first and nearly free: bright-selected over dim, on separately stored lines, already *is* the trunk-and-branch view, and the dimming is built (`useSavedRoutes.ts:202`). M12's corridor overlap — spans per direction — is no longer what the picture waits on; it becomes a later authoring check, for catching a duplicate about to be drawn. Shortcuts stay an M11 annotation on the stretch with a confidence, not geometry, until a screen needs the other road. Bagong Silang's fan-out is the test | Steps 2, 3 for the overlap; the picture needs neither | Check the picture against what drivers say |
| 8 | Visitors confirm a route (idea 11) | One tap, "Tama" / "Mali", per direction per day, nothing personal; a Worker endpoint with Turnstile writing to D1/KV; counts in the studio. *Check:* a tap from the phone counts once; a script without the bot token is refused; the database key still cannot insert | Step 4, and the owner narrowing "no contributions" to "no free-text contributions" | Decide; then tap a route you know |
| — | Later, not planned | Journey planning ("I'm here, I want to go there"); a real trunk-and-branch structure, only if editing the same road in many lines becomes real pain at ~30 routes; GPS "Near me"; M5 export and tidy whenever convenient | | |

Why this order: decisions before positions (0 before 3), because a stored
metre is tied to a named direction; the magnet early (2), because it pays off
on every route drawn after it and nothing depends on it; metres (3) before
anything that lists, orders or windows; the visitor changes (6) after the data
they read exists; the picture (7) last, because it is a view over everything
before it.

**Alongside, at any time, the owner:** draws routes once step 0 is settled;
keeps banking ideas in the list above; takes the monthly backup (mid-October);
designs in Figma — the visitor screens from step 1 and a design system. The
code side is ready for it: the theme lives in `src/shared/index.css`
(`@theme`, Tailwind v4 tokens), Storybook is the catalogue of the components
as built, and a Figma file can be read directly here (frames, variables) to
turn a design into code or check code against it.

---

## Naming and creating a route — decided 2026-09-21

Phase 3 step 0, first part, settled with the owner from his sketches while the
route table was empty — the cheapest moment there will ever be. Two halves: how
a route is named, and the four actions that produce every shape he draws.

### How a route is named

| # | Rule | Why this one |
|---|---|---|
| R1 | **The name is generated from the two end hotspots**, never typed: `Tala – SM Fairview`. The owner's "standard name": pick a head, it must have a tail | A route already *is* a head and a tail. Rename "SM Terraccess" to "SM Terraces" once and every route through it reads right forever; a typed name would need the same fix hunted across rows |
| R2 | **The staging terminal comes first** — where the jeeps are based and wait | `Tala – SM Fairview`, `Bagong Silang – Philcoa`: the owner's own word order. Alphabetical needs no judgment but reads wrong out loud, and a route name is read out loud |
| R3 | **The separator is ` – `**, a spaced en dash, applied by the app | Never typed, so it cannot vary between a hyphen, a dash and a slash |
| R4 | *(Parked 2026-09-25: the owner is dropping the word, not the job — see "Step 0 answers".)* **`via` only when the pair repeats.** Same two ends by different roads → `Tala – Novaliches via Zabarte` and `… via Camarin` | The kanan/kaliwa case (idea 8). The `via` names the one place that *differs*, not the path. Uniqueness becomes (head, tail, via), enforced by the database |
| R5 | **The signboard stays separate, and stays observed** | The signboard is what is painted on that jeep, in its own words, and two jeeps on one route may disagree. The name is the tidy pair. One field cannot hold both honestly — and idea 5 later generates the signboard from the hotspot list, which only works if it was never the name |
| R6 | **`route_code` carries real LTFRB/DOTC codes only**, filled later from reference data (M12); `short_name` stays empty until something needs it | An invented code looks official, which is worse than having none |

Three questions the owner answered:

- **The route owns head and tail.** One pair, shared by both directions. This
  closes the question left open by the 2026-09-18 sketch session. It briefly
  looked overturned: his sketch gives SM Fairview four tails — Tala, Amparo,
  Capitol, Bagong Silang Kanan 5 — against Tala's two, and ends that do not
  match cannot live in one pair. In that example the four turned out to be one
  line with three windows onto it (short turns), not four ends, so the pair
  survives. The cost stands, as accepted the same morning: where a papunta
  genuinely ends on a different corner than the balikan starts, the model cannot
  say so. A real case of that, met while drawing, is the trigger to revisit —
  and the retrofit, a per-direction end, should be resisted, because R1 only
  holds while there is exactly one pair to generate from.
- **The generated name is locked.** No override field exists. A name that reads
  wrong is then evidence that a *hotspot* is named wrong, fixed at the source,
  which improves every other route touching it. An override is how a naming
  convention quietly dies: the escape hatch becomes the habit.
- **Place names are the local name, as people say it** — `SM Fairview`, `Tala`,
  `Bagong Silang`. Title Case, never ALL CAPS even though the windshield is:
  caps can be generated for display and cannot be un-generated. Not the official
  name — nobody says "Barangay Bagong Silang" — and not whichever signboard was
  seen last.

### The four actions that make every shape

Everything in the sketches reduces to these. Only the fourth is real new work.

| Action | What it makes | State |
|---|---|---|
| **Draw** | The route and its first direction. Head and tail are hotspots; the name follows from them | Built, minus the hotspot pickers |
| **Draw the return trip** | The other direction, drawn fresh against its own roads — never the outbound reversed (idea 3), which is what the owner's red line shows | **Built** — `StudioApp.tsx:342`, offered the moment a direction is saved |
| **Ends early here** | A short turn. Pick a hotspot the line already passes; it stores no geometry, only a window onto its parent (M10). Fix the parent and every short turn under it is fixed | New, small. The metre needs no typing: `entryDistance()` in `geo.ts:185` already measures where a line enters a hotspot's ring |
| **Extend at either end** | A **new route** that borrows an existing direction's line and adds road at one end only, so the borrowed kilometres are never redrawn. Either end: a new tail from the same head (`Tala – SM Fairview` → `Tala – Novaliches`), or a new head to the same tail (`SM Fairview – Tala` → `Novaliches – Tala`), which is how the sketches of 2026-09-21 actually draw it | **Built 2026-09-25** — see "Extend — built". This is Phase 3 step 2 (idea 9's magnet) as a button, which is the better shape — a magnet is a suggestion, a button is an intention |

Decided with them:

- **An extension is its own route, grouped by the end it shares.** `Tala –
  Novaliches` is not a variant of `Tala – SM Fairview`, because a commuter on
  the shared stretch has to flag down the right jeep and those are two different
  jeeps. The studio groups every route sharing an end under one list, so the
  owner still sees the fan he sketched. The grouping is a view over separate
  rows, not a table — which is also how sketch 6's trunk picture comes free.
- **The borrowed trunk is copied, and the borrow is recorded.** The new line
  stores its own full geometry, so nothing downstream — hotspot links, metres,
  publishing, tapping — has to resolve a reference. One nullable column
  remembers which line it borrowed from and how far, which is what later allows
  "you changed this trunk; 3 lines that borrowed it no longer match". The copy
  is point-for-point identical, so M12's overlap finds it exactly. A real shared
  trunk stays refused until the data hurts (idea 7, option A).

**The tails in the sketch are examples, not the dataset.** Tala → SM Fairview,
Novaliches and SM Fairview → Tala, Amparo, Capitol, Bagong Silang Kanan 5 were
drawn to show the *shape*, and the owner has still to standardise the real
routes against how he draws them. What is decided here is that all four shapes
exist and what each costs; which real route is a short turn, an extension or a
route of its own is settled route by route, at the drawing, and the answers
belong in step 1's cases.

### The card, and a direction before it is drawn

From four more sketches the same day, 2026-09-21.

- **A direction exists before its line does.** Saving `Tala → SM Fairview`
  creates `SM Fairview → Tala` at once, as an empty slot with no geometry. The
  card can therefore always be flipped, and flipping is *how the owner creates
  the return*: the slot is the prompt. It also hands the studio a to-do list —
  every undrawn return, visible without hunting for it.
- **An undrawn direction says so.** On the visitor card the flip still works,
  names the direction, and states that the return trip is not mapped yet. A
  commuter can then tell "no jeep goes that way" from "nobody has drawn it
  yet", which are different facts — and the map keeps its promise never to
  pretend to know something.
- **One line at a time.** The map draws the direction the card is showing, not
  both; flipping swaps the line. This removes the two-offset-lines problem at
  the root (sketch session, 2026-09-18) and leaves the in-line arrow as the
  thing that says which way the jeep goes.
- **An end becomes a stop when something extends past it.** SM Fairview is the
  tail of one route and a hotspot in the middle of another. No data change —
  M6 already links one shape to every direction crossing it — but the card
  renders an end differently from a stop, as the sketches do.
- **A pair of hotspots on one line needs no drawing.** `Novaliches → SM
  Fairview` is the slice of `Novaliches → Tala` between those two places, the
  same machinery as a short turn, with the metres from M8. So most of what the
  owner's destination lists would offer costs nothing to produce.

**Deferred, on the owner's call:** what exactly fills the "where to?" list when
a visitor taps a hotspot, and the signboard with it — "that one is really
informal". Both wait. One consequence to take now rather than later:
`signboard` is a required field because it was what made a route recognisable,
and R1 moved that job to the generated name, so the field can become optional
and be filled in when the owner is sure. Until the list is decided the visitor
UI stays as built: tap a line, get a card.

**Worth saying out loud.** "Tap a place, choose where you are going, get the
jeep" is journey planning, which this plan holds back under *later, not
planned*. Restricted to one jeep and no transfers it is cheap and safe, and it
is what these sketches ask for. The line is being crossed on purpose, not by
accident.

### What it costs before the next route is drawn

- **A migration** (the next free number; M8 claims 0006, so whichever lands
  first takes it). `route` gains `head_stop_id`, `tail_stop_id` referencing
  `stop`, and `via text`, with `unique (head_stop_id, tail_stop_id, via)`.
  `route_variant.origin_terminal` / `destination_terminal` — free text typed per
  direction — become redundant and drop a release later, the way `stop_sequence`
  does in M8. `long_name` stops being written by the form: the name is computed
  on read, so a hotspot rename needs no backfill. Nothing to migrate — the route
  table is empty.
- **A changed save panel.** "Route name" as a text input disappears; in its
  place two hotspot pickers and an optional `via`, with the resulting name shown
  greyed as it will read. Signboard is untouched: required, typed, the jeep's
  own words.
- **A new failure to handle.** Both ends must exist as hotspots before a route
  can be saved. Either the picker creates a terminal inline, or drawing the ends
  creates them — the first interface case for step 1, and one the owner's own
  list should answer.
- **A question to settle when the short turn is planned.** M8 is written as the
  floor under M9–M12, but a short turn's span is two numbers on `route_variant`,
  and `entryDistance()` computes both today. Whether it can land before M8, or
  whether that is borrowing trouble, is decided then — not here.
- **The empty slot needs no migration.** `route_variant.shape` is already
  nullable and `control_points` / `segments` already default to `[]`, so a
  direction with no line is storable today; `routes.ts` types `shape` as
  nullable and `publish-map.mjs` already writes `shape: null` when a row has no
  coordinates. The work is in what reads it: keep a shapeless direction out of
  the drawn layers, and make the card say the return trip is not mapped yet
  instead of showing an empty one.
- **`signboard` becomes optional**, per the deferral above — a column change and
  one `required` removed from the save panel.

### Built — slice 1, the new way to save a route. 2026-09-21

The first of four slices (1 save · 2 the card and its flip · 3 extend at
either end · 4 ends early here), with the owner's go. Type check, build, build
guard and Storybook all pass. **The check is the owner's**, after the migration
is applied: draw a line, pick the hotspot at each end, save → the name reads
`Tala – SM Fairview`, and the route has two directions, one with no line.

| Part | What was done |
|---|---|
| `0006_route_ends.sql` | `route` gains `head_stop_id`, `tail_stop_id` (required, referencing `stop`) and `via`; a unique index on (head, tail, `coalesce(via,'')`) so a bare pair cannot repeat; `signboard` becomes optional. `route_variant` gains `reversed`, loses the unique on `direction_name` (now nullable, no longer written) and gains a unique on (`route_id`, `reversed`): exactly two per route, enforced. Nothing to migrate — the table is empty |
| `routes.ts` | `routeName()` and `directionName()`, the only places the ` – ` and the `to …` live. `nameVariants()` fills `route.name` and `direction_name` from the hotspot list after a load; **nothing stores either** |
| `live.ts` | `listVariants()` loads the stops alongside and names the rows |
| `routesWrite.ts` | A new route is inserted with **both** directions at once, the drawn one and an empty slot (`shape` null, `[]` points). "Draw the return trip" is now an update that fills the slot, found by (`route_id`, `reversed`); deleting a direction leaves its slot, and the route goes only when neither has a line |
| `SavePanel.tsx` | "Route name", "Direction" and the two terminal inputs are gone. In their place: Head and Tail pickers (terminals listed first; **since 2026-09-22 they list places, not boxes** — see "Ends are places"), guessed from the hotspot nearest each end of the line; `via`; the generated name shown greyed with "Rename a hotspot to change it"; which way round the line runs, read off the geometry — whichever end it starts nearest is the end it starts from. Signboard optional. Refuses a save whose two ends are the same hotspot, and explains what to do when no hotspots exist yet |
| The cards | `RouteCard` and `Chooser` lead with `route.name`; the signboard, when known, is a second line ("Signboard: …"). The Terminals row is gone with the fields it read. `HotspotCard` and `HotspotPanel` group by the name |
| The map's features | `properties.signboard` → `properties.name` in `useSavedRoutes`; `phone-test` and `uitest` read the new key |
| `publish-map.mjs` | Selects the new columns, resolves both names from the stop rows (fails loudly if an end is missing, which the foreign keys make impossible from a readable table), and writes `reversed`, `route.name`, `head_stop_id`, `tail_stop_id`, `via` into the file. A direction with no line is published with `shape: null` |
| Stories | Fixtures carry the new fields; `SavePanel` stories get two sample terminals so the pickers have something to guess. Screenshotted: the guess, the name and the direction line all read right |
| Not run | The headless suites. None of them saves a route (a bypassed session cannot write), the route table is empty so route checks would skip, and the memory rule says not straight after an edit. The `phone-test` / `uitest` key rename is therefore untested until a route exists |

Left for the owner, in order: apply 0006 in the SQL editor · rename "Tala
Jeepney Terminal" to what a driver would be told, if the hotspot-naming rule
lands as proposed · draw a terminal at SM Fairview · draw Tala – SM Fairview and
look at what the panel says before pressing Save.

Two things slice 2 has to do before routes are published: keep a shapeless
direction out of the drawn layers (today it is filtered by `line.length > 1`,
which is enough not to crash, but not a statement), and make the card say the
return trip is not mapped yet instead of offering an empty one.

### Hotspot names — decided and built 2026-09-21

From the owner's sketch the same afternoon, after slice 1 landed: a table of
"Original Name" against "Informal name" — Tala Jeepney Terminal / Tala; SM
Fairview Terminal A (a terminal), SM Fairview Terminal B and SM Fairview
Ilalim (hintuans) / all SM Fairview — with three rules in the margin: both
kinds can carry an informal name; a terminal is one box only; a hintuan is
many boxes that can be named as one; and there can be more than one informal
name. His stated goal: *"help me give users more recommendation and options
to choose from, since informality is our enemy here."*

| # | Rule | Why this one |
|---|---|---|
| H1 | **A box has two names.** `name` is what is written on the ground — "SM Fairview Terminal B". `informal` is what people say — "SM Fairview". Informal is optional; when blank, the box shows its name | The plan already said "the local name, as people say it"; the sketch keeps the formal one too, and both are facts worth keeping. Neither is invented |
| H2 | **The route name reads the informal name** (`stopLabel`: informal, else name) | R1 gives `Tala – SM Fairview`, never `Tala Jeepney Terminal – SM Fairview Terminal A`. So do the cards and the pickers. **The label on the map is the exception, corrected 2026-09-22:** it names the box under it, so it reads `name`. The owner met it the first time he looked — his SM Fairview box was labelled "SM Fairview" where the ground says "Fairview Teraccess" — and three boxes of one place would have carried three identical labels |
| H3 | **Boxes that share an informal name are one place.** No group table; the shared string *is* the group | The 2026-09-18 conclusion, kept. Adding a fourth SM Fairview box is one row and no linking step. If a place ever needs facts of its own, the string becomes a table in one migration — the retrofit already planned |
| H4 | **One terminal per informal name**, enforced; any number of hintuans | The owner's "terminal one box max only", stated so the database can refuse a second SM Fairview terminal instead of doubling the place a route can end at. Case-folded (`lower`) |
| H5 | **`aliases`: the other ways people say it**, a list on the box | "Fairview", "SM City Fairview". For a search or a "where to?" list to match any of them. **Nothing reads them yet** — the visitor list is deferred — but naming is cheapest at five rows, and the owner types them while he still remembers them |
| H6 | **Normalised on save, never in the database.** Trim, collapse inner spaces, drop an informal name that only repeats the name, drop blank and repeated aliases. Case is left alone | "SM  Fairview" must not become a second group. The studio also offers the informal names already in use as suggestions while typing, so a new box joins its group by picking, not by retyping |

Two limits, both fine at this size. A shared string is a weak link — the
suggestions and the normalising are what hold it — and a list of aliases is
not a search index, but the phone already holds every hotspot from the
published file and scans them instantly; that holds to thousands of boxes.

**Built, same afternoon.** Type check, build, build guard, Storybook and a
rolled-back database probe all pass. The panel cannot be reached headlessly —
under the bypass, Done opens the sign-in door — so it got a story of its own
and was screenshotted there, with the card, the chooser and the save panel's
pickers: "Tala · Tala Jeepney Terminal", name `Tala – SM Fairview`. The check
is the owner's, in the studio.

| Part | What was done |
|---|---|
| `0007_stop_names.sql` | `stop` gains `informal text` and `aliases text[] not null default '{}'`; a partial unique index on `lower(informal)` where `kind = 'terminal'`. Applied 2026-09-21; the five rows carry null and `{}`. Probed: a second terminal under "probe place" against "Probe Place" is refused, two hintuans under it are accepted |
| `stops.ts` | The fields on `StopSummary`; `stopLabel()`, the one rule for which name shows; `normaliseName()`; `parseAliases()` |
| `routes.ts` | `nameVariants()` names routes from `stopLabel`, so `Tala – SM Fairview` |
| `stopsWrite.ts` | Normalises both names, writes `informal` only when it differs from `name`, writes the aliases; turns the index's refusal into "There is already a terminal called …" |
| `HotspotPanel.tsx` | "Name (as written on the ground)", "Informal name (what people say)" with a datalist of the informal names already in use, "Also called" comma-separated. `StudioApp` passes it the hotspots for the datalist |
| `SavePanel.tsx` | The end pickers read "SM Fairview · SM Fairview Terminal A"; the generated name uses the informal name. *Superseded 2026-09-22: the pickers list places — see "Ends are places"* |
| The cards and the map | `HotspotCard` and `Chooser` lead with the informal name and show the name on the ground as a small second line when it differs; the map label (`useSavedStops`) is the informal name **— changed to the ground name on 2026-09-22, see H2**; the studio's Saved / Delete messages too |
| `publish-map.mjs` | Selects and writes `informal` and `aliases` after `name` in each stop; the route name is generated from the informal name. The published file gains two keys per hotspot, so the next nightly publish writes a change |
| Stories | Fixtures carry the fields; the sample terminal is "Tala Jeepney Terminal" with informal "Tala" and two aliases, so the card's second line shows. New `HotspotPanel.stories.tsx`: a new hintuan, a new terminal, and editing the Tala terminal with both names and its aliases |
| Not run | The headless suites, as for slice 1 — a bypassed session cannot save a hotspot, and the memory rule says not straight after an edit. `hotspot-test` traces and cancels a hintuan without filling the panel, so the new fields do not change what it does |

### Map design control — built 2026-09-21

The owner asked for a way to toggle the map's look. Built the same evening,
with his go; outside Phase 3, no data involved.

- **Three designs, all OpenFreeMap:** Gray (Positron, the default), Colour
  (Liberty), Dark. All three serve the same `/planet` tiles, sprite and glyph
  endpoint, so a switch fetches one style file (20–45 kB) and wastes nothing
  a phone has cached. Dark's own labels use only Noto Sans Regular, but the
  glyph endpoint is per font, so the bold hotspot labels still resolve.
- **One control, both pages.** A round button under the zoom buttons (under
  the attribution on a phone), opening three radio items. It lives in
  `MapView`, so the visitor map and the studio share it.
- **The switch keeps everything drawn on top.** `setStyle` replaces sources
  and layers wholesale; `applyBasemap` (`shared/basemap.ts`) uses MapLibre's
  `transformStyle` hook to carry ours across — exactly the GeoJSON sources
  (the basemaps use vector and raster only) and the layers drawn from them,
  appended in their old order, so casing-under-line and draw-above-saved hold.
  The route, hotspot and drawing hooks never notice. Driven headlessly on the
  dev server: eight hotspot features and a three-corner half-drawn hintuan
  survive Gray → Colour → Dark → Gray in the studio and on the public map.
- **Remembered on the device, only once chosen.** `parapo.basemap.v1` in
  local storage; choosing Gray removes it. A visitor who never touches the
  control leaves storage empty, which `visitor-test` asserts. The map is
  built with the remembered design, so it never flashes gray first.
- **Offline:** the worker already caches anything under `/styles/`, so a
  design opened once is available offline; one never opened is not, the same
  rule as tiles. `pwa-test` still finds `/styles/positron` in the meta cache
  because the default did not change.
- **Not changed:** the route and hotspot colours. They were chosen against
  gray; screenshots on Dark and Colour read fine, so no per-design palette.

### Gray, detailed — built 2026-09-22

The owner put an openstreetmap.org screenshot of SM Fairview beside the gray
map and asked why ours felt thin, and whether the detail could be had. Measured
before answering, all over the SM Fairview hintuan:

- **The detail is mostly already on the phone.** The z14 tile there is 253 kB
  and carries `poi`, `housenumber`, `building`, `landuse` and `park`. Of 22
  names read off the screenshot, **19 were in the tile** — Novaliches Public
  Terminal and Nova Stop among them. Positron has 55 style layers and **no**
  layer reading `poi`; Liberty has 111 and four. The three misses (Fitness
  First, Timezone, Kaji Building) are indoor tenants and a building *name*,
  which the OpenMapTiles schema drops — no style brings them back.
- **Past z14 there is nothing more.** OpenFreeMap's tiles stop at z14 (a z15
  request returns 200 with 0 bytes) and MapLibre overzooms. Lines stay sharp;
  no new feature ever appears.
- **openstreetmap.org's own tiles are ruled out.** 256 px raster at 1× only,
  z20 → HTTP 400, labels baked in, and holding one z14 square (2.37 km a side)
  offline at z14–19 measured **12.9 MB against 0.25 MB** for the vector tile —
  52×. Their usage policy forbids bulk downloading, which is what the service
  worker does. A self-hosted Protomaps extract is the honest version of that
  road, if tracing accuracy ever demands it; it is a project, not an afternoon.
- **Drawing precision does not come from the backdrop.** Routes snap through
  OSRM (`snap.ts`), full OSM geometry. Only freehand tracing — hotspot boxes —
  depends on what the eye can see.

**Built, with the owner's go, and checked by him the same evening — "it's good".** A fourth design in the same control. Positron
plus layers drawn from the `poi` source-layer already in every tile, so it
costs no request and no cache. Gray stays the default.

| Part | What was done |
|---|---|
| `basemap.ts` | `detailStyle()` appends four symbol layers and firms the building fill (rgb 234 → 224). `detail-stations` from z13: `bus_station` and `railway`. `detail-stops` from z15: `bus_stop`. `detail-landmarks` from z15: grocery (supermarket, market, department store), mall, hospital (not clinic), college, town hall, police. `detail-landmarks-minor` from z16: school, church, fuel, park — at z15 those were 64 labels under one view and crowded the anchors out; tiered, 26. Gates (2,594 under one viewport), convenience stores and eateries stay hidden. Icons are the sprite's own `<class>_11`, at 75 %; text is Noto Sans Italic 11 in gray, transit in slate — italic is the basemap's voice, bold is ours |
| First load | `Map` takes a style URL or object and has no transform hook, so a remembered detailed design cannot be built through the URL. `initialStyle()` fetches the style and adds the detail before the map exists — the same single request MapLibre would have made, verified: one `/styles/positron` fetch on reload, detail layers present at `load`, no plain-gray pass. A failed fetch falls back to the URL |
| The switch | `styleTransform()` does both jobs the old hook did one of: add the detail when asked, then carry our GeoJSON sources and layers across on top. Checked: all 16 of our layers sit above the last detail layer after a switch; 20 hotspot features survive |
| Taps | Unaffected by construction: `tapTargets` queries the two hit layers by name |
| Checks | Type check, build and its guards pass. Driven headlessly in the studio at z15 and z16 and on the visitor map at phone size with the design remembered: no image or glyph warnings, no page errors, no database request from `/`. The only console warnings are Positron's own shield filters and SwiftShader's GPU note, both pre-existing |
| Not done | House numbers (in the tile at z14, tiny value while tracing) and oneway arrows (`transportation.oneway` is in the tile — the very field the 2026-09-18 Overpass count measured; a cheap next step for the side-of-road rule, not started) |

### Drawing keys — built 2026-09-22

The owner asked for Ctrl+Z; M5 had asked for Esc, Ctrl+Z and Enter since
8 September. Built with his go, **without Esc** on his call: cancel discards
the whole trace and its draft, and that should not be one stray key away.

- **Ctrl+Z / ⌘Z** undoes the last point or corner, exactly as the button does.
- **Enter** is Done — only when Done is enabled, so a half-routed line cannot
  be sent to the panel by a keystroke.
- **F** toggles Freehand while tracing a route; a hotspot outline has no
  freehand, and the key does nothing there.
- **Quiet while a panel is open** (`keys` prop from the studio: off during the
  save panel, the sign-in door, the password forms) and **quiet while typing**
  in any field, so Enter submits the form and Ctrl+Z is the browser's own
  undo. Each button's tooltip names its key.

Not built: redo (nothing keeps what undo pops, and a snapped segment would
need re-snapping — the next small thing if undo is overshot often).

Pressed for real, headless, on the dev server: F on and off; Enter with no
points does nothing; three clicks then Ctrl+Z leaves two; Enter at two opens
the door; with the door open F and Ctrl+Z change nothing; "f" typed in the
email field stays in the field; Esc leaves the trace where it was. 12/12,
no page errors. Type check, build and its guards pass.

### Ends are places — 2026-09-22

The owner opened the save panel with seventeen boxes on the map and saw the
pickers list every box — "SM Fairview · Fairview Teraccess (hintuan)" twice,
"Lagro (hintuan)" twice — and asked for the informal names only. He was
applying H3 to the form: **a route ends at a place, not at one of the boxes
drawn there.** The pickers now list places — boxes grouped by the name people
say, case-folded so a stray "SM fairview" cannot become a second entry — one
line each, the places with a terminal first. The terminal's spelling names
the place. No box name is ever shown.

`route.head_stop_id` still references one row, so a chosen place resolves to a
box: its terminal when it has one (H4 holds that to one row), else the box
nearest that end of the line — the one the jeep actually stops at. The guess
runs the same way: nearest box → its place → the place's own box. Two ends
that are the same *place* are refused, not just the same box.

Checked in Storybook on a fixture mirroring the live list (two terminals,
eleven hintuans): six places, no box name, one SM Fairview, Tala – SM Fairview
guessed, a hintuan-only place accepted as an end, same place refused. Type
check, build and guards pass. Not yet exercised against the live table — no
route has been saved.

Seen in the live rows while doing this: one box carries the informal name
"SM fairview", lower-case f. The picker folds it in, but its own card and map
label still say "SM fairview". Worth fixing at the box.

### The first route, and why it did not save — 2026-09-22

The owner drew Tala – SM Fairview (3 points, 9.79 km) and pressed Save. The
panel said `duplicate key value violates unique constraint "route_ends_unique"`.
Postgres's log had the real story, three requests eight seconds apart: the
`route` row was created (201); the two-direction insert was refused (400,
*null value in column control_points violates not-null constraint*); his
second press then met the unique index (409) for a route with no directions
and no card to reach it from.

**Cause.** A PostgREST rule: rows inserted in one request must share one
column list, and a key one row lacks is sent as **null, not the column's
default**. The empty slot went up as `{route_id, reversed}` beside the drawn
direction's five keys, arrived as `control_points = null`, and the table did
what 0001 told it to. The schema was never at fault: every 0006 change is
live exactly as written.

**Fixed.** The slot spells out every key (`control_points: []`, `segments: []`,
`shape: null`). And because the route and its directions are two requests,
not one transaction, a failed second request now deletes the route row it
just made rather than leaving an orphan. And a save that meets an existing
route with the same ends now looks at it: **no directions means an orphan, and
the save adopts it** — same ends, same name, unreachable from any card — after
bringing its signboard, mode and fare note up to what was just typed. Directions
present means a real duplicate, refused in words: give it a `via`. The orphan
from 07:46 UTC (the owner pressed Save on it again at 08:03) is therefore
filled by the next press, not deleted by hand.

**The honest shape is one transaction** — a `create_route()` function taking
the route and its drawn direction, inserting all three rows or none, security
invoker so RLS still rules, pinned `search_path`, revoked from public and anon
as 0005 requires of every function. Migration 0008 when the owner wants it;
the compensating delete covers the gap until then.

Not exercised headlessly — a bypassed session cannot write. The check is the
owner's: press Save again on the same line.

### The first return trip — 2026-09-22

**Slice 1 works end to end.** With the orphan adopted, Tala – SM Fairview
saved at 08:08:09 UTC with both directions, one empty; the owner pressed
"Draw the return trip", drew Fairview → Tala (6 points, 10.89 km) and filled
the slot at 08:09:15. Both rows read right: `reversed=false` starts at Tala,
`reversed=true` starts at SM Fairview.

Then he said *"it's not reversing."* The data was; the panel wasn't. It led
with the route name — **Tala – SM Fairview**, which R1 keeps the same for both
directions — with the direction as a footnote, *"this line is the one to
Tala"*, under Head and Tail pickers locked to Tala and SM Fairview. Read
together, that says "not reversed". Two changes:

- **A direction is named from both ends:** `SM Fairview → Tala`, not `to
  Tala`. `directionName()` in `routes.ts` and its copy in `publish-map.mjs`;
  the cards, the chooser and the page title read it unchanged. The plan's own
  words for a direction were always "SM Fairview to Tala".
- **The panel leads with the direction.** *This line is the direction* **SM
  Fairview → Tala** *of the route Tala – SM Fairview*. The route name is still
  there, second, generated from the same two ends.

And a hazard closed in the same flow: the slot's `reversed` was inferred from
where the line starts, so a return trip drawn from Tala again would have
targeted `reversed=false` and **overwritten the outbound**. The studio now
passes the empty slot's own flag (`slotReversed`), the panel uses it, and a
line that starts at the wrong end gets an amber warning — not a block, since
a line can honestly begin nearer the far end. Two stories cover it.

### The card is the direction — slice 2, first half. 2026-09-22

The owner opened both cards of his first route and saw **Tala – SM Fairview**
on each, the direction a row below. "The title must switch too, add switch
icon here." That is slice 2's card, asked for by the person it is for.

- **The card's title is the direction** — `SM Fairview → Tala` — in the
  studio and on the visitor map, since `RouteCard` is shared. The route name
  moves to the line below, with the signboard when known; it stays in the
  card because the chooser, the share title and the hotspot chips call the
  route by it, and `phone-test` asserts the peek carries it.
- **A switch beside the title** shows the other direction: `otherDirection()`
  in `routes.ts` finds the sibling by `route_id`, and each app passes it with
  its own `select`. When the sibling has no line the switch is disabled and
  the card says *"SM Fairview → Tala is not mapped yet"* — the slice 2
  requirement that a commuter can tell "no jeep goes that way" from "nobody
  has drawn it yet".
- The Direction row is gone from the card body; it was the title.

**Not done, the other half of slice 2:** one line at a time. Both directions
still draw at once, two offset blue lines down Quirino Highway, and a tap on
the shared stretch opens the chooser with both. Flipping should swap the line,
not add one. Next.

### The timeline — a direction as a string of places. 2026-09-22

The owner asked for the hintuans under the head and tail — "it can only be
saved once it is near that road" — and then drew it: the card collapsed to
**Tala → SM Fairview**, opened to a line of stops the way a train app shows a
line. Built with his go, on his two answers: that picture, and **"the line
enters the box"** as the rule — not "within N metres", so no number decides
what a hintuan is on; the box the owner drew is the statement, and one that
never reaches the road visibly does not count.

Most of it already existed. `syncHintuanLinks` has linked a saved direction to
every hintuan its line enters since M6, with the entry index as
`stop_sequence`. What was missing was showing it from the route's side.

| Part | What was done |
|---|---|
| `stops.ts` | `hintuansAlong(line, stops)` — the one rule, now shared by the save and the panel, so what is shown first is what is stored. `Timeline` (`from`, `between`, `to`) and `timelineFor(head, tail, reversed, along)`: the ends by direction, the hintuans in travel order, and boxes that are an end's own place folded into that end (H3) rather than repeated |
| `routes.ts` | `routeTimeline(variant, stops, along)`: the ends resolved from the route |
| `useSavedStops` | `stopsAlong(variantId)` from the links, ordered — the same hook serves the studio (live) and the visitor map (the file, which already carries `links`) |
| `StopTimeline` | New, shared. Filled dots for the ends, hollow for hintuans, one line down the left; rows are buttons when there is a map to show the box on |
| `RouteCard` | A collapsed `<details>` under the title — *Passes through 4 hintuans* — opening to the timeline. Tapping a stop closes the card, selects that box and flies the map to it, in both apps. Collapsed by default because the title already says the ends |
| `SavePanel` | The same timeline, read-only, under Head and Tail before Save — computed on the snapped geometry, not the control points, since a box can sit between two clicks. Says how to get one when the line passes none |
| `stopsWrite.ts` | `syncHintuanLinks` uses `hintuansAlong` — one rule, one place |
| Stories | Card with a four-stop timeline and with none; panel with two boxes across the sample line and one beside it that must not appear |
| Checks | Type check, build and guards; the stories read back headlessly (collapsed by default, count, order, the off-road box excluded, preview rows not buttons); visitor-test 36/36 |

This is Phase 3 step 4's visible half — *the visitor card shows the string of
places* — done with the entry index for order. M8's metres replace the index
and change nothing on screen. The signboard, deferred, is now plainly this
list read aloud.
**Reviewed and corrected the same day.** A two-axis review of the diff
(standards; spec against the owner's own words) found two real gaps, and the
owner's first look found a third: the card listed three hintuans on a road
he had drawn boxes for at Fatima, Pangarap and Amparo. Measured against the
live boxes, those sat **0 to 1 m from the line** — drawn on the roadside,
where people stand, while the line follows the road — so "the line enters
the box" missed them by a metre. The wrong-side box was always 7 m or more
away. Decided with the owner:

- **Passes = enters the box, or comes within 5 m of it.** `PASS_WITHIN_M`
  and `passIndex()` in `stops.ts`; `firstNearIndex()` in `geo.ts`. Both
  sides of the save (`hintuansAlong` for the route, `linksThrough` for the
  hotspot) and both previews ask it, so the hotspot-side copy the review
  flagged is gone. Glossary "Passes" rewritten.
- **A row names the box when the place has several** — "SM Fairview – Main
  Babaan" — and the ends' own place is no longer folded out of the middle:
  the owner wants to see which SM Fairview box the jeep passes on its way
  to the terminal. `timelineLabel()`, `placeSizes()`; `placeKey()` is now
  exported from `stops.ts` and the panel's private copy removed. A box with
  no informal name (most of them: the save stores none when it equals the
  name) reads as its name alone.
- **Terminal links no longer leak into the middle**: the read path filters
  to hintuans, as the save path always did.
- **A return drawn from the wrong end** now lists its middle in travel
  order: `timelineFor` takes the line's first point and turns the middle
  round when it starts nearer the far end.
- Small: `passesThrough(n)` shared wording; `useSavedStops.show(id)` replaces
  the handler both apps had copied; the card shows the block whenever there
  is anything to list; `hintuanCount` named honestly.
- Story `PassesBesideTheRoad`: a box 2 m off the line is listed, the other
  carriageway 12 m off is not. Drive script 13/13, type check and build green.

**The stored links are still the old ones.** Links are written at save time,
so the two saved directions keep their three hintuans until each is saved
again (Edit route → Done → Save) — then the nightly publish carries them.
Under the new rule the live data gives SM Fairview → Tala: Fairview
Teraccess, SM Fairview, Fatima, Lagro, Malaria, Pangarap, Amparo, Barracks;
and the return the matching boxes on its own side.

### The tap, the lighting and the sheet — slice 2, second half. 2026-09-22

Decided with the owner in a grilling session (eleven questions in three
rounds, then a page he confirmed line by line), and built on his "go":

- **Rest.** Every drawn direction shows in a light blue (`line-opacity`
  0.45). Both directions of a route draw, so where they split by one-way
  streets the split shows; where they share a road they overlap and read as
  one. "One line at a time" now means: once a *direction* is picked, only
  that one draws bright.
- **A tap.** Everything under the finger is offered — nothing wins outright
  any more (the old "a line under the exact pixel beats the box" rule is
  gone). `tapTargets` returns directions, their routes and hotspots;
  `resolveTap` says what the tap means, the same for both hooks and both
  apps: nothing; one route alone → its card, opening **the direction whose
  line is under the finger** — where the two directions run on different
  roads, tapping the other one must open it, the owner's first check — and
  only where both overlap the **drawn outbound** (`directionToOpen`), else
  the return; one hotspot alone → its card; several → they **light up** and
  the sheet opens.
- **Three levels.** Rest 0.45; while something is lit the rest fade to 0.15;
  the lit set draws again on top, full and thick (`saved-routes-selected`
  now filters with `in`, a list, not one id). Boxes under a tap light too
  (`saved-stops-lit`, fill 0.5).
- **The sheet.** Hotspots first, then **one row per route, never per
  direction** — the candidates carry every direction of each route, slots
  included, so a row can say "Return not mapped yet" or "Both ways mapped".
  Picking a row opens the route's drawn outbound; ⇄ is one tap away.
- **⇄ swaps the line**; closing the card, or tapping empty map, rests
  everything. A flip never sticks. A shared link opens its direction lit.
- **The card's small line** reads the route the way the direction rides it
  — "SM Fairview – Tala" under "SM Fairview → Tala" — the owner's note
  during the build. Built from the timeline's ends with `routeName()`, so
  nothing is parsed.
- The studio taps exactly the same way; while drawing, the other direction
  rests light under the draft.

| Checks | Result |
|---|---|
| `visitor-test` | **131/131** (was 101 pass / 5 fail — the "no click point avoided the route line" and chooser-instead-of-card failures were exactly what this step changes). New: the sheet on a line inside a box, hotspot first; the rest fade while it asks; one route alone opens straight to its card; rest → lit → rest |
| `phone-test` | **38/38**, expectations updated for the light rest, the outbound-opens rule and the flipped small line |
| Studio drive (live data) | 16/16, including a tap on the other direction where the roads split: rest 0.45; tap → card "Tala → SM Fairview / Tala – SM Fairview", rest 0.15; ⇄ → "SM Fairview → Tala / SM Fairview – Tala", one id lit; close → 0.45; a line inside Barracks → sheet "Barracks · Hintuan | Tala – SM Fairview · Both ways mapped" |
| Chooser stories | Fixtures now carry both directions and one slot; `HotspotAndRoute` added |

Parked with the owner: the **place highlight** (siblings brighter, a wash,
or both; studio or public map) — his call when he is ready. Next, by his
order: the "Part of SM Fairview · terminal + 2 hintuans" line on the hotspot
card with tappable siblings; then the design foundation (tokens, a screen
inventory) before he designs in Figma.

### "Part of SM Fairview" — the hotspot card names its place. 2026-09-23

The owner's two Lagro boxes, one per side of the highway, were "in separate
boxes and don't share the same identity — can I combine them but keep them
separate?" They already were one place by name; what was missing was seeing
it. Built on his go:

- `siblingsOf(stop, all)` and `placeSummary(boxes)` in `stops.ts`: the other
  boxes of the same place, terminal first, then by name; and "terminal + 2
  hintuans" as what the place is made of.
- `HotspotCard` gets `stops` and `onPickSibling`: a line **"Part of SM
  Fairview · terminal + 6 hintuans"** with one chip per sibling (its ground
  name, tinted by kind). Tapping a chip selects that box and flies the map to
  it (`useSavedStops.show`, the same one the timeline rows use). A place with
  one box shows nothing. Both apps pass the same two props.
- Story `PartOfAPlace`; drive 10/10 in Storybook and on live data (the SM
  Fairview terminal → six siblings → tap "SM Fairview" → its card, map moved).

Two boxes both named "Fairview Teraccess" give two chips with the same
words — they are two boxes, on two sides — which the highlight, when the
owner decides its look, will tell apart on the map.

### The place highlight — one place, seen. 2026-09-23

Parked since the grilling's first round; the owner's "3. game" was taken as
"go with the recommendation": **both** — siblings drawn stronger *and* a
soft wash joining them — on the **studio and the public map** alike, since
it is one hook. To be confirmed at his check.

- Tap a box: its siblings (`siblingsOf`, the boxes sharing its informal
  name) draw at fill 0.4 in their kind's colour on `saved-stops-siblings`;
  a wash — the convex hull of every corner of the place's boxes
  (`convexHull` in `geo.ts`) — sits under all of them at 0.1 sky with a
  dashed edge, on its own source `place-wash`. Never a thing to tap.
- Close the card and both go. Nothing at rest; nothing while the sheet is
  only asking.
- Drive on live data, 17/17 on both surfaces: the SM Fairview terminal
  lights six siblings under one wash; a Lagro box lights the other Lagro
  across the highway, the wash spanning both carriageways.

### Which way the jeep goes — arrows flowing along the lit line. 2026-09-23

Phase 3 step 6's other half, decided with the owner in three messages:
arrows **only on the chosen direction**, pointing the way it is ridden
("Tala to SM means the arrow shows Tala to SM, and otherwise"), **flowing
smoothly** along it, and no glow — asked for first, then asked away once
seen.

- `travelLine(v, stops)` in `routes.ts`: the direction's line in travel
  order. The stored points run whichever way the owner drew them; the ends
  decide, so a return drawn from the far end still points the right way.
- `useDirectionArrows(map, line)` in `directionArrows.ts`, called by both
  apps after both hooks. MapLibre cannot slide a symbol along a line, so the
  arrows are points placed by us: the line is measured once (metres at each
  vertex, bearing of each segment), and every frame each arrow sits a little
  further along — 28 px a second, one every 56 px, spacing and speed held in
  screen pixels by reading the zoom each frame — turned to its bearing there.
  Only the on-screen part of the line is walked. The arrow is a white
  triangle we draw and hand to the map as an image (a font glyph would be at
  the mercy of whatever the tile server ships); a basemap switch carries the
  layer but not the image, so `styledata` re-adds it. A browser asking for
  reduced motion gets the arrows standing still.
- Drive on live data 9/9: nothing at rest; choose a direction → arrows on
  it, and the same arrow is elsewhere 400 ms later; ⇄ → they run the other
  way; close → gone; no glow layer. visitor-test 131/131.

Still to judge on a phone: battery over a few minutes with the arrows
running. Size, spacing and speed are a first guess, to be tuned in the
owner's map-marks tool rather than here.

### The line fills the road. 2026-09-23

The owner, looking at a 3 px line beside a 20 px highway at zoom 18: "how
about we fill up the road with line?" Two things, built on that:

- **Width follows the basemap's own curve for a major road** — 2 px at zoom
  10, 20 px at zoom 20, growing 1.3× a zoom, read off the Positron style's
  `highway_major_inner` — so at every zoom the blue is 0.42 of the road's width — his "try 5 px" at zoom 18, settled by eye from 10/10 through 8/10 and 6/10
  it runs on. The casing sits 1 px either side, the lit direction 1 px
  proud, the hit area well beyond (`roadWidth(extra)` in
  `useSavedRoutes.ts`). A road painted blue also hides the small
  disagreements between the router's roads and the tiles' at high zoom,
  which is what he had noticed as "broken snapping".
- **Our lines and boxes now sit under the basemap's labels**, so a road
  painted blue still shows its name and shield: inserted before the style's
  first symbol layer, and `styleTransform` keeps that order across a
  basemap switch (our marks under the new style's labels, our own labels and
  arrows on top). The draft's layers stay above everything while drawing.

Seen at zooms 12, 15 and 18, at rest and lit: a light ribbon on the whole
route from far out; at 18 each direction paints its own carriageway of
Quirino Highway with the "127" shields and the name on top; lit, the chosen
carriageway is bright with the arrows flowing inside it.

### The owner's first colours, the chevron train, and the orange stretch. 2026-09-23, late

His first designs arrived as two pictures and a spec (a train of four
chevrons inside the line; a Figma frame of blue–colour–blue where a route
passes a hintuan) with hex colours, tuned live over the evening. Built, on
his "lesoog everything":

- **The line is his blue** — tried `#143AB9`, `#1448F3`, then `#406AF5`,
  where it sits — and **6 px again at zoom 18** (half the road's width,
  `ROAD_SHARE` 0.5), the **lit direction 9 px** (`LIT_EXTRA` 3, after 8), the casing
  1 px either side of each. Colours and the width curve now live in
  `lineStyle.ts`, one place, read by the line, the stretches and the chevrons.
- **The arrows, tried as a train and put back.** His spec — four white
  chevrons, tail to head 25 → 45 → 70 → 100 %, the head 15 % larger, one
  width apart — was built, then redrawn as filled darts from his second
  picture, then dropped by him: "not good visually, go back to the older
  design". What stays from the try: the arrow is sized with the line
  (1.5× the lit width, never under 10 px, after "too small" at 0.9×),
  scaled by a per-feature `size`; and the metres-per-pixel figure, which
  assumed 256 px tiles where MapLibre's are 512, so yesterday's arrows sat
  twice as far apart as written — fixed, and the spacing written as the
  112 px he had actually approved.
- **The orange stretch** (`passStretches.ts`, `#FF9831` after `#E8632A`):
  where a direction passes a hintuan, the line turns orange for that
  stretch, on the same "passes" rule as the timeline — inside the box or
  within 5 m — so a box is orange on a direction exactly when its row is
  listed. `passStretches()` in `stops.ts` walks the line a metre at a time
  near each box and returns the near stretches as short lines. Hintuans
  only; the ends are the ends. Two layers, a rest copy under the lit line
  and a lit copy over it, following the line's three levels and the hidden
  direction while editing; both fade in between zoom 14 and 15.5, since a
  box is a couple of pixels further out and the line would only look
  speckled.

Rest width per zoom, for the record: 1 px at 10, 2.3 at 14, 2.9 at 15,
3.7 at 16, 4.7 at 17, 6 at 18, 7.8 at 19, 10 at 20; the lit direction 3 px
more. Suites: visitor 133/133 (two new checks: arrows sized with the lit line,
the lit direction's stretches lit with it), phone 38/38, run one at a time.

### Jeepneys in place of the arrows: tried, and parked for a Simulate button. 2026-09-23, night

His ask: in place of the arrow, a small jeepney like the cars in Grab,
Angkas, Move It, JoyRide or Uber, "recognizable as a Philippine jeepney".
Built in full and committed as `17db5e3`, then taken off the map by him the
same night.

- **The jeep**, seen from above (`jeepSprites.ts`). From above the
  paintings and curtains are out of sight, so it leans on what still shows:
  a long hood narrower than its front fenders, the chrome bumper, the horse
  on the hood, mirrors at the windshield, the route board across the front
  of the roof, the painted roof, the open back with its step. Four paint
  jobs: `toy` and `painted` after the two jeepneys he sent (a model with a
  yellow roof edged red and white, a red route board and a blue hood; a
  painted one with a canvas roof, painted bands and a bumper in colour
  blocks), `classic`, and `route` in the line's blue; `toy` the default.
- **How many, how fast** (`directionJeep.ts`): one for every 2 km of the
  ride, evenly spaced ("if 10 km there should be 5"), each one that
  reaches the end starting again from the beginning; 42 px a second on
  screen at every zoom, his "6/10" of the first try, which drove about 70 px
  a second at the whole-route view on a phone.
- **Tap one and the screen follows it** (his ask): the camera comes down to
  zoom 16 and keeps the jeep a little above the middle, clear of the card,
  until the end of the ride, a second tap, or a hand on the map. The hand
  must let go on the press itself, not on the map moving: every camera step
  resets MapLibre's gesture handlers, so a drag would never start. A tap on
  a jeep is its own kind of tap (`resolveTap`), so the card stays open.
  visitor-test 137/137 with it.
- **Why parked**, in his words: "the user might think that we're tracking
  jeepneys, or the jeepney is upcoming". Jeeps moving on their own read as
  live positions, and this map has none.

**Later: a Simulate button.** His idea for keeping it: a button (on the
route card, most likely) that, when tapped, sends a jeepney along the chosen
direction to show the route. Bring the work back from `17db5e3`
(`jeepSprites.ts`, `directionJeep.ts`, the jeep tap in `tap.ts`). To settle
with him when it is built: which paint job; one jeep once from start to end,
or the queue; whether the camera follows it by default; and wording that
makes plain it is a simulation, never a jeep on its way.

**Next: one chevron, bigger, clipped by the line.** His call the same
night: back to the arrows, but as a chevron — no trail (the four-chevron
train stays dropped), one chevron to a place, bigger than today's arrow, and
cut off at the edges of the line so none of it shows outside. MapLibre
cannot clip a symbol to a line's width, so the chevron is drawn already cut:
its arms run off the top and bottom of the image, the image is exactly as
tall as the lit line is wide, and it is turned to the line's bearing as the
arrow is. On a straight run that looks the same as a bigger chevron clipped
by the line. The catch: clipped to the line, it can be no taller than the
lit line — 9 px at zoom 18 but about 5 px at zoom 13 to 14, where today's
arrow is kept at 10 px or more — to judge on the map. Also to fix then: with
reduced motion on, the arrows are drawn once and never again on zoom, so
their size and spacing go stale; the parked jeeps redrew on every zoom.

### The chevron, cut by the line. 2026-09-23, night

Built on his "yeah yess" and kept ("the current one is good"):

- **One white chevron to a place, no trail**, flowing as the arrows did
  (28 px a second), drawn as wide as the lit line and no wider: its arms
  run out to the line's edges and are cut there, flush, so they meet the
  line's white border. A 1 px inset a side was looked at and not taken.
- **Its stroke is 0.7 of the line's width**, arms at 40° to the line — the
  middle of three looked at up close (0.4; 0.7; 1.0 at 35°). The thicker
  stroke is how it is "bigger": the width is the line's, so a bigger
  chevron shows as a longer, bolder cut.
- **How many** (his "12/10" and "8/10", which count chevrons, not gaps):
  12/10 as many below zoom 14, where the whole ride is on screen; 8/10 as
  many from zoom 16, street level; as before in between. In steps, not
  smoothly: where each chevron sits depends on the spacing, so a spacing
  that followed every bit of zoom would send them racing along the line
  under a pinch; a step moves them once.
- **Drawn, not pictured** (`directionArrows.ts`): each chevron is a small
  polygon laid out in screen pixels and placed every frame, on a fill layer
  over the lit line and its orange stretches, under the hit area and the
  basemap's labels. A picture scaled between the line's 5 px zoomed out and
  13 px at zoom 20 would blur or shimmer.
- With reduced motion they are drawn once and again whenever the map moves,
  which fixes the arrows' stale size on zoom noted above.
- The catch, seen and accepted: zoomed out the line is about 5 px wide, and
  the chevrons are small notches in it.

visitor-test 133/133 (the arrows' check is now "chevrons ride the lit line,
each as wide as it", measured on screen against `lineStyle.ts`), phone-test
38/38 (2 SKIP, as before).

### Step 0 answers. 2026-09-25

The owner's answers to four of the five open questions:

- **`via` (R4): parked.** He finds most riders do not know the word and
  wants it gone. The job stays (two routes with the same ends by different
  roads still need telling apart); the word and its form wait on his own
  research. Options put to him: `Tala – Novaliches (Zabarte)`, `· Zabarte`,
  `dadaan sa Zabarte`.
- **Spellings: I propose, he corrects.** A proposed list goes to him; each
  accepted spelling is typed into the hotspot's informal name in the studio.
- **Side of road: the 2026-09-18 rule is accepted.** On a divided stretch the
  box keeps to one carriageway; on a single centreline both directions share
  it; applied per stretch (Quirino Highway is both).
- **`confidence`: two ways a route is proven.** First, we decide: the owner
  and his team mark a route checked. Second, visitors approve and rate it.
  The second needs visitor input, which the app does not take today (it is
  read-only and has no accounts), so it lands with "Accounts, later". Until
  then `drawn` / `verified` stands, and `verified` means the team's word.
- **Mode: jeepney only for now.** E-jeepneys are to be considered later. The
  enum's other values stay unused; nothing is dropped.

**A design shown, not to build yet.** The same day he showed an example of
the place list: full-width bands, one per place (TALA on maroon, CAPITOL on
light gray, BIGTE on black), the place in heavy caps and each route out of it
beneath with a turn-arrow icon (SM FAIRVIEW, NOVALICHES, PHILCOA). "Don't do
it, wait for me": it waits for his Figma file.

### Extend — built. 2026-09-25

The owner's scenario: Tala → Novaliches runs the first ~15 km of Tala → SM
Fairview, then goes its own way; its balikan may or may not share SM Fairview
→ Tala, and should connect to it on its own. That is "Extend at either end"
(the four actions, above). Asked what "connected" should mean, he took
**option A**: the borrowed part is *copied* and the borrow *remembered*, so a
later change to the parent can offer, one tap, to follow into the lines that
borrowed it. Option B, one stored piece of road shared by every route on it,
stays refused: harder, and a fix meant for one route would silently move
others.

How it works:

- **Extend** on a drawn direction's card (owner only). The line turns wide
  and blue; a tap within 40 px of it picks the nearest spot on it, and a tap
  again moves the spot.
- **Two buttons, in the jeep's order**: `Keep Tala → here` (the new route
  carries on from the spot) or `Keep here → Tala` (the new route joins at
  the spot). The labels read the direction's travel order even when its
  stored line runs the other way.
- The kept part becomes ordinary control points and segments — the segment
  the spot falls in is cut there, keeping its snap mode and the street runs
  that fit — and is editable like any drawing.
- **Keeping the end, the owner still draws forwards**: each click goes in
  just ahead of the join, never after the last point, so the line is joined
  the whole time and the router is asked in the jeep's direction (one-way
  streets). Undo takes back the click next to the join and stops there.
- **The save lands on its own.** A new route whose ends already make a route
  fills that route's empty slot instead of being refused (`claimExistingRoute`
  in `routesWrite.ts`); the panel says so beforehand, or says the direction
  is drawn already. The ends are guessed the right way round: a guessed pair
  that is an existing route backwards is swapped, so a balikan drawn from
  Novaliches reads `Tala – Novaliches`, not `Novaliches – Tala`.
- **The record (0008)**: `borrowed_from`, `borrowed_part` ('start' / 'end' of
  this line) and `borrowed_m`. The metres are measured at save time — the
  coordinates the two lines still share exactly, plus the cut point — so a
  borrowed point dragged away is counted as it is; a line that shares nothing
  any more saves no borrow. The panel shows "Shares 14.80 km with Tala → SM
  Fairview".

So the owner's case: open Tala → SM Fairview, Extend, tap the fork, `Keep
Tala → here`, draw to Novaliches, save as Tala – Novaliches. Then open SM
Fairview → Tala, Extend, tap where the balikan meets it, `Keep here → Tala`,
draw from Novaliches to the join, save: it fills Tala – Novaliches' balikan.
A balikan that shares nothing is drawn with "Draw the return trip" as before.

Checked: type check and build; `borrow.ts` against a synthetic street (spot,
cut both ways, streets trimmed, shared metres, a cut on a control point);
`extend-test.mjs` 10/10 (join mode, from a restored draft, since the button is
behind sign-in); regression-gestures 29/29 and hotspot-test clean. **Not yet
seen by the owner**, and not run end to end with a save, which needs his
account.

**Right-click a saved line to follow it — built the same afternoon.** The
owner, drawing Novaliches → Tala with "Draw the return trip", reached the
blue SM Fairview → Tala line on Belfast Avenue and asked to right-click it
and connect. So, while drawing a route: a right-click on a saved line (not
on one of the drawing's own points, which still deletes it) adds a routed
gap from the last point to that spot and copies the rest of that line, to
its end. Undo straight after takes the whole join back.

- **Which line**, when the click lands on several (the two directions of a
  route often share a road): the one running the way the drawing goes, read
  from its last point towards the spot, or its own last stretch when it
  already ends there. A line that ends where the drawing is headed — the far
  end of the direction being edited, or of the slot a return trip fills —
  wins unless it plainly runs the other way (under 135°), which is what
  settles a drawing arriving square from a side street. Nothing within 90°
  says "SM Fairview → Tala runs the other way here" and changes nothing.
  `lineToFollow` in `borrow.ts`.
- A line stored from its far end is copied turned round (`reverseDrawing`),
  and the save panel measures the shared metres either way round.
- One borrow per drawing, for now: a drawing that already borrows (Extend,
  or a join) says so rather than joining a second line.
- Checked on the owner's own case, in a headless browser with a stand-in
  session and every write blocked: the return-trip draft for Tala –
  Novaliches with one point at Novaliches, a right-click on SM Fairview →
  Tala near Lagro: 5 points, 13.35 km, ends at Tala; the panel reads "Draw
  the return trip · Novaliches → Tala · Shares 8.06 km with SM Fairview →
  Tala"; Undo leaves the one point. `extend-test.mjs` 16/16 (the delete
  guard, the "draw first" message, the join point for point, Undo),
  regression-gestures 29/29, build.
- Found on the way: `fitBounds([p, q])` reads a pair as south-west,
  north-east; two points the other way round frame the whole planet. The
  test frames by min/max now.

**Next, in this order:**
1. **Follow the parent** — the rest of option A: when a direction that others
   borrowed from is saved changed, the studio lists them — "Tala – Novaliches
   borrowed this. Update it too?" — and one tap replaces each one's borrowed
   part with the parent's new one, at the same end.
2. **The rest of the magnet** (step 2's idea 9): a balikan that shares a
   stretch in the *middle* of another line — joining it, riding part of it,
   and leaving it again — rather than following it to its end.

### The sheet shows one way round, grouped by where each leaves. 2026-09-25

The owner, tapping where Tala – SM Fairview and Tala – Novaliches share a
road: the sheet listed the two routes ("Both ways mapped") and lit all four
directions, with no arrows. His ask, and "Yess" to the proposal:

- **One way round at a time**, outbound first, grouped by the place each
  leaves from — his layout:
  ```
  Tala                     (⇄)   SM Fairview        Novaliches
   → SM Fairview                   → Tala             → Tala
   → Novaliches
  ```
  ⇄ in the sheet's top line flips every route under the tap together. The
  sheet opens the way round that is under the finger: outbound where an
  outbound line was hit, the way back where only ways back were. (Until the
  owner's report the same evening — "I can't tap, it's not switching" — it
  opened outbound whenever any route there had one drawn, so a click on the
  light-blue way back, where SM Fairview → Tala and Novaliches → Tala share
  Belfast Avenue, reopened the papunta.) A
  direction still a slot is listed, greyed, "Not mapped yet", and opens
  nothing. `departures()` in `routes.ts`; the labels are the generated
  direction names, so the list reads what the card's title will.
- **The map lights exactly what the list shows**, each with the flowing
  chevrons and **a circle at both ends** (white, a 2 px ring in the line's
  blue, half the lit line plus 2 px — plain until his Figma). **The same
  routes the other way round stay at rest**, light blue, so the way back
  reads as there without competing; only a route the list does not show
  fades. The owner's pick (B) of three offered the same day: keep it faded,
  rest it, or hide it until ⇄. The orange hintuan stretches follow the same
  levels (`unlitOpacity` in `useSavedRoutes.ts`). A card opened on its own
  does the same since the owner's "2B" that evening: its route's other way
  rests, everything else fades. And "1A": a fresh tap where only ways back
  run opens the list on the way back — kept "for now".
- **Where two lit lines share a road they flow as one stream**: a later
  line leaves its chevrons out wherever an earlier one runs within 8 m the
  same way (bearings within 45°), worked out once per change of what is lit.
  Tala → SM Fairview and Tala → Novaliches share Quirino and part at SM
  Fairview; one train of chevrons to the fork, two after it.
- **A row opens that direction's card**, the way round it was listed. A
  chosen direction gets its two circles too, so one lit line always looks the
  same.
- **Each end is named** (his next ask, the same afternoon): the place's name
  beside its circle, in the list's own words (`directionEnds`), 13 px bold
  near-black with a white halo, on whichever side is free. A place two rides
  share — Tala — is named once (same name within 150 m). The names sit on
  top of every other label, so a street or hotspot label near an end gives
  way while the route is lit: "Tala Jeepney Terminal" steps aside for
  "Tala" and comes back when the route closes. `group-test` checks the
  names both ways round (19/19).
- Both surfaces: the public map and the studio share the sheet, the hooks
  and the arrows.

Checked: `group-test.mjs` 17/17 on the studio's live tables (the owner's two
routes: outbound "Tala → Novaliches, SM Fairview", 2 lit, 4 circles, 0
doubled chevrons; ⇄ gives "Novaliches → Tala | SM Fairview → Tala", the lit
lines change over; a row opens "Novaliches → Tala" alone with its 2 circles);
visitor-test 133/133 and phone-test 38/38 (2 SKIP as before — the published
file still holds one route, so the phone's two-route check waits for the
next publish; it now expects the grouped rows); extend-test 16/16,
regression-gestures 29/29, build. Seen at 1280×800 and 390×844.

The way back at rest, and a click on it switching: `group-test` 23/23,
reading what each line is drawn at, line by line (the other way rests, both
ways round; "a route the list does not show fades" SKIPs while every saved
route passes that tap), checking the sheet opens the way round under the
tap, and clicking the light-blue way back with the list on the outbound;
visitor-test 133/133 (its "the rest fades" check reads the level a `case`
falls back to), phone-test 38/38, extend-test 16/16, build.

### Seeing the orange zoomed out, and a click that keeps what is lit. 2026-09-25, evening

The owner, looking at Novaliches → Tala at about zoom 16 (measured off the
screenshot: Bestlink to Bistek Village, and Nova Mall to Bayan Simbahan) and
at the SM Fairview terminal at about 16.7:

- **Hotspot names only close in** ("lessen the range that shows the
  hintuan title"). A name is centred on the road it stands on, so further
  out it sat over the very orange stretch it marks — Bistek Village's hid
  its stretch completely. First the hintuans' from zoom 16.5, between the
  two views (gone at 16, kept at 16.7); then, the same evening, "the same
  with terminal", and the names lasting "12" where 16.5 was "10": 12/10 as
  far out, gone once the map shows 1.2 times the ground it did at 16.5 —
  zoom 16.24 (`16.5 − log2 1.2`, `NAMES_FROM` in `useSavedStops.ts`).
  Checked there: none at 16 or 16.2, all six around SM Fairview from 16.3.
  Two layers, one a kind (`saved-stops-label`, `saved-stops-label-hintuan`),
  so either can be set apart again; the terminals' sits above, so where a
  terminal's name and a hintuan's collide the terminal keeps its name. A
  layer's `minzoom` can be fractional, where a zoom test in a filter only
  ever sees whole zooms.
- **The lit line 12/10 as wide zoomed out** ("right now it's 10/10, make
  12/10"), its casing, orange stretches, end circles and chevrons with it:
  12/10 at zoom 16 and out, easing back to the settled 9 px by 18, so about
  11/10 at 16.7 and never thinner as the map zooms in. `litWidth` /
  `litWidthAt` in `lineStyle.ts`; the resting and faded lines are as they
  were.
- **A click on a lit line keeps it lit.** With the list on the way back, a
  click on the lit Novaliches → Tala where Tala → Novaliches runs on the
  same road opened Tala → Novaliches: where both directions of one route
  were under the click, the outbound rule decided. Now the one already lit
  wins, and the outbound rule decides only when neither is lit. In the list
  the same: where a lit line is among those clicked, the list keeps its way
  round.

Checked: `group-test` 25/25 (a click on the lit way back where both ways
run opened "Novaliches → Tala"; a click on a lit stretch shared with the
other route and an outbound kept the list on the way back), visitor-test
133/133 (the chevrons now measured against `litWidthAt`: 8.47 px at 17,
was 7.71; both label layers above the routes' hit layer), phone-test
38/38, extend-test 16/16, build. Seen at zoom 16 and 16.7 over Bestlink.
With the terminals' names and the 12/10: visitor-test 134/134 (no hotspot
name at 16, some at 17), group-test 25/25, phone-test 38/38,
hotspot-test 22/22, build.

### Still open in step 0

Still to settle before drawing resumes: how a *direction* is named (`to SM
Fairview` today, and whether "kanan"/"kaliwa" is a direction name); the
form `via` takes, after the owner's research; the spellings, once he has
corrected the proposed list.

Deferred past step 0 on the owner's call: the signboard, and the "where to?"
list that would have been built on it.

---

## Phase 2 — the linear reference, and two front doors

Planned 2026-09-14 against the code as it stands. M0–M4 and M6 are built; M5 is
still open.

### The finding

Route matching, sub-routes, looping, stops-in-order and annotating all want one
thing the schema does not have: a stable way to say *this is here along this
route*.

Today that is `route_stop.stop_sequence`, a vertex index. Risk #2 calls its
drift "harmless until stops in order". That understates it — the index is what
blocks the other four.

| Wanted | Needs | Why a vertex index fails |
|---|---|---|
| Stops in order | a sort key | re-snapping renumbers every vertex |
| Sub-routes | a span on a parent | cannot express "the first 6 km of this" |
| Looping | several positions per stop | a loop meets one hintuan at 2.1 km *and* at 14.8 km |
| Annotating | a point or a stretch | "one-way, 3.2–4.0 km" |
| Corridor overlap | spans on two different routes | indices are not comparable between routes |
| Fare stages | distance | jeepney fare *is* distance |

Replace it with metres along the line. GTFS calls this `shape_dist_traveled`,
which keeps the naming rule.

**The anchoring rule** — the one already chosen for hintuans, where the polygon
is the truth: *every linear feature anchors to a real coordinate and caches its
projection onto the line.* Geometry is authoritative, metres is an index,
recomputed on every save. When a projection lands more than 50 m from its
anchor, flag it; never move it silently. That is the difference between a cache
and a lie.

---

**M7 — Snap quality. Before route #2 is drawn.** Four changes in `snap.ts`,
none large, all compounding: every route drawn after them is better, and no
route drawn before them is.

- `radiuses=25;25`. Today a click that cannot reach a road snaps silently to one
  two blocks away — `snapSegment` falls back only on an *error*, and a
  wrong-but-successful snap is not an error. With a radius it fails, and a
  failure is visible.
- U-turns at joins. Each gap is routed as an independent two-point request with
  no heading, so OSRM may open the next segment with a U-turn. Route a moved
  point *with its two neighbours* as one three-waypoint request: the join is
  coherent, the edit stays cheap.
- `steps=true` returns street names. "via Commonwealth → Quezon Ave → España"
  for free — and for a jeepney the street list beats the terminal pair.
- Serve simplified geometry to the public map. Tala is 654 points for 17 km;
  display zoom needs about 80. Store full fidelity, serve a simplified copy.

**M8 — Linear referencing. Migration 0006** (0005 is step 1's editor role). Nothing below it should be built
first; M9–M12 each write a position.

- `route_stop` gains `dist_m numeric` and loses its primary key.
  `(route_variant_id, stop_id)` permits one row per stop per variant, which
  makes a loop unstorable. Surrogate id, plus
  `unique (route_variant_id, stop_id, pass)`.
- `stop_sequence` stays one release, recomputed alongside, then drops. Few
  enough rows that this is politeness, not necessity.
- `geo.ts` gains `distanceAlong(line, i)`, `projectOnLine(point, line)` returning
  `{ dist_m, offset_m }`, and `allTouches(line, ring)` replacing the
  first-touch-only pair.

**M9 — Looping.**

- Detect: first point within 50 m of last, so `route_variant.is_loop`.
- A loop is one variant, not two. "Draw the return trip" is wrong for it and
  must not appear.
- `allTouches` gives a stop one row per pass. A commuter at a hintuan on a loop
  needs "yes, it goes there — forty minutes the long way round", which is the
  whole reason the pass number exists.
- Out-and-back on one street is the same problem with self-overlapping
  geometry: metres separate the passes where lng/lat cannot.

**M10 — Sub-routes.** `route_variant` gains `parent_variant_id`, `span_from_m`,
`span_to_m`.

A short turn ("hanggang Malaria lang") stores no geometry of its own — it is a
window onto its parent's line, so fixing the parent fixes every short turn under
it. A sub-route that genuinely diverges carries its own geometry and a null
span. One table, both cases, told apart by whether `span_from_m` is null.
`unique (route_id, direction_name)` still holds: "to Malaria (short)" is its own
name.

**M11 — Annotating.** `route_annotation`: variant, kind, anchor point, cached
`dist_m` (plus `dist_to_m` for a stretch), text.

Kinds worth having on day one, because they are exactly what a commuter cannot
read off a map: one-way stretch · where the jeep stages and waits · fare stage ·
time-of-day limit ("walang jeep after 9pm") · provenance ("driver's word, not
ridden"). The last is `confidence` at segment resolution, and it is the honest
version of the claim at the top of this file.

**M12 — Matching.** Three things share the name. All three are authoring
quality; none is journey planning.

- **Corridor overlap** — when a drawn line shares a stretch with a saved one,
  say so, as a span on both. Catches the duplicate about to be drawn; becomes
  transfer points later. Needs M8.
- **Reference datasets** — the DOTC `dotc` GTFS terminal pairs and the 831 OSM
  relations as a dim layer and a checklist: which of the 1,711 have been
  ground-truthed. Fill `route_code` from it. Never its geometry.
- **Snap quality** is M7, done first.

**M13 — Two front doors. Planned in detail 2026-09-14.**

Decided with the owner:

| | Decision | Why |
|---|---|---|
| Where | `/` is the commuter map, `/studio/` is the editor. One build, one deploy | A studio subdomain is cleaner but needs a domain and a second deploy. Revisit when there is a domain |
| How | Vite multi-page: `index.html` and `studio/index.html`, two entry points | Each page gets its own `<head>` — install manifest only on `/`, `noindex` only on `/studio/`. No client-side router, so no SPA fallback and still no `wrangler.jsonc` |
| Finding a route on a phone | Map only — "the map is the list" stays | Owner's call. It puts all the weight on the tap; see M14 |
| Studio sign-in | At the door | Sign-in at Done existed because visitors could draw on the shared page. They no longer can |
| Offline | Last-seen routes and hotspots, plus map already viewed | M15 |
| APK | Not now. The PWA is built to the bar an APK wrapper needs | M15 |

**What the split is for — measured, and not what the earlier note said.** The
production build is one chunk: 1,426 kB, 384 kB gzipped. MapLibre is about
282 kB of that gzipped figure. The editor-only source is 61 kB *before*
minification — a few percent of the download. So the split does not make the
public page meaningfully smaller; "the public bundle stops shipping the editor"
was true and beside the point. What it does buy:

1. **What gets installed.** Only the commuter shell is precached and
   installable. `/studio/` is never cached and never offline.
2. **No auth in the public app.** No sign-in pill, no session, and reset links
   go to the studio — the only page that can finish them.
3. **The phone UI can change freely** without breaking the desktop drawing
   gestures the headless checks protect.
4. **The public app stops carrying an editor.** `dist` today contains the OSRM
   URL, `signInWithPassword`, the draft key and "Draw the return trip". Not a
   hole — RLS is the lock — but a map for commuters has no reason to ship them.

Real savings for commuters come from M15 — a second open loads from the phone,
not the network — and, measured first, from swapping `supabase-js` (~55 kB
gzipped) for `postgrest-js` on the read-only side.

**The boundary.** A rule nothing checks is a suggestion.

```
src/shared/     imports nothing from commuter/ or studio/
src/commuter/   imports shared/ only
src/studio/     imports shared/ only
```

Checked twice: `scripts/check-boundaries.mjs` reads every import, and
`scripts/check-build.mjs` walks Vite's build manifest from `index.html` and
fails if any commuter chunk contains `router.project-osrm.org`, `parapo.draft`,
or words only the editor shows: "Sign in to save", "Forgot password?",
"+ New Route", "Draw the return trip". It also reads which source files went
into each public chunk (`.vite/modules.json`, written by a small plugin in
`vite.config.ts`) and fails on any from `src/studio/`, whatever it contains.
Both checks run inside `npm run build`, so a deploy that would leak fails.

*Changed when built:* `signInWithPassword` is not a marker. supabase-js defines
that method itself, so any page that talks to Supabase carries the word while
signing no one in; it appeared 3 times in the one-page build. And the studio's
chunks must contain every marker, or the search itself is broken and a pass
would mean nothing.

**Each entry point wires its own Supabase client.** `commuter/main.tsx` creates
one with `persistSession`, `autoRefreshToken` and `detectSessionInUrl` all off;
`studio/main.tsx` uses the defaults. Both hand it to `shared/supabase.ts` before
the first render. Shared read code never decides how auth works — the entry
point is the one place that wires the app together.

**Coupling found.** `useSavedStops.ts` imports `HOTSPOT_COLOUR` from
`useDrawing.ts` — the one place the read side reaches into the editor. It moves
to `shared/colours.ts` first.

**Files.**

- `shared/` — `MapView`, `diagnose`, `geo`, `supabase` (client holder and config
  error), `colours`, the read half of `routes` (types, `MODES`, `listVariants`,
  `variantLine`), the read half of `stops` (types, `listStops`,
  `listStopLinks`, `stopRing`), `useSavedRoutes`, `useSavedStops`, `RouteCard`,
  `HotspotCard`.
- `studio/` — `main`, `StudioApp` (today's `App.tsx`), `useDrawing`, `snap`,
  `DrawToolbar`, `SavePanel`, `HotspotPanel`, `SignIn`, `ResetPassword`,
  `ChangePassword`, `useSession`, `usePasswordRecovery`, `routesWrite`
  (`saveVariant`, `deleteVariant`), `stopsWrite` (`linksThrough`,
  `variantsStartingIn`, `saveStop`, `deleteStop`, `syncHintuanLinks`).
- `commuter/` — `main`, `CommuterApp`.
- Root — `index.html` (commuter), `studio/index.html` (`noindex`),
  `vite.config.ts` with both pages in `build.rolldownOptions.input` (Vite 8's
  name; `rollupOptions` is the old alias).

The cards lose `isOwner`, `onEdit` and `onDelete` for an `actions` slot: the
studio passes Edit and Delete, the commuter passes nothing. A shared component
should not know who is looking. The layer hooks' `drawing` and `hidden…Id`
options become optional and default to off.

**Auth moves with the studio.**

- `SignIn.tsx:51` sends reset links to `window.location.origin`. After the split
  that is the commuter page, which has no reset form — recovery would break
  silently. It becomes `${origin}/studio/`.
- **Owner action:** Supabase dashboard → Authentication → URL Configuration —
  add `http://localhost:5173/studio/` and
  `https://parapo.villaralvorovic2.workers.dev/studio/` to the redirect
  allow-list. Code cannot reach this setting.
- A reset email sent *before* the deploy still points at `/`. The commuter
  forwards any arriving `type=recovery`, `error_code` or `error_description`
  to `/studio/` untouched; with `detectSessionInUrl` off it never consumes the
  token itself. *Narrowed when built:* not on a bare `code=` or `error=`,
  which a share link could one day carry (the studio's implicit flow never
  sends `code`), and never on a `/studio` path.
- The studio with no session shows the sign-in panel instead of the map tools.
  The localStorage draft stays: a reload mid-drawing still keeps the work.
  *When built:* the door guards the first entry only. A session that ends
  later leaves the workshop on screen, and the next save asks for sign-in.

**Tests.** All four `scripts/pw` files open `/`, and three draw while signed out.

- `regression-gestures`, `hotspot-test` and `uitest.mjs` → `/studio/?e2e=1`.
  The flag skips the sign-in gate only inside `if (import.meta.env.DEV)`; Vite
  replaces that with `false` in a production build and drops the branch. Safe
  because the gate is convenience, not security: RLS still refuses every write,
  so the tests draw and never save — exactly what they do today.
- `gate-test` → signed-out `/studio/` shows sign-in, not the tools; and the
  production `dist` contains no trace of the `e2e` bypass.
- `visitor-test` → `/`, plus: no drawing buttons and no sign-in pill there.
- Risk #1 (tests tied to today's data) is fixed in the same pass — every test
  file is being opened anyway.

**Build order.** Each step ends in a check; a failed check stops the line.

1. Colours out of `useDrawing`; read and write halves; card `actions` slot;
   client holder. Still one page. *Check:* `tsc`, all headless checks
   unchanged.
2. Folders and the second entry. `studio/index.html` renders today's app
   unchanged. *Check:* existing tests pass against `/studio/`.
3. `CommuterApp` on `/`: shared layers and cards, no editor imports. *Check:*
   boundary script, build-output check, `visitor-test`.
4. Studio gate, reset redirect, forwarder, allow-list. *Check:* `gate-test`;
   one real reset email end to end on the live site, by the owner.
5. Tests retargeted, `realshot` on both URLs, deploy, this file.

**M14 — The commuter map on a phone.**

Map only, by decision. That makes the tap the whole interface:

- **A forgiving tap.** Query a box of about ±20 px around the finger against the
  route and hotspot hit layers, not the single pixel under it. Today's hit
  widths (18 and 22 px) were sized for a mouse.
- **Several hits open a chooser.** "3 routes here", listing signboard and
  direction. Without it, map-only fails at the first road two routes share —
  which in Metro Manila is most roads. The same chooser settles risk #9
  (overlapping hotspots).
- **The chosen route stands out** by dimming the others, not only by thickening
  itself.
- **Cards become a bottom sheet** on narrow screens; today they are
  `absolute left-4 top-4 w-80`. The peek shows signboard and direction; drag up
  for the rest.
- **Chrome.** Zoom buttons off on touch — pinch does it. Attribution stays; the
  OSM licence requires it. Safe-area insets (`viewport-fit=cover`,
  `env(safe-area-inset-*)`) for notched phones in standalone mode.
- **Share a route** as `/?r=<variant id>`: a query string, not a path, so still
  no SPA fallback.
- **No "where am I" dot in v1.** It needs the location permission, which stays
  out. It will be the first thing commuters ask for, and it would be on-device
  only — not tracking — so it deserves its own decision later, not a technical
  veto now.

*Check:* headless at 390×844 with touch emulation — a tap beside a line selects
it; a tap where two overlap opens the chooser; the sheet opens and closes; no
horizontal scroll.

**M15 — PWA, built so an APK is packaging, not rework.**

No APK for now, by decision. The PWA meets the bar a TWA (Bubblewrap,
PWABuilder) or Capacitor needs, so wrapping it later changes no app code.

Plugin: `vite-plugin-pwa` 1.3.0 — its peer range includes Vite 8 (checked
2026-09-14). If icons are generated with `@vite-pwa/assets-generator`, pin
`^1`: the plugin's peer range is `^1.0.0`, and 2.0.0 landed on 2026-09-12.

**The manifest belongs to `/` only.** Name, short name, `id` and `start_url`
`/`, `scope` `/`, `display: standalone`, theme and background colour, icons at
192, 512 and 512 maskable.

Two traps, both checked:

- **The plugin writes its manifest link into every HTML page it builds.**
  `injectServiceWorker` appends `<link rel="manifest">` before `</head>` without
  looking at which page it is (read in the 1.3.0 source). Left alone,
  `/studio/` becomes installable as ParaPo. Fix: `injectRegister: false`,
  register from `commuter/main.tsx` via `virtual:pwa-register`, and a ten-line
  post-order plugin that strips the link from `studio/index.html`. *Check:*
  `dist/studio/index.html` contains no `rel="manifest"`.
- **A manifest scope cannot exclude a subpath**, so `/studio/` sits inside the
  installed app's scope regardless. Contained by the stripped link,
  `navigateFallbackDenylist: [/^\/studio\//]`, and no studio chunk in the
  precache. A studio subdomain removes the trap entirely, later.

**What the service worker caches.**

| What | Strategy | Why |
|---|---|---|
| Commuter shell — `index.html`, its chunks, the MapLibre worker, icons | Precache | Opens with no signal; a second open costs no data |
| Studio chunks | Never | Desktop, online, owner only |
| ~~Supabase `GET` on `route_variant`, `stop`, `route_stop`~~ — *superseded by build-order step 5:* `/data/map.json` | NetworkFirst, short timeout, then cache | After step 5 visitors never call the database. The studio shares the origin, so its database reads must never come from a cache |
| OpenFreeMap style, TileJSON, sprites, glyphs | StaleWhileRevalidate | Small, rarely change |
| OpenFreeMap tiles | CacheFirst, capped (~3,000 tiles, 30 days) | Places already viewed work offline; the cap protects a cheap phone's storage |
| Non-GET, auth endpoints, OSRM | Never | A write or a sign-in must never be answered from a cache |

**Saying it is stale.** *Revised by build-order step 6:* the offline notice
reads `published_at` from `/data/map.json` — "Offline · map as of 14 Sep". Exact,
with no `lastSyncedAt` to keep and no unflagged timeout gap. Same honesty rule
as `confidence`.

**Updates.** `registerType: 'prompt'` — a new version waits and a small
"New version · Reload" appears. Not `autoUpdate`: a silent reload mid-ride
throws away the selected route. The service worker file needs no special
header: Workers static assets already send
`Cache-Control: public, max-age=0, must-revalidate` with an ETag, so the browser
re-checks it on every visit. Do not override that for `sw.js`.

`public/_headers`:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/studio/*
  X-Robots-Tag: noindex
```

Hashed filenames are what make `immutable` safe; `index.html` and `sw.js` keep
the default. `studio/index.html` carries a `noindex` meta tag as well.

**Dev.** The service worker stays off under `npm run dev` (the plugin's
default), so the headless checks never meet one. Test it with
`npm run build && npm run preview`.

*Check:* in `preview`, headless — the manifest loads and is valid; the service
worker registers on `/` and not on `/studio/`; `context.setOffline(true)` then a
reload of `/` still draws routes and hotspots with the offline notice. Then
once on a real Android phone: install, airplane mode, open.

**APK-ready checklist** — verified at the end of M15, not built:

- Installable from Chrome on Android; maskable icon; `display: standalone`.
- Opens offline to the map with last-seen data.
- No permission is requested anywhere, location included.
- Commuter code assumes nothing about its origin — Capacitor serves from
  `https://localhost` — and holds no auth.
- **Before an APK, not before M15:** a domain the owner controls. A TWA proves
  ownership with `/.well-known/assetlinks.json` on the origin, so an app tied to
  `workers.dev` stays tied to it until an app update moves it. Check then that
  Workers serves a dot-directory from `public/`. Play also needs a privacy
  policy.

---

### Decide before the next route is drawn

Free today. Unfixable at 200 routes.

- **The mode enum.** Open since M0 and already in the schema.
- **Naming conventions, once.** Signboard casing, `direction_name` format,
  terminal naming. Inconsistency is invisible at eight routes, and it is what
  makes the dataset un-mergeable with anything else later.
  *The route name is decided — 2026-09-21, see "Naming and creating a route".
  Hotspot naming too — same day, see "Hotspot names": two names per box, the
  informal one is what everything reads. Direction names and signboard casing
  are still open.*
- **Side of road for hintuans.** One on the northbound side of Commonwealth is
  not the southbound one. The polygon can already say so; whether it *does* is
  a convention, not code. *Mostly answered 2026-09-18 by counting OSM ways: on
  a divided road keep the box to one carriageway, on a single centreline both
  directions share it. Quirino Highway is mixed along its length, so the rule
  is applied per stretch, not per road. See the sketch session.*
- **Field method**, mapped onto `confidence`: ridden · driver's word · local
  knowledge. This is what makes the claim at the top of this file true.

Non-code: the LTFRB fare matrix, for consistent `fare_note` · before M15, an
icon, a theme colour and the app's short name · before any APK, a domain (asset
links bind the app to it, and it stops the thing looking like a test deploy)
and a privacy policy, which Play requires even from an app that collects
nothing.

## Next session (handoff, 2026-09-08)

State: M0–M4 built. Anyone opening the site sees every saved route as a blue
line; tapping one opens a card. The owner can draw, save (sign-in is asked for
at Done), edit a saved direction, delete one, and is prompted to draw the
return trip after each save. An unsaved drawing survives a reload (and the
magic-link redirect) via localStorage.

Verified headlessly by `node scripts/uitest.mjs` (23 checks, against the real
Tala route) and by the owner's own first save and edit through the UI.

Start with: `npm run dev`, then `node scripts/uitest.mjs` if anything looks off.

Done 2026-09-08: the public map opens fitted to the saved routes (padding
100, maxZoom 13, once, never while drawing); verified on the live site by
`node scripts/realshot.mjs <url> <out.png>`, whose probe now prints the view.

Next is M5 — Export + tidy: GeoJSON export of all routes (the public read means
this can be a plain fetch + download), keyboard shortcuts (Esc cancels,
Ctrl+Z undoes, Enter = Done), and whatever the first real routes reveal.
*Keyboard shortcuts landed 2026-09-22 — see "Drawing keys".*

Security advisor is clean except "leaked password protection" (dashboard
setting). Now that sign-in is password-based it is worth turning on.
*(2026-09-14: Pro plan and above only — not available on Free.)*

2026-09-12: auth moved to email + password (SignIn, ResetPassword,
ChangePassword, usePasswordRecovery); Vite pinned to port 5173 with
`strictPort` because the Supabase redirect allow-list names that port exactly.
M6 (hotspots) built and verified the same day; see its section above.

## Next session (handoff, 2026-09-12)

State: M0–M4 and M6 built. Two hotspots exist on the live map. Owner can
trace, save, edit and delete both kinds; visitors see them and tap for the
route list. Not yet exercised by a human: **Edit** and **Delete** on a saved
hotspot (wired, type-checked, headless-tested for the read path only — writes
need the owner's sign-in).

Start with: `npm run dev`, then `node scripts/pw/regression-gestures.mjs` if
anything looks off (needs `npm i -D playwright` once).

Next is M5 — Export + tidy — plus two small follow-ups from M6: save the map
view in the draft; and turn on leaked-password protection in the dashboard.
*(2026-09-14: Pro plan and above only — see build-order step 1.)*

## Next session (handoff, 2026-09-14)

State: a planning session on 2026-09-14 produced Phase 2 (M7–M15) and the
**Build order — agreed 2026-09-14**, which is what comes next. Live data:
3 routes, 3 directions, 4 hotspots — one route, "asd", is the owner's test from
step 1; one account, the only editor.

**Step 1 done 2026-09-15.** **Step 2 built, merged into `main` and deployed
2026-09-15** (see its section); realshot on both live URLs passed, and the
owner completed a real reset email on the live site. **Step 2 done.**
**Step 3 built 2026-09-15** on `build-order` (see its section), with the
owner's decision that U-turns are shown, never changed. Two independent
reviews acted on; the owner edited a real route ("snapping is good") and gave
the go to merge into `main`. **Step 3 done.**
**Step 4 built 2026-09-15** on `build-order` (see its section): the phone
tap, the chooser, the bottom sheet, phone chrome, share links. One independent
review acted on; the owner tried it on a real phone over the home network.
**Merged into `main` and deployed 2026-09-15** (`a3e04b0`): the live public
page at phone size has no zoom buttons, the attribution top right, no
horizontal scroll, and a tap on the fitted view opened a chooser; the studio
still shows its door. **Step 4 done.** The owner deferred the naming
conventions ("Decide before the next route is drawn") until after step 6, with
the note that they hold at 1–3 routes; ideas for standardising are wanted then.
**Step 5 built 2026-09-15** on `build-order` (see its section): the map as a
file, the daily workflow, the visitor page off the database. One independent
review acted on. **Merged into `main` and deployed 2026-09-15** (`0583051`);
the live map loads from the file and never calls the database. The owner ran
the workflow once by hand: unchanged, nothing committed. **Step 5 done.**
The workflow's two actions were moved to `@v5` after a Node 20 deprecation
warning.
**Step 6 built 2026-09-15** on `build-order` (see its section): the app is
installable as "Para Po", with an icon and colours made from the owner's logo,
works offline from the published file with an honest date, and offers updates
rather than forcing them. One independent review acted on. **Merged into
`main` and deployed 2026-09-15** (`ffd6041`); the live checks in its section
passed, including an offline reload through Cloudflare. The owner installed
it on a real Android phone: "it's good, it's fast". **Step 6 done. All six
build steps are done.** Next, on the owner's word: the naming conventions
session ("Decide before the next route is drawn"; the owner wants ideas for
standardising), then the routing ideas and M8 onward. The monthly private
backup (step 5) falls due mid-October.
**Licences added 2026-09-15**, before step 6, on the owner's decision (see
"Licensing"): MIT for the code, ODbL 1.0 for the data. Merged and deployed
(`dce3f63`, which also took the `@v5` actions to `main`): the live
`/data/map.json` carries `license: ODbL-1.0` and its attribution; the live
credit line reads "Route data © ParaPo contributors, ODbL" on a phone (top
right) and a desktop (bottom right), linking to the README's licence section;
still no request to the database. GitHub first detected the licence as
"Other", because `LICENSE` had a note appended below the MIT text; the note
lives in the README instead, and `LICENSE` is the plain MIT text GitHub
recognises.

**Storybook added 2026-09-15**, before step 3, on the owner's ask: Storybook
10.6.0 (`@storybook/react-vite`, `@storybook/addon-docs`), telemetry off.
`npm run storybook` opens it on port 6006; `npm run build-storybook` writes
`storybook-static/` (ignored by git, never deployed). Stories sit next to their
component — `src/shared/RouteCard.stories.tsx` and `HotspotCard.stories.tsx`,
on sample data, no Supabase — so `check-boundaries` polices their imports like
any other file. The generated examples in `src/stories/` were deleted: that
folder is outside the three areas and fails the boundary check.
`src/shared/index.css` has `@source not "../**/*.stories.tsx"`, because
Tailwind otherwise scans stories into the site's CSS (measured: 104.33 →
104.41 kB, and new file names); `.storybook/preview.css` adds them back for
Storybook only. Checked: `npm run check` passes and the build is byte-for-byte
the deployed one (`commuter-BNMeUuwJ.js`, `useSavedStops-C6AegbMv.css`); all 6
stories render in Chromium, from the static build and the dev server, with no
console errors.

Owner actions already known: a strong password, then sign-ups off and a
stronger password rule (step 1, done); the `/studio/` redirect URLs (step 2,
done by the owner 2026-09-15); the free decisions under "Decide before the
next route is drawn".

Found this session:

- Writes were not locked to the owner — fixed by step 1, 2026-09-15.
- `SignIn.tsx` sent reset links to the site root — fixed by step 2: they go to
  `/studio/`.
- `useSavedStops.ts` imported its colours from `useDrawing.ts` — fixed by step
  2: `shared/colours.ts`.

Prep before step 1, done 2026-09-14:

- The owner, as the owner reports: 2-step verification on GitHub, Supabase and
  Cloudflare; a strong, unique ParaPo password; "Allow new users to sign up"
  switched off.
- A backup of the public map tables on the owner's machine:
  `Documents/ParaPo-backups/parapo-map-2026-09-14.json` — 2 routes, 2
  directions, 4 hotspots, 4 links; 234,619 bytes; sha256 begins
  `9ca0b5607caff575`. Accounts are not in it.
- Work happens on the branch `build-order`, pushed to GitHub. `main` is what
  deploys, and stays untouched until a step is merged.
- Playwright 1.63.0 is now a dev dependency. Its Chromium (1243) was already
  installed on this machine.
- Untracked and left alone: `public/branding/para-po-logo.png`, the owner's,
  added the same day — the likely icon source for step 6. Anything in `public/`
  deploys as-is once committed.

Baseline the same day, before any step-1 change:

| Check | Result |
|---|---|
| `npm run build` (tsc + vite) | Passes; 1,426 kB / 384 kB gzipped, unchanged |
| `gate-test` | 2 / 2 |
| `hotspot-test` | 21 / 21 |
| `regression-gestures` | 27 / 27 |
| `visitor-test` | 5 pass, 4 fail, then aborts — all risk #1 |

The visitor-test failures come from the data it was written against, not from
the app. It expects 1 route and 2 hotspots (there are now 2 and 4), and it
assumes every hotspot's card lists "Tala → to SM Fairview". The hintuan
"Phase 1", added since, opens its card correctly but does not list Tala, so the
chip click times out and the rest of the test never runs. Step 2 rewrites the
test to read what exists first.

**Local dev note.** On this machine Vite listens only on `[::1]:5173`, because
`localhost` resolves to IPv6. *Resolved in step 2:* every test now opens
`localhost` (override with `PARAPO_BASE`), and all five pass against a plain
`npm run dev`.

## Next session (handoff, 2026-09-21)

State, read from the live project and the repo, nothing changed but this file:

- **Supabase is up to date.** Migrations 0001–0005 are all applied and were
  verified statement by statement against the live schema (see "Migrations
  applied to the live project"). Nothing in `supabase/migrations/` waits to
  be applied. The security advisor shows the two known items only:
  leaked-password protection (Pro plan, accepted) and the INFO on
  `private.editor` (intended). One account, one editor.
- **Live data:** 0 routes, 0 directions, 5 hotspots, 0 links. The owner
  cleared every route on 2026-09-17 and began again from the hotspots:
  "Phase 1" (12 Sep), "Tala Jeepney Terminal", "Barracks", "Malaria" (17 Sep)
  and "Terminal Tala" (19 Sep). Two terminals named for Tala look like a
  duplicate to settle in Phase 3 step 0 (hotspot names and spellings).
- **Publishing:** the nightly run failed on 17 September, when the shrink
  guard refused 2 → 0 directions; `b266d16` (19 Sep) published the cleared map
  once with `--force` and gave "Run workflow" a Force box. Runs since (18, 19
  and 20 Sep UTC) are green; the last change it committed is `aa8cbed`,
  2026-09-19 22:07 UTC, carrying the five hotspots. `f5e6bde` (19 Sep) moved
  the basemap to OpenFreeMap's Positron, so routes and hotspots carry the
  colour.
- **Branches:** `build-order` is fast-forwarded to `main` and carries nothing
  unmerged. Work resumes on it.

Next, on the owner's word, is **Phase 3** (drafted 2026-09-15, above),
starting with step 0, the naming conventions. The first Supabase change after
that is migration 0006 (M8, metres along the line, step 3), which is not
written yet and waits on step 0 by design. The monthly private backup falls
due mid-October.

## Known risks (reviewed 2026-09-12, after M6)

Ranked by how soon each is likely to bite. Fix #1 before the next feature.

**Found 2026-09-14, ahead of all of these:** writes were not locked to the
owner. Any signed-in account could write rows it owned, and sign-up was open
through the public API. *Fixed 2026-09-15 by build-order step 1:* sign-ups off,
and migration 0005.

Soon — as data grows:

1. ~~**`scripts/pw/*` tests are tied to today's data.**~~ *Fixed 2026-09-15 in
   step 2:* the tests read what the map holds before asserting, and the
   drawing tests move onto a saved route before clicking.
2. **Terminal `stop_sequence` drifts.** It is a vertex index; re-snapping a
   route renumbers vertices. Hintuan links are recomputed on route save,
   terminal links are not.
   *Reassessed 2026-09-14 — this is not a small fix.* The vertex index is what
   blocks sub-routes, looping, annotating and corridor matching, all of which
   need to say "here along this route" in a way that survives a re-snap.
   *Fix:* M8. Metres along the line, and a `route_stop` key that allows more
   than one pass. Not `syncHintuanLinks`.
3. **Saves are not transactional.** `saveStop` = row, delete links, insert
   links — three requests; a failure after the second leaves a hotspot with
   no links. Route save + hintuan sync has the same shape, and a retry then
   trips the unique-direction constraint. Deletes never check how many rows
   went, either: one that RLS refuses (from an account not on the editor list)
   reports success having deleted nothing (review, 2026-09-15).
   *Fix:* one Postgres function per save, called via RPC — `security invoker`,
   so the editor rules still apply. Deletes ask for a count, and treat 0 as an
   error.
4. **`strictPort`** makes `npm run dev` refuse to start when 5173 is busy.
   Intentional (the Supabase allow-list names that port). Free the port.

When a second editor arrives:

5. **RLS blocks cross-owner links.** `route_stop` writes require the *route's*
   owner. A hintuan drawn by user B over user A's route saves with an empty
   list. *Fix:* loosen the policy to any authenticated editor, or one shared
   owner. Interacts with #3.
   The opposite gap too (review, 2026-09-15): `route_variant` never checks its
   route's owner, and `route_stop` never checks the stop's owner, so editor B
   could add a direction to A's route or link A's hotspot. *Fix:* settle one
   ownership model — shared editing, or parent-owner checks in the policies —
   before a second account joins the editor list.
6. **Password-reset mail** only reaches the project's team addresses, a few
   per hour (Supabase built-in mailer). *Fix:* custom SMTP (Resend, Postmark…)
   before there are real users.

Geometry edge cases not yet hit:

7. **Self-intersecting outlines** (a figure-eight) make "inside" meaningless.
   *Fix:* detect crossing edges before Done and warn.
8. **Ring winding is not normalised** (GeoJSON wants exterior rings
   counter-clockwise). MapLibre and geo.ts do not care; PostGIS/QGIS/GTFS
   tools may. *Fix:* one line in `ringToPolygon`, when export lands (M5).
9. **Overlapping hotspots** — a terminal inside a larger hintuan — only the
   top one is clickable. *Fix:* a small "which one?" picker on multi-hit.

Dependencies that are not ours:

10. **Hotspot labels use `Noto Sans Bold` from OpenFreeMap's glyphs.** A
    basemap change makes them vanish silently. Match the font name then.
11. **Public OSRM** for every routed segment (see Router choice above).
12. **Migrations tracked by hand** in this file. Fine at five (the last two
    are also in Supabase's own table, see "Migrations applied"); move to the
    Supabase CLI's tracking when it starts to hurt.

Also: drafts do not save the map view (noted under M6).

## Definition of done

- Deployed Cloudflare Pages URL
- Only one account can write; anyone with the link can read
- 8 routes drawn, saved, reopenable, editable
- One GeoJSON file containing all of them

---

## Deliberately out of scope

Through M6: GPS recording · route verification · intermediate stops · public
browse view · search · mobile layout · offline · PWA · PMTiles · A-to-B
directions · ads · subscriptions · logo · domain

Revised 2026-09-14. Phase 2 brings **mobile layout** (M14), **a PWA with
last-seen offline** (M15) and, before any APK, a **domain** in scope, and turns
"intermediate stops" into M8–M11. Still out, deliberately:

- **User contribution of any kind.** Visitors read what the owner has drawn and
  nothing more. The schema is ready (`gps_session` since M1) and the UI is not.
- **Visitor accounts.** No sign-in or sign-up for visitors (decided 2026-09-14).
  See "Accounts, later" under the build order.
- **Tracking and analytics.** No location permission is declared or requested —
  see M15. Nothing to justify it while nobody contributes.
- **A-to-B directions.** Needs M8–M12 first, and they are worth having on their
  own merits.
- **An APK, for now.** M15 keeps the PWA ready for one.
- **A full offline basemap (PMTiles).** Last-seen data and already-viewed tiles
  only.
- **iOS.** Not planned. The PWA happens to work there, untested.

---

### Router choice

The FOSSGIS demo OSRM instance has no SLA and is meant for light use. That is
exactly what a single person drawing a handful of routes is. If ParaPo ever
serves real traffic, the upgrade path is OpenRouteService with a key, or
self-hosted OSRM on a small VPS. Neither changes the client contract: both
return road-following geometry between two points.

An ORS free-tier key already exists if it is ever needed. Quotas: Directions
V2 2000/day at 40/min, Snap V2 2000/day at 100/min, Matrix V2 500/day at
40/min. Two caveats when switching:

- The host is `api.heigit.org`. `api.openrouteservice.org` is deprecated.
- The key cannot ship in the browser bundle, so switching means reinstating
  the Supabase Edge Function proxy and a secret. That cost is the reason
  OSRM stays the default.

ORS Snap V2 is worth remembering for Phase 2: it snaps loose points onto the
road network, which is exactly what cleaning a raw GPS trace needs.

## What OSM already covers

Overpass query over the Metro Manila bbox (2026-09-07) returned 831 route
relations:

- 805 `route=bus` — provincial and city buses, plus 51 P2P. Well mapped.
- 26 `route=share_taxi` — mostly UV Express on Cavite and Laguna corridors.
- ~23 named "jeepney". Essentially nothing.

Operators are bus companies and transport cooperatives. Buses and P2P are
covered; traditional jeepneys are not. Some numbered relations follow LTFRB
rationalised numbering and may be modern PUV routes indistinguishable from
tags alone, so the real jeepney figure is somewhat higher than 25 — but far
from complete.

Tag completeness among what is mapped is good: 741 of 831 carry a `ref`, 792
carry `from` and `to`. Worth mirroring, and the schema already does.

## Existing government route data (checked 2026-09-07)

Three sources, of very different quality:

1. **LTFRB memorandum circulars** — the closest thing to an official current
   list. Routes carry rationalised codes (T181, T3189…; "Route 23", "411X" in
   OSM). Published as PDFs on ltfrb.gov.ph, mostly during the 2020–2022
   reopening (MC 2020-058: 44 routes/4,820 units; MC 2020-073; MC 2021-058;
   MC 2022-084 reinstated pre-pandemic routes). Not machine-readable.
2. **DOTC GTFS (~2013–2015)** — the only machine-readable dataset. Released for
   the Philippine Transit App Challenge; preserved in
   https://github.com/sakayph/gtfs on the `dotc` branch (branches: dotc, master).
   Licence: a DOTC "Developer License Agreement and Terms of Use" (LICENSE.md;
   not an open licence — read it before any use). Last commit 2015-03-24.
   `dotc` routes.txt: 1,715 routes — 1,711 LTFRB road routes (jeepney, UV
   Express and bus, unlabelled; GTFS route_type 3) plus LRT-1, LRT-2, MRT-3
   and PNR. Names are terminal pairs ("Baclaran - Roosevelt"). Stale, but
   the natural reference layer / seed and a sanity check for drawn routes.
3. **LPTRP route rationalisation** — the future official map. Per DOTr
   (Jan 2025): ~15% of routes rationalised, target 50% by end-2025 and 100%
   by end-2026. When published, LGU LPTRPs supersede the GTFS.

Also: an FOI request "public transport route dataset" exists on foi.gov.ph
under DOTr (page blocked to bots; read it in a browser).

Use for ParaPo: overlay the `dotc` GTFS as a dim reference layer (Phase 2+),
never copy its geometry into ParaPo's routes. Government works are not
copyrighted under the Philippine IP Code (Sec. 176) but for-profit use needs
agency approval — verify before any commercial use of the GTFS itself.

## Licensing

**Decided by the owner, 2026-09-15:** the route and hotspot data is under the
**ODbL 1.0**, credited "Route data © ParaPo contributors, ODbL"; the code is
under **MIT**, copyright "ParaPo contributors". Recorded in `LICENSE` (code)
and `README.md` (both, in plain words); `publish-map.mjs` writes `license` and
`attribution` into `map.json` itself, so every copy of the file carries the
terms; the map's credit line shows "Route data © ParaPo contributors, ODbL"
before the OpenStreetMap credit, on both pages. On a phone the credit opens to
three lines at the top right, and two things sat on it: the route count pill
(top left, since step 4) and the load-failure banner. Both moved to the bottom
on narrow screens; on a wide screen nothing moved. Checked with the file
answered by a 404: the banner shows at the bottom on a phone and at the top on
a desktop, clear of the credit, and "Try again" loads the map. Why: a public map cannot be
locked, so the aim is that every copy keeps the credit and stays open.
ParaPo's advantage is routes verified by riding and kept current, which a
copy of one day's file does not have.

Snapped geometry derives from OpenStreetMap via OSRM, so ODbL
share-alike plausibly attaches to the route database. Fine for a civic project;
incompatible with exclusive data licensing later.

Clean-room alternatives, if that ever matters: freehand drawing from personal
knowledge, or own GPS traces. Both are original observation and unencumbered.

**Attribute OpenStreetMap in the app regardless** — OpenFreeMap tiles are
OSM-derived too.

Also worth checking once: whether "ParaPo" is taken on IPOPHL or the app stores.

---

## Migrations applied to the live project

Applied by hand (SQL editor or the Supabase MCP); there is no migration
tracking table. Do not re-apply.

- [x] 0001_init — 2026-09-07
- [x] 0002_pin_function_search_path — 2026-09-08
- [x] 0003_rls_performance — 2026-09-08 (write path probed as the owner under
      RLS, rolled back; advisor clean afterwards)
- [x] 0004_stop_hotspot — 2026-09-12 (stop table was empty; columns and enum
      verified after apply; advisor unchanged — only the pre-existing
      leaked-password warning)
- [x] 0005_editor_role — 2026-09-15 (build-order step 1; the owner's uid
      inserted into `private.editor` right after; checks in its section)
- [x] 0006_route_ends — written and applied 2026-09-21 (route and
      route_variant were empty; six columns, two unique indexes and the dropped
      `direction_name` unique verified after apply; the stop table held five
      hotspots, two of them Tala terminals)
- [x] 0007_stop_names — written and applied 2026-09-21 (two columns and the
      partial unique index verified after apply; probed in a rolled-back block:
      second terminal under one informal name refused, hintuans accepted)
- [x] 0008_route_borrow — written and applied 2026-09-25 through the MCP
      (three nullable columns on `route_variant`, two checks, a partial index;
      probed in a block that raised to roll back: a part without metres, a
      line borrowing from itself and a part of 'middle' all refused; deleting
      the parent left the child whole with `borrowed_from` null; 2 rows, none
      borrowing, afterwards)

0004 and 0005 went through the Supabase MCP, which records them in
`supabase_migrations.schema_migrations` (`stop_hotspot`, `editor_role`);
0001–0003 went through the SQL editor and are not recorded there. **Verified
2026-09-21** against the live project: every policy carries the 0005 form,
`touch_updated_at` and `is_editor` pin `search_path`, the `stop` columns and
enums match 0004, and TRUNCATE, TRIGGER and REFERENCES are off `anon` and
`authenticated`. 0006 and 0007 followed later the same day (their sections
above); the live `route_variant` columns and indexes were read back on
2026-09-22 and match 0006 exactly. 0008 followed on 2026-09-25. Nothing in
`supabase/migrations/` is left to apply; the next number is 0009.

## Open items

Blocking M1, not M0:

- [x] Supabase project — `smzwbqxttdyvohuizynl` · anon key still needed in `.env.local`
- [x] Cloudflare deploying from `main` (Workers Builds, `npx wrangler deploy`)

Worth doing before M2:

- [x] Spike: snapping quality — PASSED. Cubao→Quiapo via public OSRM
      returned 9.21 km / 378 points along General Araneta → Aurora →
      E. Rodriguez Sr. → Quezon Ave → España → Lerma → Quezon Blvd.
      Metro Manila OSM road data is good enough to draw against.
- [x] Spike: OpenFreeMap detail — z11 over Metro Manila verified by real-clock
      headless screenshot (scripts/realshot.mjs): roads, water, district labels,
      expressway shields all present. Street-zoom feel: judge while drawing.
- [ ] Decide the mode enum (jeepney / e-jeepney / UV Express / bus / P2P / …).
      Open since M0 and already in the schema. Moved 2026-09-14 into
      "Decide before the next route is drawn", with the naming conventions —
      all of them are free today and unfixable at 200 routes.
