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
| Snapping | OpenRouteService |
| Backend | Supabase — Postgres + PostGIS |
| Auth | Magic link, single user |
| Write access | Public read, writes locked to one uid via RLS |
| Repo | github.com/Roviicc/ParaPo |
| Live | https://parapo.villaralvorovic2.workers.dev |

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
responsiveness and to stay inside the ORS rate limit.

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

**M1 — Supabase.** Schema, RLS keyed to one uid, magic-link login, ORS proxied
through an Edge Function so the API key stays server-side. All plumbing,
nothing visible.

**M2 — Drawing.** Click to place control points, snap each new segment, render
points and line as separate layers, undo.

**M3 — Editing.** Drag to move, insert mid-segment, delete, per-segment freehand
toggle, adjacent-only re-snap.

**M4 — Persistence.** Save panel, click-to-edit on the map, delete, return-trip
prompt.

Deploy note: there is no `wrangler.jsonc` in the repo — Cloudflare Workers
Builds handles a plain static `dist` without one. Add one when client-side
routing lands, or deep links will 404 without
`assets.not_found_handling: "single-page-application"`.

**M5 — Export + tidy.** GeoJSON export, keyboard shortcuts, rough edges.

---

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

## Licensing

Snapped geometry derives from OpenStreetMap via OpenRouteService, so ODbL
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
- [ ] OpenRouteService API key
- [x] Cloudflare deploying from `main` (Workers Builds, `npx wrangler deploy`)

Worth doing before M2:

- [ ] Spike: ORS snapping quality on one known jeepney route
- [ ] Spike: OpenFreeMap detail at street zoom in the target area
- [ ] Decide the mode enum (jeepney / e-jeepney / UV Express / bus / P2P / …)
