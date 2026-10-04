import { useEffect, useRef } from 'react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { HOTSPOT_COLOUR, HOTSPOT_CONTENT, HOTSPOT_OPACITY } from './colours'
import { MAP_OPACITY, MAP_PAINT } from '../../design-system/foundation/mapColours'
import { ringToPolygon, type Ring } from '../geo/ring'
import type { LngLat } from '../geo/geo'
import { labelGroups } from '../model/places'
import { stopRing, type StopKind, type StopSummary } from '../model/stops'
import { STOPS_FILL_LAYER } from './tap'
import { LAYERS, applyHidden } from './layers'
import type { BoxMark } from './stopsShown'

/*
 * The saved hotspots on the map: their source, the place wash's, their
 * layers, and what a tap marks on them. Split from useSavedStops.ts,
 * 2026-09-29.
 */

const SRC = 'saved-stops'
const FILL = STOPS_FILL_LAYER
const OUTLINE = 'saved-stops-outline'
const LABEL = 'saved-stops-label'
const HINTUAN_LABEL = LAYERS.stopsHintuanLabel
/**
 * Hotspot names show only close in. Further out a name sat over the line's
 * stretch through the hotspot. The owner's asks of
 * 2026-09-25: hintuan names from zoom 16.5 (between a view at 16, names in
 * the way, and one at 16.7, names kept); then the terminals' the same; then
 * the names lasting 12/10 as far out — gone once the map shows 1.2 times the
 * ground it did at 16.5. Two layers, one a kind, so each can be set apart.
 */
const NAMES_FROM = 16.5 - Math.log2(1.2)

/** A flag of the feature state a tap sets on a box: `lit`, `sibling` or `chosen`. */
const state = (name: 'lit' | 'sibling' | 'chosen') => ['boolean', ['feature-state', name], false] as const
/**
 * The label points of one kind, less the one of the hotspot being edited. A
 * label's `ids` are its boxes' ids joined by commas: a GeoJSON array property
 * reaches the style as a string anyway, and an id is a UUID, so `in` is exact.
 */
const labelsOf = (kind: StopKind, hidden = '') =>
  [
    'all',
    ['==', ['geometry-type'], 'Point'],
    ['==', ['get', 'kind'], kind],
    ...(hidden ? [['!', ['in', hidden, ['get', 'ids']]]] : []),
  ] as never
/** The boxes under a tap, or the chosen one, striped while they are asked about: the HotspotOverlayCard's State=Selected. */
const HATCH = 'saved-stops-hatch'
const hatchOf = (kind: StopKind) => `hotspot-hatch-${kind}`

/**
 * The Selected box's stripes (3837:11308): 0.6 px lines of the box's content
 * colour, 16 px apart since the owner's "make the lines much lesser"
 * (2026-09-30; 8 at first), rising to the right — a pattern MapLibre repeats in
 * screen pixels, so they keep their spacing at every zoom. Drawn at twice the
 * size for a sharp screen.
 */
function hatch(hex: string): { width: number; height: number; data: Uint8Array } {
  const size = 32
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance, across the line, from the nearest diagonal x + y ≡ 0.
      const along = (x + y + 1) % size
      const d = Math.min(along, size - along) / Math.SQRT2
      const a = Math.max(0, Math.min(1, 0.6 + 0.5 - d))
      data.set([r, g, b, Math.round(a * 255)], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data }
}

/**
 * How much stronger a sibling box's fill is drawn over its own, a hintuan's
 * to Map/OverlayCard/Hintuan/surface-selected (60% over 30%).
 */
const HINTUAN_STRONGER = 1 - (1 - MAP_OPACITY['Map/OverlayCard/Hintuan/surface-selected']) / (1 - HOTSPOT_OPACITY.hintuan)

/** A hotspot's name sits in the middle of its box (the owner's frame, 3837:11308): the middle of its corners. */
function boxMiddle(ring: Ring): LngLat {
  const lngs = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}
/**
 * The place highlight, decided with the owner 2026-09-23: tap one box and
 * its siblings — the boxes sharing its informal name — draw stronger, and a
 * soft wash over the hull of all of them says "one place". Studio and public
 * map alike. The wash has its own source, rebuilt when the selection changes.
 */
const SIBLINGS = 'saved-stops-siblings'
const WASH_SRC = 'place-wash'
const WASH = 'place-wash-fill'
const WASH_EDGE = 'place-wash-edge'

/**
 * Hotspots sit under the route lines; a route drawn right under the tapped
 * pixel still wins the click, and one merely near it shares a chooser.
 */
const ROUTES_ABOVE = LAYERS.routesCasing
const DRAW_ABOVE = LAYERS.drawCasing

/**
 * The filter of each layer drawn from the hotspots' source, the box being
 * edited (`hidden`, '' for none) left out: what the studio sets as it opens an
 * outline, and sets back once it is closed. The boxes' layers get one filter,
 * SIBLINGS too. MapLibre's worker lays out the layers of a source that share
 * a type, a filter and a layout as one bucket; left on its first filter,
 * SIBLINGS was a fill bucket of its own, every box triangulated and uploaded
 * a second time (the cheap-phone plan, step 5, 2026-10-04). It never drew the
 * box being edited: the studio closes the hotspot's card, and its siblings'
 * marks with it, before it opens the outline, and takes no tap on a box
 * while one is open.
 */
export function hiddenStopFilters(hidden: string): [string, unknown][] {
  const boxes = ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'id'], hidden]]
  return [
    [FILL, boxes],
    [OUTLINE, boxes],
    [SIBLINGS, boxes],
    [HATCH, boxes],
    [LABEL, labelsOf('terminal', hidden)],
    [HINTUAN_LABEL, labelsOf('hintuan', hidden)],
  ]
}

/**
 * The saved hotspots' sources and layers on `map`: laid out from `stops`, the
 * one being edited hidden, each box marked as `marks` says (stopsShown.ts),
 * and the place wash over `hull`.
 */
export function useSavedStopsLayers(
  map: MapLibreMap | null,
  stops: readonly StopSummary[],
  hiddenStopId: string | null | undefined,
  marks: ReadonlyMap<string, BoxMark>,
  hull: Ring,
) {
  useEffect(() => {
    if (!map || map.getSource(SRC)) return
    // Under the routes, under the draft, and under the basemap's labels in
    // any case: a box never hides a street name.
    const before = map.getLayer(ROUTES_ABOVE)
      ? ROUTES_ABOVE
      : map.getLayer(DRAW_ABOVE)
        ? DRAW_ABOVE
        : map.getStyle().layers.find((l) => l.type === 'symbol')?.id

    // `promoteId`: the feature state a tap sets is keyed on the hotspot's id
    // (its box and its label point share it, so both carry the state).
    map.addSource(SRC, {
      type: 'geojson',
      promoteId: 'id',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addSource(WASH_SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    // The wash sits under every box: a tint that joins them, never a thing to tap.
    map.addLayer(
      {
        id: WASH,
        type: 'fill',
        source: WASH_SRC,
        paint: { 'fill-color': HOTSPOT_COLOUR.terminal, 'fill-opacity': 0.1 },
      },
      before,
    )
    map.addLayer(
      {
        id: WASH_EDGE,
        type: 'line',
        source: WASH_SRC,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': HOTSPOT_COLOUR.terminal, 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
      },
      before,
    )
    // The owner's HotspotOverlayCard (3837:11308, 2026-09-30): the box's
    // surface see-through, its edge and name in its content colour.
    const byKind = (terminal: string | number, hintuan: string | number) =>
      ['match', ['get', 'kind'], 'terminal', terminal, hintuan] as never
    const colour = byKind(HOTSPOT_COLOUR.terminal, HOTSPOT_COLOUR.hintuan)
    const content = byKind(HOTSPOT_CONTENT.terminal, HOTSPOT_CONTENT.hintuan)
    for (const kind of ['terminal', 'hintuan'] as const) {
      if (!map.hasImage(hatchOf(kind))) map.addImage(hatchOf(kind), hatch(HOTSPOT_CONTENT[kind]), { pixelRatio: 2 })
    }
    map.addLayer(
      {
        id: FILL,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colour, 'fill-opacity': byKind(HOTSPOT_OPACITY.terminal, HOTSPOT_OPACITY.hintuan) },
      },
      before,
    )
    map.addLayer(
      {
        id: OUTLINE,
        type: 'line',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { 'line-join': 'round' },
        // 0.6 as drawn, chosen or not: the stripes say which is chosen.
        paint: { 'line-color': content, 'line-width': 0.6 },
      },
      before,
    )
    // The chosen box's siblings, drawn stronger than the rest and outlined.
    // Every box is in this layer and the lit one, at opacity 0 unless its
    // feature state says so: a filter naming the boxes would lay the whole
    // source out again at every tap (see useLighting in savedRoutesLayers.ts).
    map.addLayer(
      {
        id: SIBLINGS,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colour, 'fill-opacity': ['case', state('sibling'), byKind(0.3, HINTUAN_STRONGER), 0] as never },
      },
      before,
    )
    // The lit boxes — the one chosen, or everything under a tap while the
    // sheet asks which (the routes' lit pair's idea, 2026-09-22) — striped,
    // their fill as it was: the owner's redrawn Selected variants
    // (2026-09-30) keep the Rest surface under the stripes.
    map.addLayer(
      {
        id: HATCH,
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-pattern': ['match', ['get', 'kind'], 'terminal', hatchOf('terminal'), hatchOf('hintuan')] as never,
          'fill-opacity': ['case', state('lit'), 1, 0] as never,
        },
      },
      before,
    )
    // Labels go on top of everything: a name is never worth hiding under a line.
    // The terminals' above the hintuans', so where two collide the terminal
    // keeps its name.
    for (const [id, kind] of [
      [HINTUAN_LABEL, 'hintuan'],
      [LABEL, 'terminal'],
    ] as const) {
      map.addLayer({
        id,
        type: 'symbol',
        source: SRC,
        minzoom: NAMES_FROM,
        filter: labelsOf(kind),
        // The same size at every zoom, as it was; 12, SemiBold as near as
        // the map's fonts come, two lines over some 92 px as drawn, a white
        // halo (Border/plain) round it.
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'center',
          'text-justify': 'center',
          'text-max-width': 8,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': content,
          'text-halo-color': MAP_PAINT['Paint/casing'],
          'text-halo-width': 1,
        },
      })
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as GeoJSONSource | undefined
    if (!src) return
    // The label on the map is the name written on the ground, not the informal
    // one the cards, pickers and route names read: the map draws boxes, and the
    // three boxes of one place would otherwise carry three identical labels.
    // Tapping still opens a card that leads with the informal name and shows
    // the ground name beneath it, so neither is lost. Decided 2026-09-22.
    const withArea = stops.filter((s) => stopRing(s).length >= 3)
    src.setData({
      type: 'FeatureCollection',
      features: [
        ...withArea.map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, kind: s.kind, name: s.name },
          geometry: s.area!,
        })),
        // One label per hintuan: a box on each side of the road shares one
        // (labelGroups), halfway between them; a box alone has its name in
        // its middle (the owner's frame, 3837:11308, 2026-09-30).
        ...labelGroups(
          withArea.map((s) => ({ ...s, point: { type: 'Point' as const, coordinates: boxMiddle(stopRing(s)) } })),
        ).map((g) => ({
          type: 'Feature' as const,
          properties: { id: g.ids[0], ids: g.ids.join(','), kind: g.kind, name: g.name },
          geometry: { type: 'Point' as const, coordinates: g.point },
        })),
      ],
    })
  }, [map, stops])

  // What a tap did to each box, as feature state: lit (chosen, or under the
  // tap while the sheet asks), the chosen one, and its siblings — nothing
  // while muted. Only the boxes whose state changed are set, and none is ever
  // removed: a removal and a set of one id in the same frame leave the
  // removal in charge.
  const was = useRef<ReadonlyMap<string, BoxMark>>(new Map())
  useEffect(() => {
    if (!map || !map.getSource(SRC)) return
    for (const id of new Set([...was.current.keys(), ...marks.keys()])) {
      const state = marks.get(id) ?? 'none'
      if (was.current.get(id) === state) continue
      map.setFeatureState(
        { source: SRC, id },
        { lit: state === 'lit' || state === 'lit+sibling' || state === 'chosen', sibling: state.includes('sibling'), chosen: state === 'chosen' },
      )
    }
    was.current = marks
  }, [map, marks])

  // The place highlight's wash: a hull over the chosen box and its siblings.
  useEffect(() => {
    if (!map || !map.getLayer(SIBLINGS)) return
    const wash = map.getSource(WASH_SRC) as GeoJSONSource | undefined
    wash?.setData({
      type: 'FeatureCollection',
      features: hull.length >= 3 ? [{ type: 'Feature', properties: {}, geometry: ringToPolygon(hull) }] : [],
    })
  }, [map, hull])

  // The hotspot being edited is drawn by the editor; hide the saved copy.
  // Set only once there is one, and once more to show it again
  // (applyHidden): the public map never hides one, and sets no filter.
  const hiddenNow = useRef<string | null>(null)
  useEffect(() => {
    if (!map || !map.getLayer(FILL)) return
    applyHidden(hiddenNow, hiddenStopId, (hidden) => {
      for (const [id, filter] of hiddenStopFilters(hidden)) map.setFilter(id, filter as never)
    })
  }, [map, hiddenStopId])
}
