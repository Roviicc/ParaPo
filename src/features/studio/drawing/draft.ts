import { useEffect, type RefObject } from 'react';

import type { LngLat, Segment } from '@/shared/utils/geo';

import type { AreaTarget, Borrow, Target } from './use-drawing';

/**
 * An in-progress drawing lives here until it is saved or discarded. Signing in
 * via magic link reloads the page, and a refresh is one keystroke away; either
 * would otherwise throw away twenty minutes of clicking.
 *
 * The key and the shape are a contract: six suites and check-build read them.
 */
const DRAFT_KEY = 'parapo.draft.v1';

/** A gap still waiting for the router when the draft was written is marked `pending`. */
export type DraftSegment = Segment & { pending?: boolean };

export interface Draft {
  controlPoints: LngLat[];
  segments: DraftSegment[];
  target: Target;
  area?: AreaTarget | null;
  borrow?: Borrow | null;
  /** Index of the join point, when new points go in before a borrowed end. */
  join?: number | null;
}

/**
 * The draft as it is stored: the keys the contract was written with, where a
 * direction is `variantId` and a hotspot `stopId` (the database's words). The
 * app says directionId and hotspotId (CONTEXT.md, 2026-10-07); this file is
 * the one place that translates, so a draft left by an older build still reads
 * and the suites that write one still hold.
 */
interface StoredDraft {
  controlPoints: LngLat[];
  segments: DraftSegment[];
  target: { routeId: string | null; variantId: string | null };
  area?: { kind: AreaTarget['kind']; stopId: string | null } | null;
  borrow?: { variantId: string; part: Borrow['part'] } | null;
  join?: number | null;
}

const toStored = (d: Draft): StoredDraft => ({
  controlPoints: d.controlPoints,
  segments: d.segments,
  target: { routeId: d.target.routeId, variantId: d.target.directionId },
  area: d.area ? { kind: d.area.kind, stopId: d.area.hotspotId } : d.area,
  borrow: d.borrow ? { variantId: d.borrow.directionId, part: d.borrow.part } : d.borrow,
  join: d.join,
});

const fromStored = (d: StoredDraft): Draft => ({
  controlPoints: d.controlPoints,
  segments: d.segments,
  target: { routeId: d.target.routeId, directionId: d.target.variantId },
  area: d.area ? { kind: d.area.kind, hotspotId: d.area.stopId } : d.area,
  borrow: d.borrow ? { directionId: d.borrow.variantId, part: d.borrow.part } : d.borrow,
  join: d.join,
});

/** The draft on this device, or null: none, unreadable, or with no points. */
export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    return Array.isArray(d.controlPoints) && d.controlPoints.length > 0 ? fromStored(d) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the draft in step with the drawing: written while there are points,
 * gone when there are none or the drawing ends. A segment still waiting for
 * the router (`isStandIn`) is written `pending`, so a reload asks again.
 */
export function useDraftSaving(
  state: {
    drawing: boolean;
    controlPoints: LngLat[];
    segments: Segment[];
    target: Target;
    area: AreaTarget | null;
    borrow: Borrow | null;
  },
  joinRef: RefObject<LngLat | null>,
  isStandIn: (s: Segment) => boolean,
): void {
  const { drawing, controlPoints, segments, target, area, borrow } = state;
  useEffect(() => {
    try {
      if (drawing && controlPoints.length > 0) {
        const marked: DraftSegment[] = segments.map((s) =>
          s && isStandIn(s) ? { ...s, pending: true } : s,
        );
        const join = joinRef.current ? controlPoints.indexOf(joinRef.current) : -1;
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(
            toStored({
              controlPoints,
              segments: marked,
              target,
              area,
              borrow,
              join: join === -1 ? null : join,
            }),
          ),
        );
      } else {
        // Not drawing, or drawing with every point undone: nothing to keep.
        // Only the first was cleared once, so a reload brought back what Undo
        // had taken away (finding 12).
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* storage unavailable: drafts simply do not persist */
    }
  }, [drawing, controlPoints, segments, target, area, borrow, joinRef, isStandIn]);
}
