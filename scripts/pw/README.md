# Headless checks (Playwright)

Drive the dev server in headless Chromium and check that both pages behave: the
public map at `/` and the editor at `/studio/`. Complements `scripts/uitest.mjs`
(raw DevTools, Windows Chrome), and runs anywhere Playwright's Chromium does.

    npm i -D playwright && npx playwright install chromium   # once
    npm run dev                                              # in another terminal, on :5173
    node scripts/pw/gate-test.mjs             # 15: the studio's sign-in door, ?e2e=1, the reset-link forwarder
    node scripts/pw/visitor-test.mjs          # 134 today: the public map — no editor, no database, cards, chips, the sheet on a shared tap, rest/lit, names only close in
    node scripts/pw/phone-test.mjs            # 40 (38 run, 2 SKIP today): / at 390×844 — the bottom sheet, the ±20 px tap, the chooser, ?r=
    node scripts/pw/regression-gestures.mjs   # 29: route and hotspot gestures on /studio/?e2e=1
    node scripts/pw/hotspot-test.mjs          # 22: hotspot tracing, draft reload, a routed segment on /studio/?e2e=1
    node scripts/pw/snap-test.mjs             # 20: far clicks go freehand, U-turns at joins shown not changed, street names
    node scripts/pw/extend-test.mjs           # 16: Extend's join mode, and a right-click on a saved line following it to its end
    node scripts/pw/group-test.mjs            # 26: a tap where routes share a road — one way round, by place, ⇄, lit with arrows, end circles and names, the other way at rest; clicks that switch, and clicks that keep what is lit
    node scripts/uitest.mjs                   # 26: route gestures through Windows Chrome's DevTools protocol

    npm run test:unit                         # 38, Node's own test runner, no browser: the studio's paged table reader against a capped fake server (10), the map file reader against every shape of file it can meet, and the committed file's decimals (10), the orange stretches with their bounds checks against the walk without them (4), the map data check against small maps with one thing wrong each and the committed map (12), what a save keeps of a coordinate (2)
    npm run check:data                        # the committed map against the app's own rules: problems stop a publish, warnings are for the owner (scripts/check-map-data.mjs)
    npm run build                             # also checks import boundaries, that no editor code reaches /, and the installable app's files
    node scripts/pw/scale-test.mjs            # 5: / with 1,000 directions and 500 hotspots made from today's map, no tiles — the first line on the screen within 30 s, the main thread busy under 20 s; prints where the opening went
    node scripts/pw/pwa-test.mjs              # 41: the installable app, against the build in its own `vite preview` on :4173 — manifest, worker, offline, slow network, update

**On GitHub, every push runs these** (`.github/workflows/ci.yml`): one job builds
and runs gate, visitor, phone and pwa; a second runs the drawing suites one at a
time, with one retry after a minute for the shared router. A red check on a
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
data (five checks per hotspot); a check the data cannot support prints `SKIP`.
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
