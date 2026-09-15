# Headless checks (Playwright)

Drive the dev server in headless Chromium and check that both pages behave: the
public map at `/` and the editor at `/studio/`. Complements `scripts/uitest.mjs`
(raw DevTools, Windows Chrome), and runs anywhere Playwright's Chromium does.

    npm i -D playwright && npx playwright install chromium   # once
    npm run dev                                              # in another terminal, on :5173
    node scripts/pw/gate-test.mjs             # 15: the studio's sign-in door, ?e2e=1, the reset-link forwarder
    node scripts/pw/visitor-test.mjs          # 37 today: the public map — no editor, no database, cards, chips, click priority
    node scripts/pw/phone-test.mjs            # 43 (42 run, 1 SKIP today): / at 390×844 — the bottom sheet, the ±20 px tap, the chooser, ?r=
    node scripts/pw/regression-gestures.mjs   # 29: route and hotspot gestures on /studio/?e2e=1
    node scripts/pw/hotspot-test.mjs          # 22: hotspot tracing, draft reload, a routed segment on /studio/?e2e=1
    node scripts/pw/snap-test.mjs             # 20: far clicks go freehand, U-turns at joins shown not changed, street names
    node scripts/uitest.mjs                   # 26: route gestures through Windows Chrome's DevTools protocol

    npm run build                             # also checks import boundaries, and that no editor code reaches /

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
