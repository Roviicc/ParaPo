// Reading the route lines' looks off the map: the directions a source has lit
// and the lines' paint, read by what lookReaders puts in the page, and the lit
// line's colours now. lookReaders: visitor-test, phone-test and group-test.
// paintNow and rideLook: visitor-test and phone-test.

/**
 * In the page, before the app starts (`page.addInitScript(lookReaders)`):
 * window.__lit and window.__paint. It runs in the page, so it uses nothing
 * from this file.
 */
export function lookReaders() {
  // Since 2026-09-25 a tap is feature state, not a filter or a paint
  // expression naming ids (useLighting in src/shared/map/savedRoutesLayers.ts).
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
