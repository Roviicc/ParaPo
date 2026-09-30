import { useEffect, useMemo, useState } from 'react'
import type { Drawing } from '../drawing/useDrawing'
import { haversine, joinSegments, type LngLat } from '../../shared/geo/geo'
import { sharedMetres } from '../drawing/borrow'
import { directionName, isDrawn, routeName, variantLine, type RouteRow, type VariantRow } from '../../shared/model/routes'
import { hintuansAlong, timelineFor } from '../../shared/model/timeline'
import { stopLabel, type StopRow } from '../../shared/model/stops'
import { placeKey } from '../../shared/model/places'
import { lineOf } from '../data/live'

/**
 * What the save panel knows about the line being saved, from the ends picked
 * and the drawing: which way round it runs, whether that is the slot's way,
 * whether its ends already make a route or clash with another's, what an
 * Extend shares with its parent, the names it will get, and the timeline a
 * save would give it. Split from SavePanel.tsx, 2026-09-29.
 */
export function useSaveFacts({
  draw,
  existing,
  parent,
  slotReversed,
  stops,
  variants,
  head,
  tail,
  headId,
  tailId,
  via,
}: {
  draw: Drawing
  existing: VariantRow | null
  parent: RouteRow | null
  slotReversed: boolean | null
  stops: StopRow[]
  variants: VariantRow[]
  head: StopRow | undefined
  tail: StopRow | undefined
  headId: string
  tailId: string
  via: string
}) {
  const line = draw.controlPoints
  /**
   * Which way round this line runs, read off the geometry: whichever end it
   * starts nearest to is the end it starts from. Only a guess, and only used
   * for a brand-new route — an existing direction, or a route's empty slot,
   * already knows.
   */
  const drawnReversed = useMemo(() => {
    if (!head || !tail || line.length === 0) return null
    return haversine(line[0], tail.point.coordinates) < haversine(line[0], head.point.coordinates)
  }, [head, tail, line])
  const reversed = existing ? existing.reversed : (slotReversed ?? drawnReversed ?? false)
  // The slot says "SM Fairview → Tala" but the line starts at Tala: drawn the
  // wrong way round, or drawn as the outbound again. Say so; do not block —
  // a line can honestly begin nearer the far end than the near one.
  const wrongWayRound =
    !existing && slotReversed !== null && drawnReversed !== null && drawnReversed !== slotReversed

  // A new route whose ends already make a route: the save fills that route's
  // empty slot, or is refused when the direction is drawn (routesWrite).
  const sameEnds = useMemo(() => {
    if (parent || !headId || !tailId) return null
    const v = variants.find(
      (x) =>
        x.route.head_stop_id === headId &&
        x.route.tail_stop_id === tailId &&
        (x.route.via ?? '') === via.trim() &&
        x.reversed === reversed,
    )
    return v ? { name: v.route.name, drawn: isDrawn(v) } : null
  }, [parent, headId, tailId, via, reversed, variants])

  // Edit route, the ends changed: onto another route's (refused, as the
  // database would), or turned round (a direction's way round is kept
  // against its route's head, so a swap would mislabel both lines).
  const endsTaken = useMemo(() => {
    if (!existing || !headId || !tailId) return false
    return variants.some(
      (x) =>
        x.route_id !== existing.route_id &&
        x.route.head_stop_id === headId &&
        x.route.tail_stop_id === tailId &&
        (x.route.via ?? '') === via.trim(),
    )
  }, [existing, headId, tailId, via, variants])
  // By place, as the pickers choose: another box of the same place is the
  // same end.
  const headNow = existing ? stops.find((s) => s.id === existing.route.head_stop_id) : undefined
  const tailNow = existing ? stops.find((s) => s.id === existing.route.tail_stop_id) : undefined
  const turnedRound =
    !!existing &&
    !!head &&
    !!tail &&
    !!headNow &&
    !!tailNow &&
    placeKey(head) === placeKey(tailNow) &&
    placeKey(tail) === placeKey(headNow)

  // What an Extend borrowed: measured on the line as it is now, so a borrowed
  // point dragged away or undone is counted as it really is.
  const borrowFromId = draw.borrow?.variantId ?? existing?.borrowed_from ?? null
  const borrowPart = draw.borrow?.part ?? existing?.borrowed_part ?? null
  const borrowParent = borrowFromId ? (variants.find((v) => v.id === borrowFromId) ?? null) : null
  // The parent's full line: the list holds its overview (0009), which is the
  // same road but not the same points.
  const [parentFull, setParentFull] = useState<{ id: string; line: LngLat[] } | null>(null)
  useEffect(() => {
    if (!borrowFromId) return
    let live = true
    lineOf(borrowFromId).then(
      (l) => {
        if (live && l) setParentFull({ id: borrowFromId, line: l.coordinates })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [borrowFromId])
  /** How much of this line runs on the parent's line. */
  const borrowedOn = (parentLine: LngLat[]) => {
    if (!borrowPart) return 0
    const line = joinSegments(draw.segments)
    // Either way round: a line followed from a right-click is copied in the
    // jeep's order, which is the other way when its parent was stored from
    // the far end.
    return Math.max(
      sharedMetres(line, parentLine, borrowPart),
      sharedMetres(line, [...parentLine].reverse(), borrowPart),
    )
  }
  // What the panel shows while the parent's full line is on its way: its
  // overview's figure. The save measures on the full line (borrowedForSave).
  const borrowedM = useMemo(() => {
    if (!borrowParent || !borrowPart) return 0
    return borrowedOn(parentFull?.id === borrowParent.id ? parentFull.line : variantLine(borrowParent))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowParent, borrowPart, draw.segments, parentFull])
  /**
   * The borrow as a save writes it: on the parent's full line, never its
   * overview (0009), read now if it has not come — on an overview a shared
   * stretch reads as none, and the save would forget where the line came from.
   */
  const borrowedForSave = async (): Promise<number> => {
    if (!borrowParent || !borrowPart || parentFull?.id === borrowParent.id) return borrowedM
    const full = await lineOf(borrowParent.id)
    return full ? borrowedOn(full.coordinates) : 0
  }

  const name = head && tail ? routeName(stopLabel(head), stopLabel(tail), via) : ''
  const direction = head && tail ? directionName(stopLabel(head), stopLabel(tail), reversed) : ''
  // The snapped geometry, not the control points: a box between two clicks
  // still counts, and this is the line the save will check.
  const preview = useMemo(() => {
    const line = joinSegments(draw.segments)
    return timelineFor(head, tail, reversed, hintuansAlong(line, stops).map((a) => a.stop), line[0])
  }, [head, tail, reversed, draw.segments, stops])

  return { reversed, wrongWayRound, sameEnds, endsTaken, turnedRound, borrowParent, borrowPart, borrowedM, borrowedForSave, name, direction, preview }
}
