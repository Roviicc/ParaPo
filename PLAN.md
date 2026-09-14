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
| Write access | Public read. Writes were meant to be locked to one uid; the live RLS lets any signed-in account write rows it owns (found 2026-09-14, when one account existed). Step 1 of the build order locks writes to an editor list with one member |
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

- Migration `0005_editor_role.sql`: an `editor` table (`user_id` referencing
  `auth.users`) with RLS on and no policies, so the API can neither read nor
  change it; and `is_editor()` — `security definer`, `stable`, `search_path`
  pinned — true when the caller's uid is listed. Every insert, update and
  delete policy on `route`, `route_variant`, `stop`, `route_stop` and
  `gps_session` gains `and (select public.is_editor())`. The owner checks stay.
- The owner's uid is inserted when the migration is applied, not written into
  the file: the repo is public, and the migration should stay reusable.
- A list rather than a hard-coded uid, so future accounts (see "Accounts,
  later") can exist without edit rights.
- `SignIn.tsx` loses its sign-up mode.

*Checks:* inside a transaction that is rolled back, an authenticated uid that is
not an editor is refused an insert on `route` and the owner is allowed one; the
security advisor is clean; all headless checks pass; the owner saves one real
edit on the live site.

### Step 2 — Two front doors

As **M13**, in its own build order, plus: the visitor app asks only for the
columns it draws — not `control_points`, not `segments` — which halves what a
visit downloads (measured: 17.2 → 8.4 kB gzipped for the two saved directions).
Sign-in at the door, with no sign-up.

*Done when:* the visitor bundle contains no editor or sign-in code (build
check); `/studio/` asks for sign-in; a reset email completes end to end; the
headless checks pass against both pages.

### Step 3 — Snapping quality

As **M7**: `radiuses`, joins re-routed together with both neighbours, and
street names from `steps=true` shown in the save panel. M7's fourth item —
simplified geometry for visitors — moves to step 5, where the published file
is made.

*Checks:* a click inside a block, away from any road, gives a visible failed
(dashed) segment instead of a far-away snap; dragging a middle point leaves no
U-turn spur at either join; all gesture checks pass; the owner edits one real
route and confirms.

### Step 4 — Visitor map on a phone

As **M14**, unchanged.

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

Checked twice: `scripts/check-boundaries.mjs` reads every import, and a build
check walks Vite's build manifest from `index.html` and fails if any commuter
chunk contains `router.project-osrm.org`, `signInWithPassword` or
`parapo.draft`.

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

- `SignIn.tsx:53` sends reset links to `window.location.origin`. After the split
  that is the commuter page, which has no reset form — recovery would break
  silently. It becomes `${origin}/studio/`.
- **Owner action:** Supabase dashboard → Authentication → URL Configuration —
  add `http://localhost:5173/studio/` and
  `https://parapo.villaralvorovic2.workers.dev/studio/` to the redirect
  allow-list. Code cannot reach this setting.
- A reset email sent *before* the deploy still points at `/`. The commuter
  forwards any arriving `type=recovery`, `code=` or `error=` parameters to
  `/studio/` untouched; with `detectSessionInUrl` off it never consumes the
  token itself.
- The studio with no session shows the sign-in panel instead of the map tools.
  The localStorage draft stays: a reload mid-drawing still keeps the work.

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
- **Side of road for hintuans.** One on the northbound side of Commonwealth is
  not the southbound one. The polygon can already say so; whether it *does* is
  a convention, not code.
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

State: no code changed since 2026-09-12. A planning session produced Phase 2
(M7–M15) and the **Build order — agreed 2026-09-14**, which is what comes next.
Live data: 2 routes, 2 directions, 4 hotspots; one account.

**Waiting for the owner's go on step 1.** Nothing has been started.

Owner actions already known: a strong password, then sign-ups off and a
stronger password rule (step 1 — leaked-password protection is Pro plan only);
add the `/studio/` redirect URLs (step 2); the free decisions under "Decide
before the next route is drawn".

Found this session, not yet fixed:

- Writes are not locked to the owner — step 1.
- `SignIn.tsx:53` sends reset links to the site root, which breaks recovery once
  `/` is the visitor map — step 2.
- `useSavedStops.ts` imports its colours from `useDrawing.ts`, the one place the
  read side reaches into the editor — step 2.

## Known risks (reviewed 2026-09-12, after M6)

Ranked by how soon each is likely to bite. Fix #1 before the next feature.

**Found 2026-09-14, ahead of all of these:** writes are not locked to the owner.
Any signed-in account may write rows it owns, and sign-up is open through the
public API. Build-order step 1 fixes it.

Soon — as data grows:

1. **`scripts/pw/*` tests are tied to today's data.** `visitor-test` expects
   "1 route · 2 hotspots" and a card naming Tala → to SM Fairview; the drawing
   tests click at the centre of a view fitted to the saved routes, which moves
   as routes are added (and may land on water, where OSRM cannot snap).
   *Fix:* query what exists, then assert on that. ~1 hour.
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
   trips the unique-direction constraint.
   *Fix:* one Postgres function per save, called via RPC.
4. **`strictPort`** makes `npm run dev` refuse to start when 5173 is busy.
   Intentional (the Supabase allow-list names that port). Free the port.

When a second editor arrives:

5. **RLS blocks cross-owner links.** `route_stop` writes require the *route's*
   owner. A hintuan drawn by user B over user A's route saves with an empty
   list. *Fix:* loosen the policy to any authenticated editor, or one shared
   owner. Interacts with #3.
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
12. **Migrations tracked by hand** in this file. Fine at four; move to the
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
