# ParaPo — the clean-up, staged

2026-09-29. Companion to `review-2026-09-29.md` (the findings, numbered as
referenced below). Written so that the work can run unattended: every
decision the review left open is taken here, every stage has a gate that
decides for itself, and wherever the work stops, `staging` is green and
releasable.

## How the work runs

**Branches and merging.** Each stage is one branch from `staging`,
`cleanup/NN-<name>`, one pull request into `staging`, merged with a merge
commit (as the repository does) once CI is green — and only then. The next
stage branches from the new `staging`. `main` is never touched: releases stay
the owner's, as a PR from `staging` when he chooses.

**The gate, every stage.** Before a push: `npm run check` (boundaries, `tsc`,
the build with its guards, the unit tests) and `npm run build-storybook`.
After the push: CI's two jobs — the public suites and the studio's drawing
suites against the live tables and the public router. A stage merges only
with both green on its last commit. Nothing is skipped, disabled or
quarantined to get there.

**When a stage will not go green.** Three CI cycles at most. A failure that
is the stage's own is fixed and pushed; one that is not (the shared router
refusing, a runner lost) gets the one re-run CI already does. If it is still
red after three cycles, the PR is left open with a comment saying what is
red and why, the branch stays, and the work moves to the next stage that
does not depend on it. Nothing half-done reaches `staging`.

**Where the state lives.** The review and this plan are in `docs/`
(committed 2026-09-29, with `scripts/pw/studio-standin.mjs`, the harness the
review drove the save flows with). Each stage's PR body says what changed
and what the counts were, and each stage appends a dated entry to PLAN.md in
the house style, so a fresh session — or a context reset mid-night — loses
nothing: the next step is always readable from the repository. A session
picking this up starts by reading both documents, then `git log` for the
stages already merged (their PR titles begin "Stage N —").

**What the work never does.** Change what a visitor or the owner sees (a
redesign is the owner's, in Figma); add a feature before stage 11; write to
the live database (stage 8 needs one additive migration and waits for the
owner's word); rewrite history on any branch; release to `main`.

**What a cloud session may not be able to do.** The environment the review
ran in denied `smzwbqxttdyvohuizynl.supabase.co`, `tiles.openfreemap.org`
and `router.project-osrm.org`, so the drawing suites ran only in CI; that is
the gate anyway. If the session's environment allows those hosts, each stage
also runs them locally before pushing, which saves CI cycles. Playwright in
such a session may need `executablePath` pointed at the preinstalled
Chromium; the suites themselves are not changed for that.

## Decisions taken, so no question is left

- `tests/` sits beside `scripts/` (unit and e2e are tests; guards and the
  publish are tools). `scripts/pw/` becomes `tests/e2e/`.
- `RouteSheet`, `StopTimeline`, `Departures`, `RouteTripDetail`,
  `babaanSides`, `liveryLine` stay in `shared/` through the redesign.
- Folders inside `shared/` and `studio/` only; `commuter/` stays flat.
- No module is renamed, only moved; the draft contract (`parapo.draft.v1`),
  the `draw-*`/`saved-*` source ids and the `save-*` test ids never change.
- The design-system stage is lossless: a raw value is replaced only by a
  token with the identical value; anything without one is listed for the
  owner, not changed.
- The public map keeps publishing `map.json` for one release after the new
  files exist, so an installed app that has not updated still loads.
- The fonts are subset once, here, and the results committed beside the
  sources with the command that made them; no Python enters the build.

## The stages

### Stage 1 — Guards first (findings 1, 17, 8, 12 and the one-liners)
- `publish-map.yml`: `defaults: run: shell: bash` (pipefail), `timeout-minutes: 15`.
- `check-map-data.mjs`: the file argument without `--markdown`.
- `.storybook/main.ts`: the story glob.
- `ci.yml`: `push: branches: [main, staging]` (a PR branch runs once, not twice).
- `package.json`: `test` script, `engines`, `@types/node` for Node 22; the
  `ts-resolve` hook on `test:reader`/`test:mapfile`.
- A PLAN.md entry pointing at `docs/review-2026-09-29.md` and this plan.
- Done when: CI green. No throwaway run of the publish workflow is needed —
  the `pipefail` change is GitHub's documented behaviour for `shell: bash`;
  the workflow comment at `:71-73` is corrected to match.

### Stage 2 — Tests and tooling in their places (section 5 of the review)
- `scripts/{checks,publish,node,research}`; `tests/unit`, `tests/e2e`.
- One `node --test 'tests/unit/*-test.mjs'` with the TypeScript hook replaces
  the eleven npm scripts; the `timeline-test` CWD paths and mid-file imports;
  the two `check(…, true)` and the always-true condition in `hotspot-test`.
- Delete `scripts/uitest.mjs`, `scripts/realshot.mjs`, `.gitignore:16`.
- Every reference the review listed: `package.json`, both workflows, README,
  the suites' README, the three `.claude` files, `vite.config.ts` comments,
  `public/.assetsignore`, the relative paths inside moved files.
- Done when: `npm run check` and every suite green with the same counts as
  before the move (counts recorded in the PR body).

### Stage 3 — The source tree (section 5)
- `shared/{model,geo,map,cards,styles}`, `studio/{auth,data,drawing,panels}`;
  `supabase.ts` → `studio/data`, `mapFile.ts` → `commuter`; the `.walker*`
  and `.ride-dot` rules out of `index.css` into files beside their owners.
- Pure `git mv` plus import paths; nothing else in the PR, so the diff reads
  as paths. `check-boundaries.mjs` needs no change (it reads the area name);
  `check-build.mjs`'s positive controls still find `src/studio/`.
- README's "Where things are", the `.claude` files, the ds-reviewer rule
  text (finding 11).
- Done when: `tsc`, boundaries, build guards, Storybook build, all suites
  green, same counts.

### Stage 4 — The studio's correctness (findings 2, 3, 4, 6, 7, 8, 9, 12, 13, 15, 16, the duplicate key)
- Each fix as its own commit with the finding's number, so a bisect reads.
- A new suite, `tests/e2e/save-test.mjs`, grown from
  `scripts/pw/studio-standin.mjs` (the stand-in database and the faked
  session the review used; it becomes the suite): save a route; the
  return-trip toast only while a slot exists; edit a direction; delete →
  slot, redraw after delete; hotspot save and its links; the link sync's
  request stays short with 500 hintuans; keys alive after signing in from
  Done; a failed link sync leaves a retry that updates, not inserts.
- Done when: the new suite and every old one green; the suite added to
  `ci.yml`'s studio job (it needs no account and no router).

### Stage 5 — The public map's correctness (findings 5, 10, 11 and the traced ones from 3c)
- The too-new banner's Reload through `reloadToUpdate`; one `metresPerPixel`
  (the halo) and `where-test` updated with it; the GPS error state; app
  camera moves pausing "Where am I"'s follow; safe-area insets on the two
  round buttons; `useMapAge` after "Try again"; `key={stop.id}` on the
  hotspot card; the dialog's name and focus.
- Done when: visitor, phone, where, scale and pwa suites green.

### Stage 6 — Lighter (section 8)
- Fonts subset to Latin, three weights, precached; `maxBounds` on the map;
  the shared chunk named. A size guard in `check-build.mjs`: fonts under
  120 kB in total, the shared chunk under 400 kB gzipped, so it cannot creep.
- Done when: `pwa-test` (offline, update) green; the PR body carries the
  before/after table.

### Stage 7 — The public map's data shape (section 8, shape A)
- The publish writes `data/index.json` (routes, ends, names, hotspots,
  links, an overview line per direction at 5 m and 5 decimals, the orange
  stretches) and `data/lines/<direction>.json` (the full line), and still
  `data/map.json` for one release. Schema version bumped; byte-identical
  output for unchanged data kept.
- The client: `mapFile` reads the index; `useSavedRoutes` draws the
  overview; a direction's full line is fetched when it is lit or opened,
  and the stretches, chevrons, ride-cut and babaan sides use it; the worker
  runtime-caches `data/lines/*`.
- The suites read the index instead of `map.json`; `scale-test`'s budgets
  tightened to what this achieves (first line within 5 s at 1,000 on a
  runner).
- Done when: every public suite green at the new budgets; `check-map-data`
  reads the new files; the too-new banner path exercised once by hand in
  `pwa-test`.

### Stage 8 — The studio's data shape (needs the owner's word)
- Migration `0009_overview.sql`: `route_variant.overview jsonb`; the save
  writes it; a script backfills existing rows; the list selects it instead
  of `shape`; `withDrawing` unchanged. `studio-scale-test` budgets tightened.
- Applied to the live project only with the owner's explicit yes — given
  2026-09-29 ("Yes, apply it"): a nullable column, additive, reversible.
  The session applying it needs the Supabase connector (or the CLI) for the
  live project.

### Stage 9 — The design system, scalable and lossless (section 6.5, the UI pass)
- Every hex or Tailwind palette value in visitor-facing UI that has a token
  of the identical value moves to the token; the rest listed in the PR for
  the owner. The two round map buttons on `IconButton`; one `Toast`; one
  `useEscape`; one `layers.ts` of ids with a readiness guard (the hook-order
  contract made explicit); the map colours all under `mapColours.ts` and its
  test; the missing stories (`RouteCardHeader`, `WhereAmI`'s states).
- The ds-reviewer agent runs on each touched component and must PASS.
- Done when: suites green (they check colours), Storybook builds, ds-reviewer
  PASS.

### Stage 10 — The big files (section 6.7)
- One file per PR, in this order: `useDrawing.ts`, `StudioApp.tsx`,
  `SavePanel.tsx`, `snap.ts`, `CommuterApp.tsx`, `geo.ts`, `routes.ts`,
  `stops.ts`, `useSavedRoutes.ts`/`useSavedStops.ts`, `directionArrows.ts`,
  `RouteTripDetail.tsx`. Also the duplicates with several answers (6.5):
  one metres-per-degree, one point-to-segment, one travel-order rule, the
  publish importing `src/shared` instead of re-implementing it.
- Done when: each PR's suites green with the same counts; unit tests added
  for what becomes pure (`places.ts`, `chevrons.ts`, `uturns.ts`).

### Stage 11 — The owner's ask: a saved route's facts can be changed
- Today: with a route in hand, the save panel locks Head, Tail, Via,
  Signboard, Mode and Fare note, and the save ignores them
  (`routesWrite.ts:9-11`). "Phase 1 – Novaliches" cannot become
  "Bagong Silang Kanan 5 – Novaliches" without deleting the route.
- The change: Edit route unlocks those six fields; saving writes the
  `route` row (both directions share it, and the panel says so); the names
  regenerate from the new ends; a collision with another route's ends is
  refused with a plain sentence. Terminal links are left as they are (they
  are the owner's, set on the hotspot). Covered in `save-test.mjs`.
- No other feature. Anything else the owner names goes on a list for after.

### Stage 12 — The suites' shared helpers (section 6.2)
- `tests/e2e/lib/` (harness, studio, looks, geo, big-map, profile); each
  suite keeps its scenario. Mechanical extraction of identical code only;
  PASS/SKIP counts compared suite by suite before and after.
- Last on purpose: the net is refactored only after everything it guards is
  in place.

## What a night can hold

CI is 15 minutes for the public job and up to 40 for the studio job, once
per push after stage 1. Stages 1–6 are one night; 7–9 a second; 10–12 a
third. Every stage is a stopping point.

## What needs the owner's yes, once, before the first push

1. Branches `cleanup/*` and PRs into `staging`, merged by me when green.
2. Stage 8's migration on the live project — given: yes, 2026-09-29.
3. Optional: the three hosts allowed in this environment's network settings,
   so the drawing suites can run here before each push.

Given 1 (and 2 or its deferral), nothing else is asked until the work is
done or a stage is stuck, which is reported on its PR.
