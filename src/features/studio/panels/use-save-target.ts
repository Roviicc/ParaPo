import { useMemo } from 'react';

import { hotspotLabel, type HotspotRow } from '@/features/routes/model/hotspots';
import { placeKey } from '@/features/routes/model/places';
import { travelLine } from '@/features/routes/model/ride';
import { variantLine, type VariantRow } from '@/features/routes/model/routes';

import type { Drawing } from '../drawing/use-drawing';

/**
 * What a drawing will be saved into, read off what it was started from: the
 * direction being edited, or the route whose empty slot a return trip fills
 * and which way round that slot is; while extending, the places the chosen
 * direction runs between; and the place the drawing is headed for.
 */
export function useSaveTarget(draw: Drawing, variants: VariantRow[], hotspots: HotspotRow[]) {
  // What the save panel is saving into.
  const editing = draw.target.variantId
    ? (variants.find((v) => v.id === draw.target.variantId) ?? null)
    : null;
  const parentRoute =
    !editing && draw.target.routeId
      ? (variants.find((v) => v.route_id === draw.target.routeId)?.route ?? null)
      : null;
  // The direction this line is for: the route's slot with no line yet. Fixed
  // here rather than read off the drawing, so a return trip started from the
  // wrong end cannot land on top of the direction that already exists.
  const slotReversed = parentRoute
    ? (variants.find((v) => v.route_id === parentRoute.id && v.shape === null)?.reversed ?? null)
    : null;

  // While extending: the places the chosen direction runs between, in travel
  // order, and whether its stored line runs the other way round.
  const extendEnds = useMemo(() => {
    const v = draw.picking?.variant;
    if (!v) return null;
    const head = hotspots.find((s) => s.id === v.route.head_stop_id);
    const tail = hotspots.find((s) => s.id === v.route.tail_stop_id);
    if (!head || !tail) return null;
    const [from, to] = v.reversed ? [tail, head] : [head, tail];
    const travel = travelLine(v, hotspots);
    return {
      from: hotspotLabel(from),
      to: hotspotLabel(to),
      backwards: travel[0] !== variantLine(v)[0],
    };
  }, [draw.picking?.variant, hotspots]);

  // Where the line being drawn is going, when that is known: the far end of
  // the direction being edited, or of the route's slot a return trip fills.
  const destinationHotspotId = editing
    ? editing.reversed
      ? editing.route.head_stop_id
      : editing.route.tail_stop_id
    : parentRoute && slotReversed !== null
      ? slotReversed
        ? parentRoute.head_stop_id
        : parentRoute.tail_stop_id
      : null;
  const placeOfHotspot = (id: string | null) => {
    const s = id ? hotspots.find((x) => x.id === id) : undefined;
    return s ? placeKey(s) : null;
  };

  return { editing, parentRoute, slotReversed, extendEnds, destinationHotspotId, placeOfHotspot };
}

export type SaveTarget = ReturnType<typeof useSaveTarget>;
