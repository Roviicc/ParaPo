# ParaPo — MVP Plan

Ground-truthed jeepney route data for Metro Manila.

Official transit data is a decade stale and routes change constantly. ParaPo's
premise is a current, hand-verified map of how the city actually moves.

---

## MVP goal

**Get 5–8 real jeepney routes drawn and stored, by one person, on a laptop.**

Success is measured in routes in the database — not in how the app looks. If it
is ugly and produces correct geometry, it worked.

---

## Locked decisions

| Area | Decision |
|---|---|
| Platform | Web, desktop-only, deployed to Cloudflare Pages |
| Stack | Vite + React + TypeScript + Tailwind |
| Map | MapLibre GL JS |
| Basemap | OpenFreeMap (no key, no bill) |
| Primary input | Draw with snap-to-road |
| Snapping | FOSSGIS public OSRM — no API key |
| Backend | Supabase — Postgres + PostGIS |
| Auth | Magic link, single user |
| Write access | Public read, writes locked to one uid via RLS |
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

- Login is a one-time magic link, then invisible. No header, no avatar.
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

**M3 — Editing.** Drag to move, insert mid-segment, delete, per-segment freehand
toggle, adjacent-only re-snap.

**M4 — Persistence.** Save panel, click-to-edit on the map, delete, return-trip
prompt.

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

---

## Next session (handoff, 2026-09-07 night)

State: M0–M2 done. Local and live both render; drawing + road snapping
confirmed working by the user. Tree clean, everything pushed.

Start with: `npm run dev` (the dev server is not left running), then
`node scripts/realshot.mjs http://localhost:5173/ out.png` if anything looks
off before asking a human.

Then M3 — editing: drag a control point (re-snap only its two adjacent
segments), insert mid-segment, delete, per-segment freehand toggle. OSRM
round-trips for click-sized segments from this machine are well under a
second, so re-snapping on drag-end without a debounce is fine; throttle
only if the router starts answering slowly.

Reminder: nothing drawn is saved until M4 lands (✓ Done is disabled). Do not
draw eight routes yet.

## Definition of done

- Deployed Cloudflare Pages URL
- Only one account can write; anyone with the link can read
- 8 routes drawn, saved, reopenable, editable
- One GeoJSON file containing all of them

---

## Deliberately out of scope

GPS recording · route verification · intermediate stops · public browse view ·
search · mobile layout · offline · PWA · PMTiles · A-to-B directions · ads ·
subscriptions · logo · domain

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
   License as detected by GitHub: NOASSERTION. Last commit: 2015-03-24T06:16:49Z.
   `dotc` routes.txt: 1715 routes across jeepney, bus and rail. Stale, but
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
- [ ] Decide the mode enum (jeepney / e-jeepney / UV Express / bus / P2P / …)
