# ParaPo

Ground-truthed jeepney routes for Metro Manila, on a map anyone can open.

- **The map:** https://parapo.villaralvorovic2.workers.dev — on an Android
  phone, Chrome offers to install it as **Para Po**; it then opens full screen
  and keeps working without a signal, showing the routes it last saw.
- **How it is built, and what comes next:** [PLAN.md](PLAN.md). The words the
  app, the plan and the owner use: [CONTEXT.md](CONTEXT.md). Decisions and
  research: [docs/](docs/).

## Two pages, one file

**`/` is the public map.** It never asks the database: it reads one file,
`public/data/map.json`, published from the live tables and committed here,
and draws every direction of every route, the hotspots (terminals and
hintuans, where people board), and where a direction passes a hintuan its
line turns orange for that stretch. A tap on a line or a box opens a card; a
tap where several things meet opens a chooser. It installs as an app and
keeps the last file it saw, so it works offline.

**`/studio/` is the editor**, for the owner and the accounts on the editor
list. It reads the live tables, draws lines snapped to the road with OSRM,
traces hotspot boxes, and saves. The database's row-level security refuses
every write from anyone else, so the publishable key in `.env.production`
is public by design.

Nothing from `src/studio/` reaches the public page: `npm run build` checks
the import boundaries and the built page, and fails if the editor or the
database's address ever gets in.

## Running it

    npm install
    npm run dev                     # http://localhost:5173 and /studio/

The editor needs the project's address and publishable key in `.env.local`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); the public map needs
nothing. `/studio/?e2e=1` skips the sign-in door in development builds, for
the headless checks — drawing works, saving still needs an account.

    npm run check                   # build with its guards, then the unit checks
    node scripts/pw/visitor-test.mjs # and the other headless suites, see scripts/pw/README.md
    npm run check:data              # the committed map against the app's own rules
    npm run storybook               # the cards, the chooser, the panels, on their own

**Every push runs on GitHub** (`.github/workflows/ci.yml`): the build, the
unit checks, and the headless suites against the dev server — the public map
on a laptop and on a phone, the installable app, the map with 1,000
directions, and the editor's drawing tools. A red check means the push
broke something; the failing suite's screenshots are the run's artifact.

## Publishing the map

The file is published from `main`, every night at 04:00 Manila and on "Run
workflow" (`.github/workflows/publish-map.yml`). `scripts/publish-map.mjs`
reads the public tables, keeps each line within half a metre of what was
drawn, rounds to 6 decimals, refuses a map that suddenly shrank, and writes
the same bytes for the same data, so a quiet night commits nothing.
`scripts/check-map-data.mjs` then reads the file back against the app's own
rules: a link to a hotspot that is not there stops the publish; a line that
ends far from its terminal, or a hintuan it passes without being linked to,
goes out with the map and is written up. One issue, **"The map needs a
look"**, is opened or brought up to date by a run that failed or published
with warnings, and closed by the first run with nothing to report.

## Where things are

| | |
| --- | --- |
| `src/commuter/` | the public map's shell and its service worker |
| `src/studio/` | the editor: sign-in, drawing, snapping, saving, the panels |
| `src/shared/` | what both draw: the map, the routes and hotspots hooks, the cards, the geometry |
| `public/data/map.json` | the published map, every version kept in history |
| `supabase/migrations/` | the schema and its policies, in order |
| `scripts/` | the publish, the data check, the build guards, the unit checks |
| `scripts/pw/` | the headless suites, and their README |

## Data and licence

**The code** is under the [MIT licence](LICENSE): use it for anything, keep
the copyright notice.

**The route and hotspot data** — `public/data/map.json`, and the database it
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
