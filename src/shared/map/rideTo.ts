import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { APP_MOVE } from './MapView'
import { rideCut, travelLine } from '../model/ride'
import type { VariantSummary } from '../model/routes'
import { stopLabel, type StopSummary } from '../model/stops'

/**
 * A hintuan picked on the trip card — the owner's Timeline State=Selected,
 * 2026-09-29: its pill prices the ride from the start to there, and the map
 * glides there clear of the card. The route stays whole since 2026-09-30
 * (the owner: "now I don't want to cut the route"), a circle popping up where
 * `pinAt` says (HintuanPin.tsx); the studio went the same way that day ("most
 * of the interaction of public map should be in studio"), so the way not
 * ridden drawn at rest and its get-off circles went with it. Tapping the row
 * again, an end row, another route or the card away lets the pick go. An end
 * row glides there (`toEnd`), so a rider can look along the route from end
 * to end (the owner's ask, 2026-09-29).
 */
export function useRideTo(
  map: MapLibreMap | null,
  selected: VariantSummary | null,
  stops: readonly StopSummary[],
  opts: {
    /**
     * As a glide starts: where it puts the hintuan, or the end, from the
     * map's centre, in pixels — clear of a card over the map (clearOfSheet).
     */
    onGlide?: () => [number, number]
  } = {},
) {
  // Which direction the pick was made on: a pick belongs to its ride, so the
  // first render of another one — SWITCH, a new trip — never cuts its line
  // at the old row.
  const [picked, setPicked] = useState<{ variantId: string; rowId: string } | null>(null)
  const live = picked && picked.variantId === selected?.id ? picked : null

  // An end of the trip, picked from its row: the line stays whole, its dot
  // picked like a hintuan's (the owner's asks, 2026-09-29: "tapping
  // Novaliches should indicate green circle too", then the origin: "it
  // should have!"). One pick at a time with the hintuans; kept by
  // direction, as a pick is.
  const [atEnd, setAtEnd] = useState<{ variantId: string; end: 'from' | 'to' } | null>(null)
  const endPicked = selected && atEnd?.variantId === selected.id ? atEnd.end : null

  // A different direction is a different ride, and so is the same one opened
  // again: start it whole.
  useEffect(() => {
    setPicked(null)
    setAtEnd(null)
  }, [selected?.id])

  // Called as a glide starts, so a fresh function each render moves nothing.
  const onGlide = useRef(opts.onGlide)
  onGlide.current = opts.onGlide

  const cut = useMemo(
    () => (selected && live ? rideCut(selected, stops, live.rowId) : null),
    [selected, stops, live],
  )

  /** A hintuan row picks its ride (again puts it back); an end row passes null. */
  const selectedId = selected?.id
  const pick = useCallback(
    (id: string | null) => {
      setAtEnd(null)
      setPicked((cur) =>
        id === null || !selectedId || (cur?.variantId === selectedId && cur.rowId === id)
          ? null
          : { variantId: selectedId, rowId: id },
      )
    },
    [selectedId],
  )

  /**
   * An end row: the whole ride again, that end picked, and the map gliding
   * to it at the height it is at. A second tap lets it go, the map staying
   * put.
   */
  const toEnd = useCallback(
    (end: 'from' | 'to') => {
      setPicked(null)
      const on = endPicked !== end
      setAtEnd(on && selectedId ? { variantId: selectedId, end } : null)
      if (!on) return
      if (!map || !selected) return
      const line = travelLine(selected, stops)
      if (line.length < 2) return
      map.easeTo({ center: end === 'from' ? line[0] : line[line.length - 1], offset: onGlide.current?.() ?? [0, 0], duration: 700 }, APP_MOVE)
    },
    [map, selected, selectedId, stops, endPicked],
  )

  // Glide to where the rider would get off, at the height the map is at:
  // the owner tried the stretch fitted whole and it zoomed far out
  // (2026-09-28). `offset`, never `padding`: MapLibre keeps a padding for
  // every later move, and a shared link's fit or "Where am I" would land off
  // centre ever after.
  useEffect(() => {
    if (!map || !cut) return
    map.easeTo({ center: cut.at, offset: onGlide.current?.() ?? [0, 0], duration: 700 }, APP_MOVE)
  }, [map, cut])

  const pickedStop = live ? stops.find((s) => s.id === live.rowId) : undefined

  return {
    rideTo: cut && live ? { stopId: live.rowId, metres: cut.metres } : null,
    /** The row picked, cut or not: a row whose box the line misses is still shown picked, with nothing to price. */
    pickedId: live?.rowId ?? null,
    /**
     * Where the picked hintuan is: where the ride would end on the line, as
     * the glide goes; for a row whose box the line misses, the hintuan's own
     * point. Null with nothing picked.
     */
    pinAt: live ? (cut?.at ?? pickedStop?.point.coordinates ?? null) : null,
    /** The picked hintuan's name, as its row reads it: the circle's title on the map (HintuanPin). */
    pickedLabel: pickedStop ? stopLabel(pickedStop) : null,
    pick,
    /** The end picked from its row (`toEnd`), or null. */
    endPicked,
    toEnd,
  }
}
