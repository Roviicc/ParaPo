import type { LngLat } from '../../shared/geo/geo'
import { isDrawn, travelLine, variantLine, type VariantDrawing, type VariantRow } from '../../shared/model/routes'
import type { StopRow } from '../../shared/model/stops'
import { withDrawing } from '../data/live'
import type { SaveTarget } from '../panels/useSaveTarget'
import { lineToFollow } from './borrow'
import type { Drawing } from './useDrawing'

/**
 * Two ways a saved direction comes into the drawing: `opening` reads its
 * drawing (the list carries none) and hands it on, and `onFollow` — a
 * right-click on saved lines while drawing — joins the one going the way the
 * drawing goes and follows it to its end. Problems are notices.
 */
export function useFollow({
  draw,
  variants,
  stops,
  target,
  setNotice,
}: {
  draw: Drawing
  variants: VariantRow[]
  stops: StopRow[]
  target: SaveTarget
  setNotice: (text: string) => void
}) {
  /**
   * A right-click on saved lines while drawing: join the one going the way
   * the drawing goes — preferring one that ends where the drawing is headed —
   * and follow it to its end. The two directions of a route often share a
   * road, so the click may land on both.
   */
  const onFollow = (ids: string[], at: LngLat) => {
    const gate = draw.joinGate()
    if (!gate.go) {
      if (gate.problem) setNotice(gate.problem)
      return
    }
    const home = target.placeOfStop(target.destinationStopId)
    const options = ids
      .map((id) => variants.find((v) => v.id === id))
      .filter((v): v is VariantRow => !!v && isDrawn(v))
      .map((v) => ({
        v,
        travel: travelLine(v, stops),
        endsAtDestination:
          home !== null && target.placeOfStop(v.reversed ? v.route.head_stop_id : v.route.tail_stop_id) === home,
      }))
    const choice = lineToFollow(options, draw.line, at)
    if (!choice) return
    if ('against' in choice) {
      setNotice(
        `${choice.against.v.direction_name} runs the other way here. Right-click a line going the way you are drawing.`,
      )
      return
    }
    const v = choice.follow.v
    const backwards = choice.follow.travel[0] !== variantLine(v)[0]
    void opening(v, (d) => {
      const problem = draw.connect(d, at, backwards)
      if (problem) setNotice(problem)
    })
  }

  /**
   * A direction's drawing is not in the list (live.ts VARIANT_SELECT): read
   * it for the one being opened, then hand it to the tool. A read that fails
   * is a notice, and the tool is never started on an empty drawing.
   */
  const opening = async (v: VariantRow, then: (d: VariantDrawing) => void) => {
    try {
      then(await withDrawing(v))
    } catch (e) {
      setNotice(`Couldn't open ${v.direction_name ?? 'this direction'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { onFollow, opening }
}
