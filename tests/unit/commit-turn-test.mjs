// A child's effect run where its parent's hook stood in the commit
// (src/shared/hooks/commit-turn.ts), and the visitor's camera that needs it
// (useLocator.ts's `cameraTurn`, VisitorLocation.tsx; the cheap-phone plan,
// step 15, 2026-10-05). React runs a component's effects after all of its
// children's, so the locator's hooks, moved from CommuterApp into a child of
// it, would move the camera before the cards' camera of the same commit and
// not after: the sheet set to another height while the camera follows the
// visitor would end on the card's overview, not on the visitor.
//
// Real React (react-dom's client) renders components that draw nothing,
// into a stand-in container: Node has no DOM, and none is needed for the
// order effects run in. The map is a stand-in too, which logs its camera
// calls and fires 'movestart' at once, as MapLibre's do.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/commit-turn-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StrictMode, act, createElement as h, useEffect, useState } from 'react'
import { turnFor, useTurn } from '../../src/shared/hooks/commit-turn.ts'
import { useLocator } from '../../src/features/locator/use-locator.ts'

// ------------------------------------------------------------ React in Node
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window ??= globalThis
globalThis.HTMLIFrameElement ??= class {}
const noop = () => {}
const container = { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml', addEventListener: noop, removeEventListener: noop }
const doc = { nodeType: 9, addEventListener: noop, removeEventListener: noop, defaultView: globalThis, documentElement: container, body: container, activeElement: null }
container.ownerDocument = doc
globalThis.document ??= doc
const { createRoot } = await import('react-dom/client')

/** Renders `el`, and hands back a root to render again and to unmount. */
async function mount(el) {
  const root = createRoot({ ...container })
  await act(async () => root.render(el))
  return root
}

// ------------------------------------------------------------- the turn alone
test('a turn holds what it is handed until it is done, then runs each in order; once done, at once', () => {
  const log = []
  const t = turnFor()
  t.run(() => log.push('a'))
  t.run(() => log.push('b'))
  assert.deepEqual(log, [])
  t.done()
  assert.deepEqual(log, ['a', 'b'])
  t.run(() => log.push('c'))
  assert.deepEqual(log, ['a', 'b', 'c'])
  t.done()
  assert.deepEqual(log, ['a', 'b', 'c'], 'done again runs nothing again')
})

// ------------------------------------------------------- the turn in React
test("in a commit the parent renders in, a child's turned effect runs where the parent's hook stands", async () => {
  const log = []
  const set = {}
  function Child({ n, turn }) {
    const [k, setK] = useState(0)
    set.child = setK
    useEffect(() => {
      log.push(`child plain ${n}/${k}`)
    })
    useEffect(() => turn(() => log.push(`child turned ${n}/${k}`)), [n, k])
    return null
  }
  function Parent() {
    const [n, setN] = useState(0)
    set.parent = setN
    useEffect(() => {
      log.push(`parent before ${n}`)
    })
    const turn = useTurn()
    useEffect(() => {
      log.push(`parent after ${n}`)
    })
    return h(Child, { n, turn })
  }
  const root = await mount(h(Parent))
  assert.deepEqual(log.splice(0), ['child plain 0/0', 'parent before 0', 'child turned 0/0', 'parent after 0'])
  await act(async () => set.parent(1))
  assert.deepEqual(log.splice(0), ['child plain 1/0', 'parent before 1', 'child turned 1/0', 'parent after 1'])
  // Only the child renders: nothing of the parent's runs, and the child's effect at once.
  await act(async () => set.child(1))
  assert.deepEqual(log.splice(0), ['child plain 1/1', 'child turned 1/1'])
  // Both at once: at the parent's place again.
  await act(async () => {
    set.parent(2)
    set.child(2)
  })
  assert.deepEqual(log.splice(0), ['child plain 2/2', 'parent before 2', 'child turned 2/2', 'parent after 2'])
  await act(async () => root.unmount())
})

test("StrictMode's second run of a mount's effects runs a turned effect once more, at once, and leaves nothing waiting", async () => {
  const log = []
  const set = {}
  function Child({ turn, n }) {
    useEffect(() => turn(() => log.push(`turned ${n}`)), [n])
    return null
  }
  function Parent() {
    const [n, setN] = useState(0)
    set.parent = setN
    const turn = useTurn()
    return h(Child, { turn, n })
  }
  const root = await mount(h(StrictMode, null, h(Parent)))
  assert.deepEqual(log.splice(0), ['turned 0', 'turned 0'])
  await act(async () => set.parent(1))
  assert.deepEqual(log.splice(0), ['turned 1'])
  await act(async () => root.unmount())
})

// ---------------------------------------------- the visitor's camera, as used
/**
 * A stand-in map: its camera calls logged, 'movestart' fired as each starts,
 * carrying what it was given (APP_MOVE's `appMove`), as MapLibre's does.
 */
function standInMap(log) {
  const on = new Map()
  const fire = (type, e = {}) => {
    for (const f of on.get(type) ?? []) f({ type, ...e })
  }
  return {
    on: (type, f) => on.set(type, [...(on.get(type) ?? []), f]),
    off: (type, f) => on.set(type, (on.get(type) ?? []).filter((g) => g !== f)),
    getZoom: () => 12,
    getBearing: () => 0,
    easeTo: (o, e) => {
      log.push(`easeTo ${o.center ? 'visitor' : 'elsewhere'} ${o.duration}`)
      fire('movestart', e)
    },
    fitBounds: (_b, _o, e) => {
      log.push('fitBounds overview')
      fire('movestart', e)
    },
  }
}

/** A GPS: one watch, and `send` a fix to it. */
function standInGps() {
  const gps = { watch: null }
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok) => {
        gps.watch = ok
        return 1
      },
      clearWatch: () => {},
    },
  })
  gps.send = (lng, lat) =>
    gps.watch({ coords: { longitude: lng, latitude: lat, accuracy: 10, speed: null, heading: null }, timestamp: Date.now() })
  return gps
}

/**
 * The page and its cards' camera — the sheet's height moving it to the
 * card's overview, as useHeightOverview does, with APP_MOVE — and the
 * locator: `layout` 'page', its hook among the page's after the cards'
 * (CommuterApp before 2026-10-05); 'child', in a child given the page's turn
 * (VisitorLocation); 'child-unturned', in a child without it.
 */
async function sheetWhileFollowing(layout) {
  const log = []
  const map = standInMap(log)
  const gps = standInGps()
  const page = {}
  const opts = (snap) => ({ offset: () => [0, -100], snap, compass: false })
  function Visitor({ snap, turn }) {
    page.locator = useLocator(map, { ...opts(snap), ...(turn ? { cameraTurn: turn } : {}) })
    return null
  }
  function Page() {
    const [snap, setSnap] = useState('middle')
    page.setSnap = setSnap
    const [last, setLast] = useState(snap)
    useEffect(() => {
      if (last === snap) return
      setLast(snap)
      map.fitBounds([[0, 0], [1, 1]], { duration: 700 }, { appMove: true })
    }, [snap, last])
    if (layout === 'page') page.locator = useLocator(map, opts(snap))
    const turn = useTurn()
    return layout === 'page' ? null : h(Visitor, { snap, turn: layout === 'child' ? turn : null })
  }
  const root = await mount(h(Page))
  await act(async () => page.locator.tap())
  await act(async () => gps.send(121.05, 14.7))
  const followed = { log: log.splice(0), mode: page.locator.mode }
  await act(async () => page.setSnap('max'))
  const sheet = { log: log.splice(0), mode: page.locator.mode }
  await act(async () => page.locator.tap())
  await act(async () => gps.send(121.0501, 14.7))
  const walked = { log: log.splice(0), mode: page.locator.mode }
  await act(async () => root.unmount())
  return { followed, sheet, walked }
}

test("the sheet set to another height while the camera follows: the overview starts, the visitor's camera takes over, as when the locator was the page's", async () => {
  const before = await sheetWhileFollowing('page')
  assert.deepEqual(before.followed, { log: ['easeTo visitor 800'], mode: 'TrackedLocation' })
  assert.deepEqual(before.sheet, { log: ['fitBounds overview', 'easeTo visitor 800'], mode: 'TrackOwnLocation' })
  // A tap brings it back, and the next fix, the child's alone, moves it at once.
  assert.deepEqual(before.walked, { log: ['easeTo visitor 800', 'easeTo visitor 400'], mode: 'TrackedLocation' })
  const now = await sheetWhileFollowing('child')
  assert.deepEqual(now, before)
})

test('without the turn, the child would move the camera first and the overview would take over: the order the turn keeps', async () => {
  const unturned = await sheetWhileFollowing('child-unturned')
  assert.deepEqual(unturned.sheet.log, ['easeTo visitor 800', 'fitBounds overview'])
})
