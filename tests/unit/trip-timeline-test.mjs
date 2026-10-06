// A trip card's timeline as it first renders (src/shared/cards/TripTimeline.tsx):
// folded rows are their bare <li>s until the fold is first opened (the
// cheap-phone plan, step 11, 2026-10-04) — each with its data, its classes
// and its 0fr row, so it folds, hides and first opens as it did — and one
// hidden name asks for the face their names are set in, as the hidden rows
// did. A lone hintuan is drawn as it is. Rendered to HTML by React's own
// server renderer, the component read through Vite (it is TSX, which Node
// cannot strip). What happens as the fold opens and folds again — every row
// drawn from then on — is phone-test's (a trip card's fold).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/trip-timeline-test.mjs
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../..', import.meta.url)),
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
})
after(() => vite.close())
const { TripTimeline } = await vite.ssrLoadModule('/src/shared/cards/TripTimeline.tsx')

/** The timeline of a trip with `n` hintuans, h0 … h(n-1), as it first renders. */
const render = (n, props = {}) =>
  renderToStaticMarkup(
    createElement(TripTimeline, {
      livery: 'yellow',
      routeOrigin: 'Tala',
      hintuans: Array.from({ length: n }, (_, i) => ({ id: `h${i}`, label: `Hintuan ${i}` })),
      picked: null,
      onPick() {},
      onEnd() {},
      endPicked: null,
      routeDirection: 'Novaliches',
      ...props,
    }),
  )

/** Every hintuan row: its opening tag's attributes and what it holds. */
const rows = (html) =>
  [...html.matchAll(/<li data-testid="trip-hintuan"([^>]*)>(.*?)<\/li>/g)].map(([, attrs, inside]) => ({
    id: /data-hintuan="([^"]*)"/.exec(attrs)?.[1],
    state: /data-state="([^"]*)"/.exec(attrs)?.[1],
    cls: /class="([^"]*)"/.exec(attrs)?.[1],
    inside,
  }))

/** The hidden name that asks for the rows' face: its class and its words. */
const askers = (html) => [...html.matchAll(/<span aria-hidden="true" class="([^"]*\binvisible absolute\b[^"]*)">([^<]*)<\/span>/g)].map(([, cls, text]) => ({ cls, text }))

const FOLDED = 'grid transition-[grid-template-rows,visibility] motion-reduce:transition-none invisible grid-rows-[0fr] duration-base ease-exit'
const SHOWN = 'grid transition-[grid-template-rows,visibility] motion-reduce:transition-none visible grid-rows-[1fr] duration-gentle ease-enter'

test('folded and never opened, every row is its bare <li>: its data and its fold classes, nothing inside', () => {
  const html = render(10, { picked: 'h3' })
  const r = rows(html)
  assert.equal(r.length, 10)
  assert.deepEqual(r.map((x) => x.id), Array.from({ length: 10 }, (_, i) => `h${i}`))
  assert.ok(r.every((x) => x.cls === FOLDED), 'folded: invisible, a 0fr row, the fold-away motion')
  assert.ok(r.every((x) => x.inside === ''), 'no inside drawn')
  // Folded away, a picked row stays picked (the owner's default).
  assert.deepEqual(r.map((x) => x.state), r.map((x) => (x.id === 'h3' ? 'selected' : 'rest')))
  assert.ok(!html.includes('trip-hintuan-pick'), 'no row button')
  assert.ok(!html.includes('trip-hintuan-fare'), 'no pill')
  assert.match(html, /data-testid="trip-fold" aria-expanded="false"/)
  assert.match(html, />10 more hintuans</)
})

test("a hidden name asks for the rows' face as the card opens, in the weight a drawn row's name has", () => {
  const ask = askers(render(10))
  assert.equal(ask.length, 1, 'one, for every row')
  assert.equal(ask[0].text, 'Hintuan 0')
  assert.match(ask[0].cls, /\bpointer-events-none\b/)
  // A drawn row's name (a lone hintuan's), not picked: the same weight.
  const name = /<span class="min-w-0 flex-1 text-base\/6 ([^"]*)">Hintuan 0<\/span>/.exec(render(1))
  assert.ok(name, "a lone hintuan's row draws its name")
  const weight = (cls) => cls.split(' ').find((c) => /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(c))
  assert.equal(weight(ask[0].cls), weight(name[1]))
})

test('a lone hintuan is drawn as it is: shown, its button, nothing to fold and nothing hidden to ask', () => {
  const html = render(1, { picked: 'h0', pickedPesos: '₱13' })
  const [row] = rows(html)
  assert.equal(row.cls, SHOWN)
  assert.match(row.inside, /data-testid="trip-hintuan-pick" aria-pressed="true"/)
  assert.match(row.inside, /data-testid="trip-hintuan-fare"[^>]*>₱13</)
  assert.ok(!html.includes('trip-fold'))
  assert.equal(askers(html).length, 0)
})

test('no hintuans: no rows, no fold, nothing hidden', () => {
  const html = render(0)
  assert.equal(rows(html).length, 0)
  assert.ok(!html.includes('trip-fold'))
  assert.equal(askers(html).length, 0)
})
