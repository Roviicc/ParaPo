# Headless checks (Playwright)

Drive the dev server in headless Chromium and assert routes and hotspots behave.
Complements `scripts/uitest.mjs` (raw DevTools, Windows Chrome) with the M6 hotspot
checks, and runs anywhere Playwright's Chromium does.

    npm i -D playwright && npx playwright install chromium   # once
    npm run dev                                              # in another terminal, on :5173
    node scripts/pw/regression-gestures.mjs   # 27: route gestures (ported from uitest.mjs) + hotspot gestures
    node scripts/pw/hotspot-test.mjs          # 21: hotspot tracing, draft reload, route regression
    node scripts/pw/visitor-test.mjs          # 17: saved hotspots visible, tap cards, chips, click priority
    node scripts/pw/gate-test.mjs             #  2: signed-out Done asks to sign in

Each prints PASS/FAIL lines and exits non-zero on any failure. Screenshots land
in the current directory. `PARAPO_NODE_FETCH=1` routes the browser's https
traffic through Node — only for sandboxes where the browser has no network.
