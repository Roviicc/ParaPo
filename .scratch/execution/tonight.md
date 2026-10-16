# Tonight's run (2026-10-15, overnight)

The owner's calls before sleeping: **small fixes** and **ride start and end**, **one pull request per change**, stacked. Not tonight: the commuter rename, the driver app, the studio maps, train tracking.

**Nothing merges and nothing goes live.** The PRs target `staging`, as the repo's feature PRs do; the owner merges them and releases `staging` to `main`, which is what Cloudflare deploys. No database and no Figma changes tonight.

**Another session's PRs may merge into `staging` tonight** (the owner, 2026-10-15; #161, the map designs, is open). When one does, `staging` is merged into the stack's first branch and down the stack, conflicts resolved, checks run again.

## The stack, in merge order

Each branch starts from the one before it, so the PRs merge top to bottom. The first starts from `staging`.

| # | Branch | Change | Spec |
| --- | --- | --- | --- |
| 0 | `claude/plans` | The plans in `.scratch/` | `README.md` |
| 1 | `claude/figma-names` | RouteTripDetail → TimelineRouteDetailCard, TripTimeline → TimelineRouteDetail | `small-fixes` 3 |
| 2 | `claude/distance-tile` | "Kilometer" → "Distance" | `small-fixes` 1 |
| 3 | `claude/train-bound-words` | Trains say Northbound / Southbound (Eastbound / Westbound on LRT-2) | `small-fixes` 4 |
| 4 | `claude/jeep-switch-keeps-pick` | Papunta / Pabalik keeps a jeep's picked hintuan | `small-fixes` 2 |
| 5 | `claude/fold-says-stations` | "N more stations" on trains | `ride-start-and-end`, Decided |
| 6 | `claude/button-primary-small` | The Button primitive gains Primary Small | `ride-start-and-end`, Decided |
| 7 | `claude/ride-pill` | RouteTripLineDetailPill: code and pesos as two halves | `ride-start-and-end`, Decided |
| 8 | `claude/timeline-rail-pieces` | The rail's MiddleTop, MiddleBottom and Disconnected pieces | `ride-start-and-end`, The rail |
| 9 | `claude/ride-start-and-end` | Set as start, an end before the start on the same card, trains reset on SWITCH (a draft PR) | `ride-start-and-end` |

Renames go first so every later change lands in the renamed files. The biggest change goes last, so the small ones are done whatever happens to it.

## Every change, before its push

- `npm run check`: Prettier, lint, the build with `check-build.mjs`, and the unit tests.
- The headless suites the change touches (`phone-test`, `visitor-test`, `where-test`, the studio's), against `npm run dev`. On this machine they run with a preload that points Playwright at the installed Chromium (kept outside the repo).
- For a component (6 to 9): its stories built and screenshotted with Playwright and looked at, and a `ds-reviewer` pass until it says PASS (`.claude/skills/ds-component`).
- The diff read once more for anything CI would reject.

## Where the ds-component skill would stop and ask

It asks the owner twice per component: before coding, and after the reviewer's findings. The owner is asleep, so each component's PR carries both: the props, variants and states built, in Figma's names, and what the reviewer found and what was done about it.

## If something needs the owner

That change stops at what's done, says why in its PR, and the run goes on to the next change that doesn't depend on it. Nothing is guessed into a design.

## In the morning

A report at the end of this file: every PR in merge order, its checks, and anything waiting on the owner.

## The morning report (2026-10-16)

Every change in scope is up as a pull request. Nothing has merged: `staging` and `main` are as you left them (`staging` at 4852d03, #168). Three of the changes were built by parallel sessions (#166, #170, #172); the last one (#173) is a draft that brings them together.

### Merge order

Merge top to bottom. Each PR's base is the branch above it, so after each merge either let GitHub delete the merged branch (it then moves the next PR's base on to `staging`) or edit the next PR's base to `staging` by hand.

| # | PR | Branch | What it does | CI on its head |
| --- | --- | --- | --- | --- |
| 0 | #162 | `claude/plans` | The plans in `.scratch/`, this report among them | green (docs only: the suites skip) |
| 1 | #163 | `claude/figma-names` | RouteTripDetail → TimelineRouteDetailCard, TripTimeline → TimelineRouteDetail | green, every suite |
| 2 | #164 | `claude/distance-tile` | "Kilometer" → "Distance" | green, every suite |
| 3 | #167 | `claude/train-bound-words` | SWITCH says Northbound / Southbound on the LRT-1 and MRT-3, Eastbound / Westbound on the LRT-2 | green, every suite |
| 4 | #169 | `claude/jeep-switch-keeps-pick` | Papunta / Pabalik keeps a jeep's picked hintuan; trains reset | green, every suite |
| 5 | #171 | `claude/fold-says-stations` | "N more stations" on trains | green, every suite |
| 6 | #166 | `claude/button-primary-small` | The Button gains Primary Small (base: `claude/plans`) | green, every suite |
| 7 | #170 | `claude/ride-pill` | RouteTripLineDetailPill: the code and the pesos as two halves (base: `claude/figma-names`) | green, after the branch took in #168's fix for the GL-program flake in visitor-test part 1 |
| 8 | #172 | `claude/timeline-rail-pieces` | TimelineStick's pieces; the rail runs only along the ride (base: `claude/figma-names`) | green, every suite |
| 9 | #173 | `claude/ride-start-and-end` | **Draft.** Set as start, × Remove as start, an end before the start ridden the other way, trains reset and jeeps keep the start on SWITCH | green on 3993866. On f5cb733 everything had passed but one visitor-test check, whose reader still took the map's pale stretches as one line per feature: that reader is fixed |

#166, #170 and #172 don't depend on each other or on 2–5: merge them any time after #163 (#166 after #162). #173 already contains all of them, so merging it last brings nothing new in twice.

### Waiting on you

Collected from the PRs; each PR says more.

- **#173, the ride's start (draft):** ten questions in its "For the owner", the main ones:
  - Set as start's colour: Figma's instance fills it with the card's surface; the code draws the set's Primary Small in brand blue (#166 asks the same).
  - The pill on the start row: shown only while no end is picked (Variant3); Variant4 and Variant5 draw one on both rows.
  - The map's start label has no Figma frame: a stand-in, End's look with the S.
  - SWITCH on a jeep with a start and an end keeps each in place, so the way back serves the ride the other way round. Swapping them is one line.
  - Letting a ride go opens the whole list (so nothing folds under the finger).
  - Set as start is 32 px tall; the rules ask for 44 px touch targets.
- **#170, the pill:** on trains the code keeps the line's Timeline/surface colour; should it be the line's surface?
- **#172, the rail:** what Top should draw when the ride's end is folded away. With #173 this can't happen any more (a picked row is in the ride and never folds).
- **#166, the button:** `shadow-primary-button-rest` has drifted from Figma (0.4 alphas against 0.24 and 0.32): a `/sync-tokens` job.
- **#169 and #173, the ferry:** it keeps its picks over SWITCH, as jeeps do. The rule named trains only.
- **#171, the ferry's fold** still reads "hintuans".
- **Figma, untouched tonight as agreed:** the Distance tile still reads "Kilometer" (3778:3183); the first card frames still say "Student fare".

### Not tonight, as agreed

The commuter rename, the driver app, the studio maps and train tracking. Their specs are in `.scratch/`.
