// The basemap tiles the public map asked for before the service worker took
// control of a first visit, asked for again once it has, so the worker keeps
// them (src/features/routes/map/tiles-asked.ts, src/features/published-map/pwa.ts's warmCaches).
// Since the map opens on its routes (Q1, 2026-10-04) every tile of the first
// screen comes before the worker takes over; pwa-test's "basemap-tiles holds
// tiles" found none kept on GitHub's runner (2026-10-06).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/tiles-asked-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TILES_KEPT, noteTile, takeTilesAsked, tileNotes } from '../../src/features/routes/map/tiles-asked.ts'

const tile = (z, x, y) => `https://tiles.openfreemap.org/planet/20260927_080001_pt/${z}/${x}/${y}.pbf`

test('notes only tiles, each once, in the order asked, and changes no request', () => {
  const n = tileNotes()
  // MapLibre keeps the URL as it was when the transform returns nothing
  // (request_manager.ts: `this._transformRequestFn(url, type) || {url}`).
  assert.equal(n.note(tile(11, 1711, 940), 'Tile'), undefined)
  assert.equal(n.note('https://tiles.openfreemap.org/styles/positron', 'Style'), undefined)
  assert.equal(n.note('https://tiles.openfreemap.org/planet', 'Source'), undefined)
  assert.equal(n.note('https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf', 'Glyphs'), undefined)
  assert.equal(n.note('https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png', 'SpriteImage'), undefined)
  n.note(tile(11, 1711, 939), 'Tile')
  n.note(tile(11, 1711, 940), 'Tile')
  n.note(tile(12, 3422, 1880))
  assert.deepEqual(n.take(), [tile(11, 1711, 940), tile(11, 1711, 939)])
})

test('take hands the tiles over once, and stops the noting', () => {
  const n = tileNotes()
  n.note(tile(11, 1, 1), 'Tile')
  assert.deepEqual(n.take(), [tile(11, 1, 1)])
  assert.deepEqual(n.take(), [])
  // From now on the page's own requests go through the worker.
  n.note(tile(11, 1, 2), 'Tile')
  assert.deepEqual(n.take(), [])
})

test('nothing asked yet: nothing to take, and nothing noted after', () => {
  const n = tileNotes()
  assert.deepEqual(n.take(), [])
  n.note(tile(11, 1, 1), 'Tile')
  assert.deepEqual(n.take(), [])
})

test(`keeps at most ${TILES_KEPT} tiles, the first asked`, () => {
  assert.ok(TILES_KEPT >= 16, 'a phone screen of tiles at two zooms fits')
  const n = tileNotes()
  for (let i = 0; i < TILES_KEPT + 10; i++) n.note(tile(14, 13700 + i, 7520), 'Tile')
  const took = n.take()
  assert.equal(took.length, TILES_KEPT)
  assert.equal(took[0], tile(14, 13700, 7520))
  assert.equal(took.at(-1), tile(14, 13700 + TILES_KEPT - 1, 7520))
  const few = tileNotes(2)
  for (let i = 0; i < 5; i++) few.note(tile(14, i, 0), 'Tile')
  assert.deepEqual(few.take(), [tile(14, 0, 0), tile(14, 1, 0)])
})

test("the module's own notes are one page's: noteTile and takeTilesAsked share them", () => {
  noteTile(tile(13, 6850, 3760), 'Tile')
  noteTile(tile(13, 6850, 3760), 'Tile')
  assert.deepEqual(takeTilesAsked(), [tile(13, 6850, 3760)])
  noteTile(tile(13, 6851, 3760), 'Tile')
  assert.deepEqual(takeTilesAsked(), [])
})

test('the public map notes its tiles, the studio none, and the worker asks for them again once in control', () => {
  const view = readFileSync(new URL('../../src/features/routes/map/map-view.tsx', import.meta.url), 'utf8')
  assert.match(view, /import \{ noteTile \} from '\.\/tiles-asked'/)
  // Only with `openOn`, which only the public map passes.
  assert.match(view, /\.\.\.\(openOn \? \{ transformRequest: noteTile \} : \{\}\)/)
  assert.equal(view.match(/transformRequest/g).length, 1, 'no other transform')
  const studio = readFileSync(new URL('../../src/app/studio/studio-app.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(studio, /openOn/)

  const pwa = readFileSync(new URL('../../src/features/published-map/pwa.ts', import.meta.url), 'utf8')
  const warm = pwa.slice(pwa.indexOf('async function warmCaches'))
  const control = warm.indexOf("addEventListener('controllerchange'")
  const take = warm.indexOf('...takeTilesAsked().map(quiet)')
  assert.ok(control > 0 && take > control, 'the tiles are taken once the worker controls the page, with the map file and the style')
  assert.match(pwa, /import \{ takeTilesAsked \} from '@\/features\/routes\/map\/tiles-asked'/)
})
