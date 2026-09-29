# Headless checks (Playwright)

Drive the dev server in headless Chromium and check that both pages behave: the
public map at `/` and the editor at `/studio/`. Runs anywhere Playwright's
Chromium does.

    npm i -D playwright && npx playwright install chromium   # once
    npm run dev                                              # in another terminal, on :5173
    node tests/e2e/gate-test.mjs              # 15: the studio's sign-in door, ?e2e=1, the reset-link forwarder
    node tests/e2e/visitor-test.mjs           # 610 (608 run, 2 SKIP today): the public map — no editor, no database, no count pill or zoom buttons, cards, chips, a hotspot card's RouteCards (no pesos on any card; every route they show lit, a tap on a card narrowing that to its own, a second letting it go) and ‹ back to it from the trip with every card at rest (the hotspot dark under the trip, lit again), a tap on a hotspot and a line — the route list, the hotspot first, everything it lists lit, a pick narrowing it — and ‹ back to it at rest, in its card's colour — a picked card's routes and the trip's line in the card's colour too, chevrons and end circles with them, back in blue at rest — a hintuan picked on the trip (its pill the pesos from the start to there, the map dark only that far, the camera clear of the corner card, a second tap, either end (picked itself, its dot green) and ✕ letting go, the camera gliding to that end, one end letting the other go), the two looks (opaque light blue at rest, dark blue lit, nothing shaded), names only close in
    node tests/e2e/where-test.mjs             # 22: "Where am I" on / at 390×844 with an emulated GPS — off until asked, the figure standing over its accuracy halo, walking and facing its way, flying at jeep speed, the map following until dragged, a tap following again, off, and a browser that refuses (PARAPO_NO_TILES=1 where tiles are blocked; PARAPO_VIDEO=dir records it)
    node tests/e2e/phone-test.mjs             # 86 (85 run, 1 SKIP today): / at 390×844 — the ±20 px tap, the route list (every route it lists lit; a tap on a card's name narrows the lights to it, a second lets it go; a row opens its trip straight away, picking no card, and ‹ comes back with every card at rest) and the trip card it opens (in its card's colour; its Kilometer and Expected fare tiles against the app's own sums; the fold and its motion, a hintuan picked — Selected, its pill the app's own sums in the card's colours swapped, the map dark only that far with no get-off circles, the camera clear of the card, no padding left, where the trip goes and where it leaves from letting it go and gliding the map there — SWITCH keeping the colour and letting the pick go, ‹ back to the list letting it go), a trip opened on its own whose ‹ lists the routes sharing an end, a hotspot card's bottom sheet (finger and mouse drags), and its handle tapped over routes opening none — even with the tap's click a second late, which the sheet still swallows, ?r=
    node tests/e2e/regression-gestures.mjs    # 29: route and hotspot gestures on /studio/?e2e=1
    node tests/e2e/hotspot-test.mjs           # 22: hotspot tracing, draft reload, a routed segment on /studio/?e2e=1
    node tests/e2e/snap-test.mjs              # 20: far clicks go freehand, U-turns at joins shown not changed, street names
    node tests/e2e/extend-test.mjs            # 16: Extend's join mode, and a right-click on a saved line following it to its end
    node tests/e2e/group-test.mjs             # 35 (35 run, 0 SKIP today): the studio's route list on a tap where routes share a road — one way round, a RouteCard per place, only what is drawn, all of it lit till a card is picked, a second tap and SWITCH letting it go, the picked card lit with arrows, end circles and names, the other way drawn as it rests, opaque, and the studio's paint in the same two looks; its ride-to preview still drawing the way not ridden at rest with its get-off circles, a second tap putting the route back; clicks that switch, and clicks that keep what the list shows, a card picked or not

    npm run test:unit                         # 90 in 11 files (tests/unit/), one `node --test`, no browser: the studio's paged table reader against a capped fake server (11), the map file reader against every shape of file it can meet, and the committed file's decimals (10), the orange stretches with their bounds checks against the walk without them (4), the pass index the saves link by with its bounds checks against the walks without them (4), the map data check against small maps with one thing wrong each and the committed map (12), what a save keeps of a coordinate (2)
    npm run check:data                        # the committed map against the app's own rules: problems stop a publish, warnings are for the owner (scripts/checks/check-map-data.mjs)
    npm run build                             # also checks import boundaries, that no editor code reaches /, and the installable app's files
    node tests/e2e/studio-scale-test.mjs      # 12: /studio/?e2e=1 with 1,000 directions and 500 hotspots as the database keeps them, served by a stand-in for its REST API, no tiles, no router — the list carries no drawings, a followed line's drawing is read on its own, the links pages are asked for together, the first line and a click's lighting within their budgets
    node tests/e2e/scale-test.mjs             # 5: / with 1,000 directions and 500 hotspots made from today's map, no tiles — the first line on the screen within 30 s, the main thread busy under 20 s; prints where the opening went
    node tests/e2e/studio-standin.mjs         # not a suite: the studio's save flows signed in, against a stand-in for the database (today's map as the tables, writes echoed back) and a faked stored session — a route saved, a hintuan traced and saved, a card picked and edited; prints each step and screenshots it. The seed for a save-flow suite (docs/plan-cleanup-2026-09-29.md, stage 4)
    node tests/e2e/pwa-test.mjs               # 41: the installable app, against the build in its own `vite preview` on :4173 — manifest, worker, offline, slow network, update

**On GitHub, every push runs these** (`.github/workflows/ci.yml`): one job builds
and runs gate, visitor, phone, where, scale and pwa; a second runs studio-scale, then the
drawing suites one at a time, with one retry after a minute for the shared router. A red check on a
branch means the push broke something; the failing suite's screenshots are
kept as the run's artifact.

The service worker is off under `npm run dev`, so every suite above meets a
plain page; `pwa-test` alone runs the production build. It starts and stops its
own preview server (set `PARAPO_BASE` to use one already running), checks that
`/studio/` renders its door and gets neither the manifest nor a worker, that
the worker answers only `/` from the stored page, then cuts the network and
reloads `/`: the routes, hotspots and basemap (tiles from the worker's cache)
must still draw, the notice must read "Offline · map as of <date>" from the
file's own `published_at`, and panning into never-seen tiles must not raise the
failure banner. Back online it delays the map file past the worker's 3 s and
expects "Not refreshed · map as of <date>", then changes a byte of the built
worker and expects "New version · Reload" to appear, wait, and work.

The tests read what the map holds today (the published file for `/`, the live tables for the studio) and assert on that, so adding
routes and hotspots does not break them. visitor-test's count grows with the
data (some sixteen checks for a hotspot with routes through it, a few for
one without); a check the data cannot support prints `SKIP`.
The drawing tests first move the map onto a saved route, so their clicks land on
streets the router can snap to.

`/studio/?e2e=1` skips the sign-in door, in development builds only. Saving still
needs an account, and the database refuses writes from anyone not on the editor
list. Production builds drop the switch; `npm run build` fails if it survives.

Each test prints PASS/FAIL (and SKIP) lines and exits non-zero on any failure.
Screenshots land in the current directory.

- `PARAPO_BASE` — the dev server's address. Default `http://localhost:5173`.
- `PARAPO_NODE_FETCH=1` routes the browser's https traffic through Node — only
  for sandboxes where the browser has no network.

The drawing tests call the public OSRM router, a shared demo server that allows
about one request a second. If routing checks fail while other tests are running,
wait a minute and run one test at a time.
