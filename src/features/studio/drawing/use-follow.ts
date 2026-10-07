import { coarsePointer } from '@/features/routes/map/tap';
import type { HotspotRow } from '@/features/routes/model/hotspots';
import { travelLine } from '@/features/routes/model/ride';
import {
  isDrawn,
  directionLine,
  type DirectionDrawing,
  type DirectionRow,
} from '@/features/routes/model/routes';
import type { LngLat } from '@/shared/utils/geo';

import { lineToFollow } from './borrow';
import type { Drawing } from './use-drawing';
import { withDrawing } from '../data/live';
import type { SaveTarget } from '../panels/use-save-target';

/**
 * Two ways a saved direction comes into the drawing: `opening` reads its
 * drawing (the list carries none) and hands it on, and `onFollow` — a
 * right-click on saved lines while drawing — joins the one going the way the
 * drawing goes and follows it to its end. Problems are notices.
 */
export function useFollow({
  draw,
  directions,
  hotspots,
  target,
  setNotice,
}: {
  draw: Drawing;
  directions: DirectionRow[];
  hotspots: HotspotRow[];
  target: SaveTarget;
  setNotice: (text: string) => void;
}) {
  /**
   * A right-click on saved lines while drawing, or a finger's Follow chip
   * (PointBar.tsx): join the one going the way
   * the drawing goes — preferring one that ends where the drawing is headed —
   * and follow it to its end. The two directions of a route often share a
   * road, so the click may land on both.
   */
  const onFollow = (ids: string[], at: LngLat, offered?: LngLat) => {
    const gate = draw.joinGate();
    if (!gate.go) {
      if (gate.problem) setNotice(gate.problem);
      return;
    }
    const home = target.placeOfHotspot(target.destinationHotspotId);
    const options = ids
      .map((id) => directions.find((v) => v.id === id))
      .filter((v): v is DirectionRow => !!v && isDrawn(v))
      .map((v) => ({
        v,
        travel: travelLine(v, hotspots),
        endsAtDestination:
          home !== null &&
          target.placeOfHotspot(v.reversed ? v.route.headHotspotId : v.route.tailHotspotId) ===
            home,
      }));
    // The line now, without the point an offer would drop: the render's
    // `draw.line` is a step behind the edits that led here.
    const choice = lineToFollow(options, draw.lineNow(offered), at);
    if (!choice) return;
    if ('against' in choice) {
      setNotice(
        `${choice.against.v.name} runs the other way here. ${coarsePointer() ? 'Follow' : 'Right-click'} a line going the way you are drawing.`,
      );
      return;
    }
    const v = choice.follow.v;
    const backwards = choice.follow.travel[0] !== directionLine(v)[0];
    void opening(v, (d) => {
      const problem = draw.connect(d, at, backwards, offered);
      if (problem) setNotice(problem);
    });
  };

  /**
   * A direction's drawing is not in the list (live.ts DIRECTION_SELECT): read
   * it for the one being opened, then hand it to the tool. A read that fails
   * is a notice, and the tool is never started on an empty drawing.
   */
  const opening = async (v: DirectionRow, then: (d: DirectionDrawing) => void) => {
    try {
      then(await withDrawing(v));
    } catch (e) {
      setNotice(
        `Couldn't open ${v.name ?? 'this direction'}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return { onFollow, opening };
}
