import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { APP_MOVE } from './MapView'
import type { StopLink, StopSummary } from '../model/stops'
import { useSavedStopsLayers } from './savedStopsLayers'
import { boxMarks, placeHull } from './stopsShown'
import { useStopTaps } from './stopTaps'

/**
 * Every saved hotspot, drawn for everyone as a shaded outline in its kind's
 * colour, with its route links alongside so the tap card can list them.
 *
 * `load` decides where the hotspots come from: the public map reads the
 * published file, the editor the live tables. Pass a function defined once at
 * module level, not a new one per render, or it reloads every render.
 *
 * The editor also passes `drawing` and `hiddenStopId`; the public map passes
 * neither, and both default to off. The public map passes `muted` while a
 * trip is open: the hotspot card or route list it was picked from waits
 * hidden behind it, and the hotspots that lit go dark until ‹ brings it back
 * (the owner, 2026-09-29: the map lights only the trip).
 */
export function useSavedStops<S extends StopSummary>(
  map: MapLibreMap | null,
  load: () => Promise<{ stops: S[]; links: StopLink[] }>,
  opts: { drawing?: boolean; hiddenStopId?: string | null; muted?: boolean } = {},
) {
  const muted = opts.muted ?? false
  const [stops, setStops] = useState<S[]>([])
  const [links, setLinks] = useState<StopLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * The hotspots under a tap that landed on several things (hotspots, routes
   * or both), for a chooser. Empty otherwise. The routes hook keeps the route
   * half of the same tap.
   */
  const [candidates, setCandidates] = useState<S[]>([])

  /** Choosing one hotspot answers the question the chooser was asking. */
  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    setCandidates([])
  }, [])

  const drawingRef = useRef(opts.drawing ?? false)
  drawingRef.current = opts.drawing ?? false
  // A chooser left open when drawing starts would come back, stale, after it.
  useEffect(() => {
    if (opts.drawing) setCandidates([])
  }, [opts.drawing])

  // The click handler is bound once; this is how it reads today's hotspots.
  const byId = useRef(new Map<string, S>())
  useEffect(() => {
    byId.current = new Map(stops.map((s) => [s.id, s]))
  }, [stops])

  const reload = useCallback(async () => {
    try {
      const loaded = await load()
      setStops(loaded.stops)
      setLinks(loaded.links)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  // What a tap marks, and the place wash (stopsShown.ts).
  const marks = useMemo(() => boxMarks(stops, selectedId, candidates, muted), [stops, selectedId, candidates, muted])
  const hull = useMemo(() => placeHull(stops, selectedId, muted), [stops, selectedId, muted])

  // ----------------------------------------------------------------- layers

  useSavedStopsLayers(map, stops, opts.hiddenStopId, marks, hull)

  // ----------------------------------------------------------------- events

  useStopTaps(map, { drawing: drawingRef, byId }, { selectedId: setSelectedId, candidates: setCandidates })

  const selected = stops.find((s) => s.id === selectedId) ?? null

  /** Direction ids linked to a hotspot, in stop_sequence order. */
  const linkedVariantIds = useCallback(
    (stopId: string) =>
      links
        .filter((l) => l.stop_id === stopId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((l) => l.route_variant_id),
    [links],
  )

  /** The hotspots one direction passes, in the order its line reaches them — the card's timeline. */
  const stopsAlong = useCallback(
    (variantId: string): S[] =>
      links
        .filter((l) => l.route_variant_id === variantId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((l) => stops.find((s) => s.id === l.stop_id))
        .filter((s): s is S => !!s),
    [links, stops],
  )

  /** Select a box and bring the map to it — what tapping a timeline row does, in both apps. */
  const show = useCallback(
    (id: string) => {
      const s = stops.find((x) => x.id === id)
      select(id)
      if (s && map) map.flyTo({ center: s.point.coordinates, zoom: Math.max(map.getZoom(), 16) }, APP_MOVE)
    },
    [stops, select, map],
  )

  return { stops, links, error, reload, selected, select, show, candidates, linkedVariantIds, stopsAlong }
}
