// Reading the route lines' looks off the map: the directions a source has lit
// and the lines' paint, read by what lookReaders puts in the page, and the lit
// line's colours now; and the GL programs the map has compiled. lookReaders:
// visitor-test, phone-test and group-test. paintNow, rideLook, programsAtRest
// and programsSince: visitor-test and phone-test.

/**
 * In the page, before the app starts (`page.addInitScript(lookReaders)`):
 * window.__lit and window.__paint. It runs in the page, so it uses nothing
 * from this file.
 */
export function lookReaders() {
  // Since 2026-09-25 a tap is feature state, not a filter or a paint
  // expression naming ids (useLighting in src/features/routes/map/saved-routes-layers.ts).
  // The directions a source has lit.
  window.__lit = async (src) => {
    const m = window.__map
    const fc = await m?.getSource(src)?.getData()
    if (!fc) return null
    return [...new Set(fc.features.map((f) => f.properties.id))].filter((id) => !!m.getFeatureState({ source: src, id }).lit)
  }
  // The route lines' paint, the owner's two looks of 2026-09-29: the colour a
  // line rests in, the colour of the lit copy drawn over it, and any
  // saved-routes layer whose opacity shades a line rather than switching it
  // on or off — the outputs of its expression, read branch by branch.
  window.__paint = () => {
    const m = window.__map
    const outputs = (e) =>
      typeof e === 'number' ? [e]
      : !Array.isArray(e) ? []
      : e[0] === 'case' ? [...e.slice(2, -1).filter((_, i) => i % 2 === 0), e.at(-1)].flatMap(outputs)
      : e[0] === 'step' ? [e[2], ...e.slice(4).filter((_, i) => i % 2 === 0)].flatMap(outputs)
      : e[0] === 'interpolate' ? e.slice(4).filter((_, i) => i % 2 === 0).flatMap(outputs)
      : []
    const shaded = m.getStyle().layers
      .filter((l) => l.id.startsWith('saved-routes') && l.type === 'line')
      .flatMap((l) => outputs(m.getPaintProperty(l.id, 'line-opacity') ?? 1).filter((o) => o > 0 && o < 1).map((o) => `${l.id} at ${o}`))
    return {
      rest: m.getPaintProperty('saved-routes-line', 'line-color'),
      lit: m.getPaintProperty('saved-routes-selected', 'line-color'),
      shaded,
    }
  }
}

/** The route lines' paint now (window.__paint), or null while their layer is not there yet. */
export const paintNow = (page) => page.evaluate(() => (window.__map.getLayer('saved-routes-line') ? window.__paint() : null))

/** The lit line's paint now: its colour, its chevrons', and its end circles' ring. */
export const rideLook = (page) =>
  page.evaluate(() => {
    const m = window.__map
    const get = (layer, prop) => (m.getLayer(layer) ? m.getPaintProperty(layer, prop) : null)
    return {
      line: get('saved-routes-selected', 'line-color'),
      arrow: get('direction-arrow-chevrons', 'fill-color'),
      ends: get('direction-end-circles', 'circle-stroke-color'),
    }
  })

/**
 * The GL programs the map has compiled, by MapLibre's keys (window.__programs,
 * MapView.tsx), once the end circles' is among them, or `ms` has passed:
 * `{ keys, circle, ms }`, `circle` false when it never came. It is compiled
 * while the map is idle, from a twin of theirs drawn once (warmPrograms.ts),
 * so a tap does not compile it as its card comes up (the cheap-phone plan,
 * step 3, 2026-10-04).
 */
export const programsAtRest = async (page, ms = 20000) => {
  const from = Date.now()
  for (;;) {
    const circle = await page.evaluate(() => (window.__programs?.() ?? []).some((k) => k.startsWith('circle/')))
    if (circle || Date.now() - from > ms) break
    await page.waitForTimeout(200)
  }
  const waited = Date.now() - from
  // Then the map at rest, its view's tiles in, before the keys are read.
  const keys = await page.evaluate(
    () =>
      new Promise((done) => {
        const m = window.__map
        const t0 = performance.now()
        const read = () =>
          (m.loaded() && m.areTilesLoaded() && !m.isMoving()) || performance.now() - t0 > 10000 ? done(window.__programs?.() ?? []) : setTimeout(read, 100)
        read()
      }),
  )
  return { keys, circle: keys.some((k) => k.startsWith('circle/')), ms: waited }
}

/**
 * Once the map is idle (or 15 s have passed), the GL programs it has
 * compiled since `before` (programsAtRest's keys): `{ added, standIn }`.
 * `standIn` are the ones of them a real basemap compiles as it loads and
 * the suites' stand-in for it, a gray background and nothing else, cannot:
 * a program of one value for the layer (no a_ or z_ in its key) of a fill
 * or a line, while the basemap on the page draws no fill or line of its
 * own. They are the chevrons' and the babaan sides' fill, which Positron's
 * water and parks compile at load. On a real basemap there are none.
 */
export const programsSince = async (page, before) => {
  const { keys, basemap } = await page.evaluate(
    () =>
      new Promise((done) => {
        const m = window.__map
        const t0 = performance.now()
        const read = () => {
          if (!(m.loaded() && m.areTilesLoaded() && !m.isMoving()) && performance.now() - t0 < 15000) return setTimeout(read, 100)
          const theirs = m
            .getLayersOrder()
            .map((id) => m.getLayer(id))
            .filter((l) => l?.source && m.getSource(l.source)?.type !== 'geojson')
          done({ keys: window.__programs(), basemap: [...new Set(theirs.map((l) => l.type))] })
        }
        setTimeout(read, 300)
      }),
  )
  const family = { fill: 'fill', fillOutline: 'fill', line: 'line' }
  const added = keys.filter((k) => !before.includes(k))
  const standIn = added.filter((k) => {
    const type = family[k.split('/')[0]]
    return !!type && !basemap.includes(type) && !/\/[az]_/.test(k)
  })
  return { added: added.filter((k) => !standIn.includes(k)), standIn }
}
