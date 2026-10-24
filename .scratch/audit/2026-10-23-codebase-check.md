# Codebase check, 2026-10-23

- **Started:** 2026-10-23 15:55 UTC. Time-boxed to 90 minutes. Read-only: no code or database was changed.
- **Branch:** `staging` @ `ed119bc`. Open PRs #133, #343, #362 and #363 are treated as in flight and left out.
- **`npm ci`:** passed.
- **`npm run check`:** passed. That covers format, lint, the architecture page, the build with its guards, and 1032 of 1032 unit checks.
- **Watch items from the build output:**
  - The public page's core bundle is **409.5 kB of a 410 kB budget** (see M3).
  - The committed map has 15 data warnings (see M4).

How to read each finding:
- **Size:** S is under an hour, M is a day or less, L is more than a day.
- **Who:** the person who would hit the problem.

---

## Critical

### C1. The consent screen says nothing is sent, but every saved recording is uploaded
- **Where:**
  - `src/features/contribute/consent-panel.tsx:31`
  - `src/features/contribute/use-uploads.ts:218-222`
- **Who:** every contributor.
- **What goes wrong:**
  - The consent screen reads: *"The recording stays on this phone for now. Nothing is sent anywhere."*
  - Production has uploads on (`.env.production`, `VITE_CONTRIBUTIONS=1`). As soon as a recording is saved, or the page is opened, `useUploads` sends every recording not yet tried.
  - It never checks whether consent was given. Recordings saved earlier under this text get sent too.
  - ADR 0004 promises a consent screen that says what is recorded, what it is for (including machine learning), who sees it and how long it is kept. This screen says none of that.
- **Evidence:** the quoted line, and the effect at `use-uploads.ts:218` that calls `send(recording)` for every `upload === undefined`. It stamps `CONSENT_VERSION = 1` on each upload (`use-consent.ts:6`).
- **Fix:**
  - Ship the spec's consent text (`.scratch/contribute/spec.md`, Consent) as consent version 2.
  - Upload only while version 2 consent is held.
  - Ask before sending recordings saved under version 1.
  - Until then, consider turning `VITE_CONTRIBUTIONS` off.
- **Size:** S for the code. The wording is the owner's.

## High

### H1. Two editors can silently overwrite each other's work
- **Where:** `src/features/studio/data/draft-save.ts:505-507`, `:403-405`, `:517-519` and `:555-576`.
- **Who:** editors.
- **What goes wrong:**
  - A save re-reads the stored draft **when Save is pressed**, not when the panel was opened. It then writes the form over it.
  - Example:
    1. Editor A opens a direction.
    2. Editor B saves a new line for it.
    3. A presses Save. B's line is gone, with no message.
  - The same happens to hotspot names and notes, and to a Delete pressed on an out-of-date card.
  - If an approval lands while A has the panel open, A's save quietly undoes it.
  - The message "Someone else changed this draft since you opened it" (`:592`) promises a check that never happens.
- **Fix:** record the draft's id and revision when the panel opens, pass them to the save, and refuse when they no longer match.
- **Size:** M.

### H2. CI's builds use the real Turnstile key and real uploads, which explains the flaky Turnstile errors
- **Where:**
  - `.github/workflows/ci.yml:178-196` and the matching blocks at `:256-276` and `:318-325`
  - `tests/e2e/contribute-offline-test.mjs:101` and `:234-236`
- **Who:** every PR's CI, and the production database.
- **What goes wrong:**
  - CI writes the test key and its flags into `.env.local`.
  - `npm run build` also loads `.env.production`, and Vite lets `.env.production` win over `.env.local`. So the build that `pwa-test` and `contribute-offline-test` run against has the **real** Turnstile key and uploads **on**.
  - In the offline test, after Save the page loads Cloudflare's real script on `localhost`, which Cloudflare refuses. The test's `pageerror` listener catches what it throws.
  - The test also fast-forwards the clock, so whether that error lands before the reload is a race. That matches "now and then".
  - The same build also reaches the production Supabase project from a test.
- **Fix:**
  - Write the overrides to `.env.production.local`, or pass them on the command line.
  - Call `fakeTurnstile(context)` in that test and stub `*.supabase.co`.
- **Size:** S.

### H3. One new value in the data can blank the map for every installed app, and "Try again" can't fix it
- **Where:**
  - `src/features/routes/model/direction-schema.ts:17-27` (closed list of modes; `confidence` and hotspot `kind` are closed too)
  - `src/features/routes/published/fetch-index.ts:153`
- **Who:** commuters using the installed app.
- **What goes wrong:**
  - Say the studio gains a new mode, or a new hotspot kind, and a publish ships it.
  - The publish checks it with the new code, so it passes.
  - Every phone still on the old app refuses the **whole** index ("a row this app cannot read") and shows an empty map.
  - The banner offers "Try again", which reads the same file again. It should offer "Reload newer".
- **Fix:**
  - Read unknown values leniently (drop the row, or fall back to a default), or treat such a refusal as "too new".
  - Add "a new enum value is a new shape" to the rules in `map-file.ts`.
- **Size:** S.

### H4. A place passed twice: tapping its first row rides to its second (latent)
- **Where:**
  - `src/features/routes/model/ride.ts:92-104` (`rideCut` takes the **last** box sharing the place's name)
  - `ride.ts:222-223`
- **Who:** commuters, once a route doubles back past a place with the same name. None of today's 27 directions does.
- **What goes wrong:** tap the first "Palengke" row. The pin, the ride, the fare and the dot all land at the second Palengke, 3 km further on. The two rows' dots are drawn on top of each other.
- **Evidence:** the reviewer reproduced it with a fixture: `rideCut(…, 'p1')` returned `endHotspotId: 'p2'` at 4447 m.
- **Fix:** cut only to the row's own boxes, not every box that shares the name.
- **Size:** M.

### H5. Why `save-test` brushes its 25-minute timeout
- **Where:** `tests/e2e/save-test.mjs`. It is one serial script of 2,345 lines and 130 checks.
- **Who:** every PR that runs it.
- **What goes wrong:** fixed sleeps add up to only about 29 s. The real cost is waits that time out **silently**:
  - `px()` at `:617` waits up to 3 s for the camera, then swallows the failure. It runs on about 45 actions.
  - `idle()` at `:633` and `:2267` waits up to 15 s, also swallowed.
  - `waitFor()` at `:650` waits 5 s and returns false, 54 uses.
  - 36 full-page `innerText` reads (`body()`), some inside polling loops.
  - 8 fresh page loads against the unbundled dev server.
  
  On a slow runner, waits that should fail turn into delays instead.
- **Fix:**
  - First, print each section's time to find the real cost.
  - Make those waits fail loudly with short timeouts.
  - Add a `SAVE_PART` split, as `commuter-test` has `COMMUTER_PART`.
- **Size:** M.

## Medium

### M1. "Delete from phone" can leave a copy on the server that the contributor can no longer remove
- **Where:**
  - `src/features/contribute/use-uploads.ts:91-92`
  - `src/features/contribute/use-recording.ts:467-474`
  - `src/features/contribute/upload-status.ts:458`
- **Who:** contributors.
- **What goes wrong:**
  - Suppose an upload reached the server but the answer was lost, for example because the signal dropped.
  - The row then shows "failed", and Delete says "It has not been uploaded, so it will be gone for good".
  - The phone forgets the id, so the server copy stays, and the phone has nothing left to ask the server to delete. That conflicts with ADR 0004's "a contributor can delete their recordings".
  - The confirm dialog can also stay open while a send starts.
- **Fix:** before deleting a recording that isn't marked uploaded, also ask the server to delete it (harmless if it isn't there), and re-check "busy" when the delete is confirmed.
- **Size:** S.

### M2. A loop's trip can start from the wrong place
- **Where:** `src/features/routes/model/timeline.ts:344-349`
- **Who:** commuters on loops, when the loop passes one place at two boxes.
- **What goes wrong:**
  - The lookup from place to row keeps only the **last** row for each place.
  - So a commuter standing at the first box sees the timeline start from the other box, about 4 km away.
  - The reviewer reproduced this with the loop-test fixture: the result was `'a2'` instead of `'a'`.
- **Fix:** map each box to its own row, and prefer an exact row match, as `loopTimeline` already does.
- **Size:** S.

### M3. The public page's size budget has 0.5 kB left
- **Where:** `scripts/checks/check-build.mjs`. The build reports: "MapLibre, React and the shared code are under 410 kB gzipped together: **409.5 kB**".
- **Who:** the next PR that adds anything to the public page. Its build will fail for a reason unrelated to its change.
- **Fix:** decide now whether to trim the shared chunk (70.1 kB) or raise the budget on purpose.
- **Size:** S to decide, M to trim.

### M4. Published data: Antipolo – Cubao's line starts 6.3 km from Antipolo
- **Where:** the committed map, as reported by `check-map-data` in `npm run check`.
- **Who:** commuters. The card says "Antipolo", but the line stops 6.3 km short of it.
- **Evidence:** "Antipolo → Cubao: the line starts 6305 m from Antipolo" and "Cubao → Antipolo: the line ends 6299 m from Antipolo".
  - Twelve more lines end 300–600 m from their places (Bagong Silang Kanan 5, SM Fairview, Philcoa).
  - A stale hintuan (`0a310a0a…`) also changes the file names of 11 line files at the next publish.
- **Fix:** an editor fixes the Antipolo end, or the line, in the studio. It is a data fix, not a code fix.
- **Size:** S.

### M5. Blocking a contributor is easy to get around, and cleaning up old phones is a risky manual step
- **Where:**
  - `supabase/migrations/20261019125900_contributions.sql:28-37`
  - `supabase/migrations/20261022090000_contribution_use.sql:44-45`
- **Who:** editors and the owner.
- **What goes wrong:**
  - A block is tied to the phone's anonymous identity. Clearing the site's data gives the phone a new identity that isn't blocked. Only Turnstile and Supabase's per-IP sign-in limit slow that down.
  - The owner is told to delete, by hand each month, "anonymous users older than 30 days that never saved". No query is written down.
  - `contribution` cascades from `auth.users`, so a query that misses the "never saved" part deletes real recordings for good. Only the weekly backup would hold them.
- **Fix:**
  - Write the cleanup query into `supabase/apply/README.md`, with a dry-run count first.
  - Consider `on delete set null` for `contribution.contributor_id`.
  - Check that Supabase's anonymous sign-in rate limit is set.
- **Size:** S.

### M6. Studio drafts and outside data are read without checking their shape
- **Where:**
  - `src/features/studio/drawing/draft.ts:69` (`JSON.parse(raw) as StoredDraft`, from localStorage)
  - `src/features/studio/drawing/snap.ts:111` (the OSRM road-snapping answer, from a public server)
  - `src/features/studio/data/live.ts:219,221` (drawing columns from the database)
- **Who:** editors.
- **What goes wrong:** an old or corrupt saved draft can crash the restore, or lose the editor's drawing. An unexpected answer from OSRM can break snapping. CLAUDE.md asks for Zod at each of these boundaries.
- **Fix:** a Zod schema for each, with `safeParse`.
- **Size:** M.

### M7. A change to `turnstile.tsx` skips the contributor suites in CI
- **Where:** the `changes` job's file list in `.github/workflows/ci.yml`.
- **Who:** contributors, if a broken bot check ships.
- **What goes wrong:** `src/shared/ui/turnstile.tsx` is routed to the studio suites only. The contributor page uses it too (`src/features/contribute/upload-check.tsx:1`).
- **Fix:** move it to the default case, which runs both.
- **Size:** S.

### M8. The publish's shrink guard turns itself off if the old index can't be read
- **Where:**
  - `scripts/publish/publish-map.mjs:497-503` (any read error becomes "no previous file")
  - `scripts/publish/shrinkGuard.mjs:21`
- **Who:** commuters, but only if two things go wrong at once.
- **What goes wrong:** a corrupt index in the checkout, plus a bad database read, would publish a shrunken map with no guard.
- **Fix:** fail when the file exists but doesn't parse. Treat it as "no previous file" only when it is missing.
- **Size:** S.

### M9. Important code with no unit test
- **Who:** contributors, through bugs a unit test would catch.
- **What is missing:**
  - `src/features/contribute/use-uploads.ts`, 316 lines: the whole upload flow. It covers sending after a save, the bot check, retrying when back online, and "removed by an editor". Only the browser suite covers it, and it is where C1 and M1 live.
  - `src/features/contribute/recording-store.ts`: `updateRecording` silently drops a change when the stored row fails to parse.
  - `src/features/studio/drawing/snap.ts:107-118`: reading the OSRM answer.
- **Fix:** pull the upload rules into a pure function and test it.
- **Size:** M.

### M10. Files far over the 150-line limit
| File | Lines |
| --- | --- |
| `src/app/studio/workshop.tsx` | 542 (an app shell that should be wiring only) |
| `src/features/routes/map/map-view.tsx` | 510 |
| `src/features/studio/panels/save-panel.tsx` | 433 |
| `src/app/public-map/public-map-app.tsx` | 373 |
| `src/features/routes/cards/timeline-route-detail.tsx` | 290 |
| `src/shared/ui/bottom-sheet.tsx` | 276 |
| `src/features/routes/cards/trip-card.tsx` | 266 |

The biggest hooks:

| File | Lines |
| --- | --- |
| `src/features/studio/data/draft-save.ts` | 607 |
| `src/features/contribute/use-recording.ts` | 533 |
| `src/features/studio/drawing/use-drawing.ts` | 508 |

- **Fix:** split them one at a time, biggest first, once the open PRs touching each file have landed.
- **Size:** L in total.

### M11. The studio reads server data in effects, not TanStack Query
- **Where:**
  - `src/features/routes/map/use-saved-routes.ts:191-213`
  - `src/features/routes/map/use-saved-hotspots.ts:82`
  - `src/features/studio/panels/use-save-facts.ts:147-155` (this one swallows a failure)
  - `src/features/published-map/status.ts:37`
  
  `src/features/studio/data/supabase.ts:8-9` also reads `import.meta.env` with `as string` and no check, outside the env files CLAUDE.md allows.
- **Who:** editors, who get hand-made loading and error handling and figures that can quietly go stale.
- **Fix:** query hooks with key factories, in a refactor of its own. Move the Supabase values into `features/studio/data/env.ts` with Zod.
- **Size:** L.

## Low

- **L1. A train ride's fare can sit beside the whole line's distance.**
  - **Where:** `src/features/routes/cards/timeline-route-detail-card.tsx:135-136`. The fare tile and the distance tile switch on different conditions.
  - **Example:** ₱15 for two stations, shown beside 17.9 km.
  - **Size:** S.
- **L2. An offline installed app logs an error every hour.**
  - **Where:** `src/features/published-map/pwa.ts:37`. The update check `r.update()` fails with no `.catch`, so it logs "Uncaught (in promise)".
  - **Size:** S.
- **L3. A loop's terminal stop gets no orange stretch on the map.**
  - **Where:** `src/features/routes/model/line-pass.ts:69` keeps hintuans only.
  - **Effect:** the row is listed and can be tapped, but nothing is painted there.
  - **Size:** S.
- **L4. "The map failed to load" can show by mistake when offline.**
  - **Where:** `src/features/routes/map/map-view.tsx:396-408`. Any MapLibre error before load, including a single missing font or tile, shows the red banner until load.
  - **Check:** needs confirming on a phone.
  - **Size:** S.
- **L5. "Removed by an editor" can be shown wrongly after 1000 uploads.**
  - **Where:** `src/features/contribute/upload-contribution.ts:85` reads only the first page of 1000 ids. `use-uploads.ts:263-271` then marks every upload missing from that page as removed by an editor.
  - **Size:** S.
- **L6. The bot check can be asked for twice.**
  - **Where:** `src/features/contribute/use-uploads.ts:124-132`. When several recordings wait, the bot check can be asked for twice although the phone is already signed in.
  - **Size:** S.
- **L7. One bad first GPS fix can drop minutes of real points.**
  - **Where:** `src/features/contribute/pack-recording.ts:42-58`. A coarse first fix that is kilometres off makes the following real points look too fast, so they are dropped. Nobody is told.
  - **Size:** M.
- **L8. Changing a route's mode updates the hintuan links of the saved direction only.**
  - **Where:** `src/features/studio/data/draft-save.ts:510-511`.
  - **Size:** S.
- **L9. A loop's position on a ride is measured on the wrong length.**
  - **Where:** `src/features/routes/map/use-ride-to.ts:333`. It measures on the open line, while the ride uses the closed ring. This affects rides that end near the loop's seam.
  - **Size:** S.
- **L10. Raw database error text is shown to editors.**
  - **Where:** for example `src/features/studio/panels/review-subjects.tsx:51` and `publication-panel.tsx:11`.
  - **Fix:** turn errors into plain words in the data layer.
  - **Size:** S.
- **L11. Styling drift.**
  - `text-[11px]` is used 9 times with no token.
  - There are pixel-exact values, for example `livery-card.ts:148`, `w-[795.076px]`.
  - 201 raw palette classes (such as `text-neutral-400`) are used, mostly in the studio's panels, instead of semantic tokens.
  - **Size:** M.
- **L12. Dead code.**
  - Never used:
    - `usePersistentStorage` (`src/features/contribute/persistent-storage.ts:39`)
    - `CircleArrowRightIcon` (`src/shared/ui/route-icons.tsx:60`)
    - `type UploadMark` (`src/features/contribute/recording-schema.ts:48`)
  - 69 more exports are used only inside their own file.
  - No unused dependencies or orphan files were found.
  - **Size:** S.
- **L13. Small inconsistencies.**
  - The "Turn uploads on" step in CI writes the Turnstile key twice.
  - `@tanstack/react-query` is pinned exactly while every other dependency uses a range.
  - **Size:** S.

## Checked and found sound

- **Secrets:** no secrets in the repo. `.env.production` holds only the three public values, and the CI secrets live in GitHub.
- **Row Level Security:**
  - Every write to route, direction, hotspot, draft and signboard storage requires an editor.
  - A contributor's phone signs in with an anonymous account, which Supabase gives the same `authenticated` role as editors. Checked: that does **not** let a phone read drafts, editor names or unapproved routes.
  - Contributions can't be read anonymously, and every monthly points table has RLS on.
- **SECURITY DEFINER functions:**
  - Every public one checks `private.require_editor()` or `private.is_editor()`.
  - The unguarded ones are triggers or owner-only steps, with execute revoked from every API role.
  - The sign-up hook fails closed.
- **The public page and Supabase:** the build guard proves no Supabase client or contributor code reaches it. Its only outside requests are the basemap tiles at `tiles.openfreemap.org`.
- **Contributor uploads:**
  - Retrying is safe: the id is made on the phone, and the server answers "already saved".
  - The local store is checked with Zod.
  - The wake lock and the location watch are cleaned up.
  - Deletes cascade to points, hintos and the editors' uses.
- **Public map:**
  - fares and rail fares;
  - the index reader with its stored-copy fallback;
  - the locator's handling of a refused permission and of timeouts;
  - the update and reload flow;
  - map listener cleanup.
- **Code standards:** no `any`, no `!`, no `console.log` and no empty `catch` in `src/`.

## Not covered

- The approval SQL internals (`approve_draft`, `approve_reviewed_draft`).
- The studio's review screens, signboard uploads and the studio's sign-in with Turnstile.
- The publish's file building (`shapes.mjs`, `lineFile.mjs`), beyond the row building and the guards.
- The camera and card state machines (`use-card-camera`, `use-card-stack`, `use-overviews`).
- The map label and arrow layers, and how taps are resolved.
- More than one tab open at once, on the contributor page and for map updates.
- The iPhone install prompt.
- No browser suite was run, and nothing was tried on a real phone.
- The Supabase dashboard settings: the anonymous sign-in rate limit, whether captcha is on, and the hook being selected. These can't be seen from the repo.

## Top 5 to do next

1. **C1.** Fix the consent screen's promise before more recordings are sent: ship the real consent text, and upload only after it is agreed to. If the text isn't ready, turn uploads off.
2. **H1.** Stop editors overwriting each other: check the draft's revision from when the panel opened.
3. **H2.** Fix CI's env overrides (`.env.production.local`) and fake Turnstile in `contribute-offline-test`. This removes the flake and keeps tests out of the production database.
4. **H3.** Make the map reader tolerate a new mode or kind, so one publish can't blank every installed app.
5. **M3 and H5.** Decide on the 410 kB budget before the next public-page PR fails it, and time `save-test`'s sections, then split it.
