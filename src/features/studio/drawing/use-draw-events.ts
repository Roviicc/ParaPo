import type { MapLibreMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { useEffect, type RefObject } from 'react';

import { ROUTES_HIT_LAYER, tapBox } from '@/features/routes/map/tap';
import type { LngLat, Segment, SnapMode } from '@/shared/utils/geo';

import { nearestSpot } from './borrow';
import { CLOSING, HIT_LAYER, POINT_LAYER } from './draw-layers';
import type { AreaTarget, Borrow, FollowOffer, Picking } from './use-drawing';

/** A tap this many pixels off the line being extended does not pick a spot on it. */
const PICK_PX = 40;

/**
 * A finger within this many pixels of one of the drawing's points is on that
 * point, the nearest one winning. A dot is 6 px across its middle; a finger is
 * not, and a tap just beside a dot was inserting a second point on the line
 * under it.
 */
const FINGER_PX = 20;
/** A finger on a point drags it once it has moved this far: less is a tap. */
const DRAG_START_PX = 6;
/** A finger held this long without moving is a long-press, which adds nothing. */
const LONG_PRESS_MS = 500;
/**
 * After a touch the browser sends a click of its own. One arriving this soon
 * after a touch the drawing has already answered is that touch's echo, not a
 * second press. (Android's contextmenu on a long-press MapLibre drops itself:
 * after a touch it ignores contextmenu until a real mouse button goes down.)
 */
const ECHO_MS = 700;

interface IndexedFeature {
  properties?: { index?: number };
}

/**
 * The drawing's pointer, while drawing: a click on the map adds a point, on
 * the line inserts one (shift: straightens that stretch), a drag moves a
 * point (its two stretches rubber-band, then re-route on release), a
 * right-click on a point deletes it and on a saved line asks to follow it;
 * while picking where an Extend leaves a line, a tap near it picks the spot.
 *
 * A finger does the same through touch events: a drag from a point moves it,
 * and a second finger puts it back and pinches instead. A tap or a long-press
 * on or beside a point selects it, for the point bar's Delete and stretch
 * buttons; the next tap on the map only closes that bar. A tap that adds a
 * point on a saved line offers to follow that line instead, which is the
 * right-click's job on a desktop.
 *
 * The handlers are bound once per drawing and read the drawing through its
 * refs, which every mutator keeps current.
 */
export function useDrawEvents(
  map: MapLibreMap | null,
  drawing: boolean,
  refs: {
    points: RefObject<LngLat[]>;
    segments: RefObject<Segment[]>;
    area: RefObject<AreaTarget | null>;
    picking: RefObject<Picking | null>;
    join: RefObject<LngLat | null>;
    borrow: RefObject<Borrow | null>;
    follow: RefObject<((directionIds: string[], at: LngLat, offered?: LngLat) => void) | undefined>;
    selected: RefObject<number | null>;
  },
  actions: {
    setPicking: (p: Picking) => void;
    addPoint: (point: LngLat) => Promise<void>;
    insertPoint: (gap: number, point: LngLat) => Promise<void>;
    deletePoint: (idx: number) => Promise<void>;
    toggleSegment: (gap: number) => Promise<void>;
    resolveGaps: (first: number, modes: SnapMode[]) => Promise<void>;
    writePoints: (pts: LngLat[]) => void;
    writeSegments: (next: Segment[]) => void;
    markStandIn: (s: Segment) => void;
    isStandIn: (s: Segment) => boolean;
    select: (i: number | null) => void;
    setFollowOffer: (o: FollowOffer | null) => void;
  },
): void {
  const {
    setPicking,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
    resolveGaps,
    writePoints,
    writeSegments,
    markStandIn,
    isStandIn,
    select,
    setFollowOffer,
  } = actions;
  useEffect(() => {
    if (!map || !drawing) return;
    if (!map.getLayer(POINT_LAYER) || !map.getLayer(HIT_LAYER)) return;

    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';
    // A finger held on the map is a long-press, not a call for iOS's callout.
    canvas.style.setProperty('-webkit-touch-callout', 'none');

    // Shift+drag is MapLibre's box zoom and it swallows shift+click, which is
    // our "straighten this segment" gesture. Double-click zoom would fire on a
    // quick pair of route clicks. Neither belongs in drawing mode.
    map.boxZoom.disable();
    map.doubleClickZoom.disable();

    // The finger on the map, if one is: where it went down, the point it is
    // on, and whether it has been held long. `before` is the drawing as it
    // was, kept while its point is dragged so that a second finger can put it
    // back.
    let touch: {
      start: { x: number; y: number };
      idx: number | null;
      long: boolean;
      timer: ReturnType<typeof setTimeout>;
      before: { points: LngLat[]; segments: Segment[]; join: LngLat | null } | null;
    } | null = null;
    // Until when a click is the echo of a touch already answered, and when
    // the last touch ended: a click soon after that came from a finger.
    let echoUntil = -Infinity;
    let lastTouchEnd = -Infinity;
    const isEcho = () => performance.now() < echoUntil;
    const fromFinger = () => performance.now() - lastTouchEnd < ECHO_MS;

    /**
     * A tap while the point bar is open closes it and does nothing else, so
     * that tapping the map to put the bar away never adds a point.
     */
    const closesBar = () => {
      setFollowOffer(null);
      if (refs.selected.current === null) return false;
      select(null);
      return true;
    };

    /**
     * After a finger adds a point on a saved line, while drawing a route that
     * has a point before it and follows no line yet: offer to follow that one.
     */
    const offerFollow = (e: MapMouseEvent, point: LngLat) => {
      if (!fromFinger() || refs.area.current || refs.join.current || refs.borrow.current) return;
      if (refs.points.current.length < 2 || !map.getLayer(ROUTES_HIT_LAYER)) return;
      const ids = [
        ...new Set(
          map
            .queryRenderedFeatures(tapBox(e.point, e.originalEvent), { layers: [ROUTES_HIT_LAYER] })
            .map((f) => f.properties?.id)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ];
      if (ids.length > 0) setFollowOffer({ ids, at: point, point });
    };

    // Clicking empty map appends a point; clicking the route itself does not.
    const onMapClick = (e: MapMouseEvent) => {
      if (isEcho() || closesBar()) return;
      // Choosing where a new route leaves a saved one: a tap near its line
      // picks the nearest spot on it; a tap elsewhere is ignored.
      const p = refs.picking.current;
      if (p) {
        const spot = nearestSpot(p.direction.segments ?? [], [e.lngLat.lng, e.lngLat.lat]);
        if (!spot) return;
        const px = map.project(spot.point);
        if (Math.hypot(px.x - e.point.x, px.y - e.point.y) > PICK_PX) return;
        const next = { direction: p.direction, spot };
        refs.picking.current = next;
        setPicking(next);
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [POINT_LAYER, HIT_LAYER],
      });
      if (hits.length > 0) return;
      const point: LngLat = [e.lngLat.lng, e.lngLat.lat];
      void addPoint(point);
      offerFollow(e, point);
    };

    const onLineClick = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      if (isEcho() || closesBar()) return;
      // A click on a point's dot is a press on that point, not a click on the
      // line beneath it: inserting here would stack a second point on the first.
      if (map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] }).length > 0) return;
      const gap = e.features?.[0]?.properties?.index;
      if (typeof gap !== 'number') return;
      // Clicking the closing edge of a hotspot appends a corner: the ring
      // re-closes through the new point, which is what "insert here" means
      // on that edge. Nothing to straighten — area edges are already straight.
      if (gap === CLOSING) {
        if (!e.originalEvent.shiftKey) void addPoint([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      if (e.originalEvent.shiftKey) {
        if (!refs.area.current) void toggleSegment(gap);
      } else void insertPoint(gap, [e.lngLat.lng, e.lngLat.lat]);
    };

    const onPointContext = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      e.preventDefault();
      const idx = e.features?.[0]?.properties?.index;
      if (typeof idx === 'number') void deletePoint(idx);
    };

    // A right-click on a saved line — not on one of the drawing's points,
    // which deletes it — asks to join that line and follow it to its end.
    const onMapContext = (e: MapMouseEvent) => {
      if (refs.area.current || refs.picking.current || !refs.follow.current) return;
      if (!map.getLayer(ROUTES_HIT_LAYER)) return;
      if (map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER] }).length > 0) return;
      const ids = [
        ...new Set(
          map
            .queryRenderedFeatures(e.point, { layers: [ROUTES_HIT_LAYER] })
            .map((f) => f.properties?.id)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ];
      if (ids.length === 0) return;
      e.preventDefault();
      refs.follow.current(ids, [e.lngLat.lng, e.lngLat.lat]);
    };

    let dragIdx: number | null = null;
    let dragMoved = false;
    let dragModes: [SnapMode | undefined, SnapMode | undefined] = [undefined, undefined];

    /** The point being dragged follows the pointer; its two stretches rubber-band. */
    const dragTo = (point: LngLat) => {
      const i = dragIdx;
      if (i === null) return;
      dragMoved = true;
      const pts = [...refs.points.current];
      if (pts[i] === refs.join.current) refs.join.current = point;
      pts[i] = point;
      writePoints(pts);

      // Rubber-band the two neighbours while dragging; they re-route on release.
      const next = [...refs.segments.current];
      if (i > 0 && pts[i - 1]) {
        next[i - 1] = { snap: dragModes[0] ?? 'snapped', coordinates: [pts[i - 1], point] };
        markStandIn(next[i - 1]);
      }
      if (i < pts.length - 1 && pts[i + 1]) {
        next[i] = { snap: dragModes[1] ?? 'snapped', coordinates: [point, pts[i + 1]] };
        markStandIn(next[i]);
      }
      writeSegments(next);
    };

    const onDragMove = (e: MapMouseEvent) => dragTo([e.lngLat.lng, e.lngLat.lat]);

    /** A drag let go, by mouse or finger: point `i` has moved, or not. */
    const settleDrag = (i: number | null) => {
      // A press and release that never moved is not an edit: both segments are
      // still right, so the router is not asked again.
      if (i === null || !dragMoved) return;
      // Only the two segments touching the moved point are stale, and they go
      // to the router together, as one request.
      const before = dragModes[0] ?? 'snapped';
      const after = dragModes[1] ?? 'snapped';
      const last = refs.points.current.length - 1;
      if (i > 0 && i < last) void resolveGaps(i - 1, [before, after]);
      else if (i > 0) void resolveGaps(i - 1, [before]);
      else if (i < last) void resolveGaps(i, [after]);
    };

    const onDragEnd = () => {
      const i = dragIdx;
      dragIdx = null;
      map.off('mousemove', onDragMove);
      map.off('mouseup', onDragEnd);
      document.removeEventListener('mouseup', onDragEnd);
      canvas.style.cursor = 'crosshair';
      map.dragPan.enable();
      settleDrag(i);
    };

    const onPointDown = (e: MapMouseEvent & { features?: IndexedFeature[] }) => {
      const idx = e.features?.[0]?.properties?.index;
      if (typeof idx !== 'number') return;
      // Left button only. A right-click must reach the contextmenu handler;
      // starting a drag here would swallow it.
      if (e.originalEvent.button !== 0) return;
      e.preventDefault();
      dragIdx = idx;
      dragMoved = false;
      dragModes = [refs.segments.current[idx - 1]?.snap, refs.segments.current[idx]?.snap];
      canvas.style.cursor = 'grabbing';
      map.dragPan.disable();
      map.on('mousemove', onDragMove);
      map.once('mouseup', onDragEnd);
      // MapLibre reports mouseup only over the map. Released over the toolbar,
      // the drag would never end and its stand-ins would stay.
      document.addEventListener('mouseup', onDragEnd);
    };

    /** The drawing's point nearest a finger at `p`, if one is within reach. */
    const pointUnderFinger = (p: { x: number; y: number }): number | null => {
      let best: number | null = null;
      let bestPx = FINGER_PX;
      refs.points.current.forEach((c, i) => {
        const q = map.project(c);
        const px = Math.hypot(q.x - p.x, q.y - p.y);
        if (px <= bestPx) {
          best = i;
          bestPx = px;
        }
      });
      return best;
    };

    /**
     * The fingers on the map, in its pixels. A touch event lists every finger
     * on the screen, and MapLibre's points and centre count them all, so a
     * thumb resting on the toolbar would turn one finger on a point into a
     * pinch, and its lifting would never end the drag.
     */
    const container = map.getCanvasContainer();
    const fingersOnMap = (e: TouchEvent) => {
      const r = container.getBoundingClientRect();
      return [...e.touches]
        .filter((f) => container.contains(f.target as Node))
        .map((f) => ({ x: f.clientX - r.left, y: f.clientY - r.top }));
    };

    // A finger on a point holds the map still, so that a drag moves the point
    // rather than panning; anywhere else the map pans and pinches as ever.
    const onTouchStart = (e: MapTouchEvent) => {
      // A new touch: whatever click the last one was owed has come by now.
      echoUntil = -Infinity;
      const fingers = fingersOnMap(e.originalEvent);
      if (touch) {
        putBack();
        if (fingers.length > 1) return;
      }
      const one = fingers.length === 1 ? fingers[0] : null;
      const idx = refs.picking.current || !one ? null : pointUnderFinger(one);
      const timer = setTimeout(() => {
        if (touch) touch.long = true;
      }, LONG_PRESS_MS);
      touch = { start: one ?? e.point, idx, long: false, timer, before: null };
      if (idx !== null) map.dragPan.disable();
    };

    const onTouchMove = (e: MapTouchEvent) => {
      const t = touch;
      const fingers = fingersOnMap(e.originalEvent);
      if (!t || fingers.length !== 1) return;
      const p = fingers[0];
      if (Math.hypot(p.x - t.start.x, p.y - t.start.y) < DRAG_START_PX && dragIdx === null) return;
      clearTimeout(t.timer);
      if (t.idx === null) return;
      if (dragIdx === null) {
        dragIdx = t.idx;
        dragMoved = false;
        dragModes = [refs.segments.current[t.idx - 1]?.snap, refs.segments.current[t.idx]?.snap];
        t.before = {
          points: refs.points.current,
          segments: refs.segments.current,
          join: refs.join.current,
        };
      }
      const at = map.unproject([p.x, p.y]);
      dragTo([at.lng, at.lat]);
    };

    // A second finger, or a touch the browser cancelled: the point being
    // dragged goes back where it was and the map is free again, to pinch.
    // Nothing this touch did is kept.
    const putBack = () => {
      const t = touch;
      if (!t) return;
      clearTimeout(t.timer);
      const i = dragIdx;
      if (i !== null && t.before) {
        refs.join.current = t.before.join;
        writePoints(t.before.points);
        writeSegments(t.before.segments);
        // A stretch beside the point that was still waiting for the router
        // lost its request when the drag replaced it: ask again.
        const before = t.before.segments[i - 1];
        const after = t.before.segments[i];
        const waitingBefore = !!before && isStandIn(before);
        const waitingAfter = !!after && isStandIn(after);
        if (waitingBefore && waitingAfter) void resolveGaps(i - 1, [before.snap, after.snap]);
        else if (waitingBefore) void resolveGaps(i - 1, [before.snap]);
        else if (waitingAfter) void resolveGaps(i, [after.snap]);
      }
      dragIdx = null;
      if (t.idx !== null) map.dragPan.enable();
      t.idx = null;
    };

    const onTouchCancel = () => {
      putBack();
      touch = null;
    };

    const onTouchEnd = (e: MapTouchEvent) => {
      // One finger of two lifted: the gesture is not over.
      if (fingersOnMap(e.originalEvent).length > 0) return;
      const t = touch;
      touch = null;
      lastTouchEnd = performance.now();
      if (!t) return;
      clearTimeout(t.timer);
      // A press on a point and a long-press are answered here; the click the
      // browser sends after them must not add a point as well. (A finger that
      // moved past the browser's slop panned the map, and gets no click.)
      if (t.idx !== null || t.long) echoUntil = performance.now() + ECHO_MS;
      if (t.idx === null) return;
      const i = dragIdx;
      dragIdx = null;
      map.dragPan.enable();
      if (i === null) {
        setFollowOffer(null);
        select(t.idx);
      } else settleDrag(i);
    };

    const enterPoint = () => {
      if (dragIdx === null) canvas.style.cursor = 'grab';
    };
    const enterLine = () => {
      if (dragIdx === null) canvas.style.cursor = 'copy';
    };
    const leave = () => {
      if (dragIdx === null) canvas.style.cursor = 'crosshair';
    };

    // The line's handler first: MapLibre calls click listeners in the order
    // they were added, and a tap on the line that closes the point bar must
    // close it there, before onMapClick has cleared the selection it reads.
    map.on('click', HIT_LAYER, onLineClick);
    map.on('click', onMapClick);
    map.on('mousedown', POINT_LAYER, onPointDown);
    map.on('contextmenu', POINT_LAYER, onPointContext);
    map.on('contextmenu', onMapContext);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);
    map.on('mouseenter', POINT_LAYER, enterPoint);
    map.on('mouseleave', POINT_LAYER, leave);
    map.on('mouseenter', HIT_LAYER, enterLine);
    map.on('mouseleave', HIT_LAYER, leave);

    return () => {
      map.off('click', onMapClick);
      map.off('click', HIT_LAYER, onLineClick);
      map.off('mousedown', POINT_LAYER, onPointDown);
      map.off('contextmenu', POINT_LAYER, onPointContext);
      map.off('contextmenu', onMapContext);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
      if (touch) clearTimeout(touch.timer);
      map.off('mouseenter', POINT_LAYER, enterPoint);
      map.off('mouseleave', POINT_LAYER, leave);
      map.off('mouseenter', HIT_LAYER, enterLine);
      map.off('mouseleave', HIT_LAYER, leave);
      map.off('mousemove', onDragMove);
      map.off('mouseup', onDragEnd);
      document.removeEventListener('mouseup', onDragEnd);
      map.dragPan.enable();
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
      canvas.style.cursor = '';
      canvas.style.removeProperty('-webkit-touch-callout');
    };
  }, [
    map,
    drawing,
    refs,
    setPicking,
    addPoint,
    insertPoint,
    deletePoint,
    toggleSegment,
    resolveGaps,
    writePoints,
    writeSegments,
    markStandIn,
    isStandIn,
    select,
    setFollowOffer,
  ]);
}
