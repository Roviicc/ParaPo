# Headless checks (Playwright)

Drive the dev server in headless Chromium and check that both pages behave: the
public map at `/` and the editor at `/studio/`. Runs anywhere Playwright's
Chromium does.

    npm i -D playwright && npx playwright install chromium   # once
    npm run dev                                              # in another terminal, on :5173
    node tests/e2e/gate-test.mjs              # 15: the studio's sign-in door, ?e2e=1, the reset-link forwarder
    node tests/e2e/visitor-test.mjs           # 610 (608 run, 2 SKIP today): the public map — no editor, no database, no count pill or zoom buttons, cards, a trip opening on its whole route beside the card, chips, a hotspot's HintuanCard (its box's row the one Selected, in its kind's colour; no counter where no route stops) and its RouteCards (no pesos on any card; every route they show lit, a tap on a card narrowing that to its own, a second letting it go) and ‹ back to it from the trip with every card at rest (the hotspot dark under the trip, lit again), a tap on a line inside a hotspot opening the hotspot alone, a tap where two routes share a road — the route list, routes only, everything it lists lit, a pick narrowing it — and ‹ back to it at rest, in its card's colour — a picked card's routes and the trip's line in the card's colour too, chevrons and end circles with them, back in blue at rest — a hintuan picked on the trip (its pill and the fare tile the pesos and the Kilometer tile the length from the start to there, the whole ride again once let go, the route left whole with a circle popping up at the hintuan, the camera clear of the corner card, a second tap, either end (picked itself, its dot the Selected one) and ✕ letting go, the camera gliding to that end, one end letting the other go), the two looks (opaque light blue at rest, dark blue lit, nothing shaded), names only close in
    node tests/e2e/where-test.mjs             # 38: the LocatorButton on / with an emulated GPS and compass — LocationOff at the map's foot until asked, the overlay over its accuracy circle (measured against the map's own scale, gone once zoomed out under the dot, the dot and cone smaller zoomed out, a 1 km fix capped at 150 m), the camera on the fix — 200 m across from further out than 2 km, else at its own zoom — north up (TrackedLocation), the cone turning with a walk, no tilt with no compass read, a drag letting go and a tap coming back, the compass view tilted 100 m across and turning with the phone, north up again and round, an app camera move letting go, a browser that refuses, a GPS that never has a fix (a note, no second watch), and at 1280×800 with a mouse no compass and the button bottom right (PARAPO_NO_TILES=1 where tiles are blocked; PARAPO_VIDEO=dir records it)
    node tests/e2e/phone-test.mjs             # 99 (98 run, 1 SKIP today): / at 390×844 — the ±20 px tap, the route list (every route it lists lit; a tap on a card's name narrows the lights to it, a second lets it go; a row opens its trip straight away, picking no card, and ‹ comes back with every card at rest; the list and its trip one height, Max through a pick and ‹) and the trip card it opens (the camera taking in the whole route above it as it opens, a shared link's too; in its card's colour, its ends named in pills over their circles in the line's colour, a tap on one opening its place over the trip and ‹ bringing the trip back; its Kilometer and Expected fare tiles against the app's own sums; the fold and its motion, a hintuan picked — Selected, its pill of the pesos in the card's colours swapped, both tiles, pesos and Kilometer, the app's own sums to there and the whole ride again once let go, the route left whole with a circle popping up at the hintuan in the rail's colour, its name beside it in the card's colours, and no get-off circles, the camera clear of the card, no padding left, picked at Max the card staying there, the hintuan above where Middle would be, where the trip goes and where it leaves from letting it go and gliding the map there — SWITCH keeping the colour and letting the pick go, ‹ back to the list letting it go), a trip opened on its own whose ‹ lists the routes sharing an end, a hotspot's HintuanCard (the tapped box's row Selected, tapped again letting it go for the whole place's routes and once more picking it back; another box's row Selecting it, the card staying at Max, the map gone there) and its bottom sheet (opening at Middle; the handle round Max and Low; finger and mouse drags), and its handle tapped over routes opening none — even with the tap's click a second late, which the sheet still swallows, ?r=
    node tests/e2e/regression-gestures.mjs    # 29: route and hotspot gestures on /studio/?e2e=1
    node tests/e2e/hotspot-test.mjs           # 22: hotspot tracing, draft reload, a routed segment on /studio/?e2e=1
    node tests/e2e/snap-test.mjs              # 20: far clicks go freehand, U-turns at joins shown not changed, street names
    node tests/e2e/extend-test.mjs            # 16: Extend's join mode, and a right-click on a saved line following it to its end
    node tests/e2e/group-test.mjs             # 35 (35 run, 0 SKIP today): the studio's route list on a tap where routes share a road — one way round, a RouteCard per place, only what is drawn, all of it lit till a card is picked, a second tap and SWITCH letting it go, the picked card lit with arrows, end circles and names, the other way drawn as it rests, opaque, and the studio's paint in the same two looks; its ride-to preview still drawing the way not ridden at rest with its get-off circles, a second tap putting the route back; clicks that switch, and clicks that keep what the list shows, a card picked or not

    npm run test:unit                         # 156 in 19 files (tests/unit/), one `node --test`, no browser: the studio's paged table reader against a capped fake server (11), the map file reader against every shape of file it can meet, and the committed file's decimals (10), the orange stretches with their bounds checks against the walk without them (4), the pass index the saves link by with its bounds checks against the walks without them (4), the map data check against small maps with one thing wrong each and the committed map (12), what a save keeps of a coordinate (2), "Where am I"'s pose, facing and motion from its fixes (9), the cards over the map — the list asking, a trip's ‹, the shared height, a trip behind a place's card, a row let go (7)
    npm run check:data                        # the committed map against the app's own rules: problems stop a publish, warnings are for the owner (scripts/checks/check-map-data.mjs)
    npm run build                             # also checks import boundaries, that no editor code reaches /, and the installable app's files
    node tests/e2e/studio-scale-test.mjs      # 13: /studio/?e2e=1 with 1,000 directions and 500 hotspots as the database keeps them, served by a stand-in for its REST API, no tiles, no router — the list carries overviews and no drawings or full lines, a lit line is read in full on its own with its orange stretches, a followed line's drawing is read on its own, the links pages are asked for together, the first line and a click's lighting within their budgets (15 s and 10 s)
    node tests/e2e/scale-test.mjs             # 6: / with 1,000 directions and 500 hotspots made from today's map (its index and a line file each), no tiles — every direction on the map, no orange stretch worked out at load, a tapped line's full line read and its stretches within 5 s, the first line on the screen within 5 s, the main thread busy under 5 s; prints where the opening went
    node tests/e2e/save-test.mjs             # 58: the studio's save flows signed in, against a stand-in for the database (today's map plus 500 far-off hintuans, answered as PostgREST answers: filters, unique indexes, foreign keys, cascades) and a faked stored session, no router, no tiles — the pill counts routes and the stop table is read once a load; a route saved with its empty slot, the return trip offered while the slot is empty and written into it, the overview written beside the line and cleared with it, an edit writing its one row, Edit route changing a route's ends and facts (the other direction renamed, the owner's terminal links kept) and refusing ends another route has and a head–tail swap, each writing nothing, a delete emptying the direction into a slot, a refused step of it said, and a redraw filling it; request lines short with 541 hotspots and the hintuans read in pages; a hotspot saved with its links, and the directions read again after it; a route's end refused a delete in words; undo to no points leaving no draft; a failed link sync and a retry that updates, the new route's ends locked meanwhile; a line back to its start rendering without a React warning; the drawing keys alive after signing in from Done
    node tests/e2e/pwa-test.mjs               # 44: the installable app, against the build in its own `vite preview` on :4173 — manifest, worker, offline, slow network, update, an opened trip's line kept for offline, a map published for a newer app and its Reload

**On GitHub** (`.github/workflows/ci.yml`), every suite is its own job and they
run at once, so a run takes as long as the slowest. visitor-test, the slowest by
far, runs as three jobs, `VISITOR_PART=1/3`, `2/3` and `3/3`: each opens the map
and runs the checks that cost little, and takes a third of the hotspots. Unset,
it runs whole, as on your machine. A pull request runs only what
its files can reach: docs alone run nothing, `src/studio/` alone skips the public
suites, `src/commuter/` and `public/` alone skip the studio's, anything shared runs
both. The drawing suites (group, regression-gestures, hotspot, snap, extend) are
not run on pull requests. They run on every push to `main` or `staging`, nightly
and on "Run workflow", one at a time with one retry after a minute for the shared
router. The pull request's two checks keep their names, "Build and the public map"
and "The editor". A red check means the push broke something; the failing
suite's screenshots are kept as the run's artifact.

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
worker and expects "Update Para Po!" to appear, wait, and work.

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

What more than one suite needs is written once in `tests/e2e/lib/`, which
holds no suite of its own: `harness.mjs` (the address, the PASS/FAIL/SKIP
lines and the tally, the `PARAPO_NODE_FETCH` route, the bare basemap style,
the wait for a source's features), `studio.mjs` (the drawing suites' canvas
helpers), `looks.mjs` (the lines' lit state and paint), `geo.mjs`,
`big-map.mjs` (the published map read whole, the scale suites' grid) and
`profile.mjs` (long tasks and the CPU profile). Each suite keeps its scenario.

- `PARAPO_BASE` — the dev server's address. Default `http://localhost:5173`.
- `PARAPO_NODE_FETCH=1` routes the browser's https traffic through Node — only
  for sandboxes where the browser has no network.

The drawing tests call the public OSRM router, a shared demo server that allows
about one request a second. If routing checks fail while other tests are running,
wait a minute and run one test at a time.
