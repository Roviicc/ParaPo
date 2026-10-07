# ParaPo

Ground-truthed jeepney routes for Metro Manila, on a map anyone can open.

- **The map:** https://parapo.villaralvorovic2.workers.dev — on an Android
  phone, Chrome offers to install it as **Para Po**; it then opens full screen
  and keeps working without a signal, showing the routes it last saw. It is
  `main`, and changes only when a release is merged.
- **Staging:** https://staging-parapo.villaralvorovic2.workers.dev — the
  `staging` branch, each piece of work there as soon as its checks pass,
  before it is merged. For looking: its `/studio/` edits the same database
  as the live one, so routes are edited on the live studio only. Every other
  branch gets a link of its own, `https://<branch>-parapo.villaralvorovic2.workers.dev`,
  kept out of search engines as staging is.
- **How it is built, and what comes next:** [PLAN.md](PLAN.md). The words the
  app, the plan and the owner use: [CONTEXT.md](CONTEXT.md). Decisions and
  research: [docs/](docs/).

## Two pages, one file

**`/` is the public map.** It never asks the database: it reads the published
map, `public/data/index.v4.json` — every route and hotspot, the train lines
and the ferry with their stations, each line as an overview — and a direction's full line from `public/data/lines/` when it is
lit, all published from the live tables and committed here, and draws every direction of every route, the hotspots (terminals and
hintuans, where people board), and where a direction passes a hintuan its
line turns orange for that stretch. A tap on a line or a box opens a card; a
tap where several things meet opens a chooser. "Where am I" shows the
visitor as a small walking figure, flying at jeep speed, over a halo the
size of the fix's accuracy; the position never leaves the phone. It installs
as an app and keeps the last file it saw, so it works offline.

**`/studio/` is the editor**, for the owner and the accounts on the editor
list. It reads the live tables, draws lines snapped to the road with OSRM,
traces hotspot boxes, and saves. The database's row-level security refuses
every write from anyone else, so the publishable key in `.env.production`
is public by design.

Nothing from `src/app/studio/` or `src/features/studio/` reaches the public page: `npm run build` checks
the import boundaries and the built page, and fails if the editor or the
database's address ever gets in.

## Running it

    npm install
    npm run dev                     # http://localhost:5173 and /studio/
    npm run dev:phone               # the same, and on the home Wi-Fi too

`dev:phone` lets a phone on the same Wi-Fi open the dev server at
`http://<this computer's address>:5173` and see each edit as it is saved.
Only on a network you trust: it answers anyone on it. Over plain http a
phone's browser refuses its position and the offline app, so "Where am I"
and installing are tried on staging instead.

The editor needs the project's address and publishable key in `.env.local`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); the public map needs
nothing. `/studio/?e2e=1` skips the sign-in door in development builds, for
the headless checks — drawing works, saving still needs an account.

    npm run check                   # formatting, build with its guards, then the unit checks
    npm run format                  # Prettier over the tree (.prettierrc); blame skips the format commit
                                    # once per clone: git config blame.ignoreRevsFile .git-blame-ignore-revs
    node tests/e2e/visitor-test.mjs # and the other headless suites, see tests/e2e/README.md
    npm run check:data              # the committed map against the app's own rules
    npm run storybook               # the cards, the chooser, the panels, on their own

**Every push runs on GitHub** (`.github/workflows/ci.yml`): the build, the
unit checks, and the headless suites against the dev server — the public map
on a laptop and on a phone, the installable app, the map with 5,000
directions, and the editor's drawing tools. A red check means the push
broke something; the failing suite's screenshots are the run's artifact.

## Publishing the map

The file is published from `main`, every night at 04:00 Manila and on "Run
workflow" (`.github/workflows/publish-map.yml`). `scripts/publish/publish-map.mjs`
reads the public tables, keeps each line within half a metre of what was
drawn and rounds to 6 decimals — the app's own rules, imported from `src/`
— refuses a map that suddenly shrank, and writes the same bytes for the
same data, so a quiet night commits nothing.
`scripts/checks/check-map-data.mjs` then reads the file back against the app's own
rules: a link to a hotspot that is not there stops the publish; a line that
ends far from its terminal, or a hintuan it passes without being linked to,
goes out with the map and is written up. One issue, **"The map needs a
look"**, is opened or brought up to date by a run that failed or published
with warnings, and closed by the first run with nothing to report.

## Where things are

| | |
| --- | --- |
| `src/app/` | the two front doors, wiring only: `public-map/` (the public map's entry, its shell and status bar) and `studio/` (the editor's entry and shell) |
| `src/features/routes/` | the core both apps draw: `model/` (routes, stops, places, timelines, rides, fares, liveries — no React, no MapLibre), `geo/` (the pass and babaan-side rules), `map/` (the map view with its basemap and layers, the route and hotspot layers and hooks), `cards/` (the cards, sheets and timelines, with their stories; `use-card-stack`, which card is up, and `use-card-camera`, the camera with them). Imported through its concern folders; it has no `index.ts` on purpose, since Node runs the publish and the unit checks against its files |
| `src/features/locator/` | "Where am I": the visitor's dot, its button and its moods |
| `src/features/published-map/` | the published map's reader (`map-file.ts`), its freshness and the installed app's updates (`pwa.ts`), and the notices |
| `src/features/studio/` | the editor: `auth/` (sign-in, passwords, the session), `data/` (the Supabase client, reads and writes), `drawing/` (drawing, snapping, borrowing), `panels/` (save, hotspot, the card's actions). Its `index.ts`, like the locator's and the published map's, is what the shells import |
| `src/shared/` | what knows no feature: `ui/` (the bottom sheet, its gesture, the icons), `hooks/` (dialog focus, escape, a child's turn), `utils/` (coordinate maths) |
| `src/styles/` | `global.css`, the one stylesheet: Tailwind, then the design system's tokens and fonts |
| `src/design-system/` | the tokens, fonts and primitives (foundation ← primitives) |
| `public/data/` | the published map, every version kept in history: `index.v4.json` (what the app reads), a line per direction in `lines/` (with its orange stretches, worked out as it is published), and for apps not yet updated `index.v3.json` (without the ferry), `index.json` and the older single file `map.json` (without any line) |
| `supabase/migrations/` | the schema and its policies, in order |
| `scripts/` | tools: the build guards and the data check (`checks/`), the publish (`publish/`), Node's TypeScript hook (`node/`), the research screenshots and the cheap-phone timer, `phone-speed.mjs` with its parts (`research/`), the icons' lossless PNG recompressor, `recompress-png.mjs` (`assets/`) |
| `tests/unit/` | the unit checks, Node's own test runner (`npm run test:unit`) |
| `tests/e2e/` | the headless suites, and their README |

## Data and licence

**The code** is under the [MIT licence](LICENSE): use it for anything, keep
the copyright notice.

**The route and hotspot data** — `public/data/`, and the database it
is published from — is under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
(ODbL). You may copy, use and adapt it, including commercially, as long as
you:

1. **Credit it:** "Route data © ParaPo contributors, ODbL", and OpenStreetMap
   for the roads it follows.
2. **Share alike:** if you publish an adapted version of the data, publish it
   under the ODbL too.
3. **Keep it open:** do not wrap it in technical restrictions that stop
   others doing the same.

The route lines follow OpenStreetMap's road network (snapped with OSRM), so
the data is a derivative of OpenStreetMap, © OpenStreetMap contributors, also
under the ODbL. The map tiles come from OpenFreeMap, built from the same data.

Every published version of the map file is kept in this repository's history,
so what is published stays public.
