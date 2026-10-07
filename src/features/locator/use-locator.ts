import type { MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Turn } from '@/shared/hooks/commit-turn';
import type { Snap } from '@/shared/ui/sheet-gesture';
import { haversine, zoomForScale, type LngLat } from '@/shared/utils/geo';

import type { LocatorMode } from './locator-button';

/**
 * The visitor's own place on the map, and the camera with them: the owner's
 * LocatorButton rules (3870:5408, 2026-10-01), in "Where am I"'s place
 * (2026-09-26). Off until asked, then the browser's own permission prompt;
 * the position never leaves the phone — nothing here talks to a server, and
 * nothing stores it. Once on it stays on (the owner, 2026-10-01: no off, as
 * Google Maps has none); the button only moves the camera:
 *
 *  - LocationOff, no location yet: a tap asks the browser for it, and its
 *    first fix brings the camera as TrackOwnLocation's tap does.
 *  - TrackOwnLocation, the camera elsewhere — the moment it moves off the
 *    visitor at all, by a finger or by the app. A tap brings it to them at
 *    the zoom it is at; from further out than 2 km on the scale bar, in to
 *    200 m (trackedZoom).
 *  - TrackedLocation, the camera on them, north up, following each fix. A
 *    tap turns on the compass.
 *  - TracksTheMapBasedOnCompassFacing, the camera tilted, 200 m on the bar,
 *    turned the way the phone faces. A tap goes back to TrackedLocation's
 *    view, at its zoom, and the next to this again.
 *
 * With no compass to read (a laptop: the owner, 2026-10-01) a tap on
 * TrackedLocation brings the camera back to the visitor instead.
 */

export type LocatorStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

/** Where the camera is with the visitor: elsewhere, on them, on them turned with the phone. */
export type Camera = 'free' | 'tracked' | 'compass';

export interface Fix {
  at: LngLat;
  /** Metres, the browser's 68 % radius. */
  accuracy: number;
  /** Metres a second, the browser's or derived from the last fixes. */
  speed: number;
  /** Degrees clockwise from north, from the fixes; null until they have shown one. */
  heading: number | null;
  time: number;
}

/** Below this the GPS's own heading is noise: a slow shuffle, or drift while still. */
export const STILL_BELOW_MPS = 0.5;

/**
 * The camera's "height", as the owner reads it (2026-10-01): the map's scale
 * bar, metres per SCALE_PX on the screen (geo.ts). A tap to the visitor keeps the
 * zoom the map is at — "it must not change the camera view height" —
 * unless the bar reads more than FAR_SCALE_M, when it comes in to
 * TRACKED_SCALE_M; the compass view is COMPASS_SCALE_M. Metres across the
 * screen before (200 and 100, and 1000 and 200 ft before that), which read
 * on the bar as some 50 and 20.
 */
export const TRACKED_SCALE_M = 200;
export const COMPASS_SCALE_M = 200;
export const FAR_SCALE_M = 2000;

/**
 * The accuracy circle shows the fix's own radius, held between these (the
 * owner's, 2026-10-01; capped at 150 before): a fix indoors or off the wifi
 * can say 1 km, and a good one 3 m — a circle under the dot.
 */
export const ACCURACY_MIN_M = 40;
export const ACCURACY_MAX_M = 80;
/** How far the compass view tilts: "slightly ... diagonally", as Google's does. */
export const COMPASS_PITCH = 45;

/**
 * How big the dot and its beam are drawn at `zoom`, as Google Maps' stays
 * small zoomed out (the owner's ask, 2026-10-01: "at zoomed out it's 10/10
 * so big"): Figma's full size from street level in, shrinking with each
 * zoom out to SMALLEST at city level, and no smaller, so it is still seen —
 * a fifth bigger than at first (0.45), the owner's "make it like 12/10"
 * the same day.
 */
export function indicatorScale(zoom: number): number {
  const FULL_FROM = 16;
  const SMALLEST_AT = 12;
  const SMALLEST = 0.54;
  const t = Math.min(1, Math.max(0, (zoom - SMALLEST_AT) / (FULL_FROM - SMALLEST_AT)));
  return SMALLEST + (1 - SMALLEST) * t;
}

/**
 * The button's look for where the camera is, and whether there is a fix to
 * be on: none yet — not asked, refused, asking, or no fix in — is
 * LocationOff (the owner's, 2026-10-01), and a tap asks for it.
 */
export function modeFor(camera: Camera, located: boolean): LocatorMode {
  if (!located) return 'LocationOff';
  if (camera === 'free') return 'TrackOwnLocation';
  return camera === 'tracked' ? 'TrackedLocation' : 'TracksTheMapBasedOnCompassFacing';
}

/** Where a tap takes the camera: to the visitor; then round, tracked ⇄ compass, once the phone's compass has been read. */
export function afterTap(camera: Camera, compass: boolean): Camera {
  return camera === 'tracked' && compass ? 'compass' : 'tracked';
}

/**
 * The zoom a tap to the visitor keeps: the map's own, unless its scale bar
 * reads more than FAR_SCALE_M, when it comes in to TRACKED_SCALE_M.
 */
export function trackedZoom(current: number, lat: number): number {
  return current < zoomForScale(FAR_SCALE_M, lat) ? zoomForScale(TRACKED_SCALE_M, lat) : current;
}

/** The accuracy circle's radius for a fix this good. */
export const circleRadius = (accuracy: number) =>
  Math.min(ACCURACY_MAX_M, Math.max(ACCURACY_MIN_M, accuracy));

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180;
  const dLng = (b[0] - a[0]) * r;
  const [la, lb] = [a[1] * r, b[1] * r];
  const y = Math.sin(dLng) * Math.cos(lb);
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Degrees between two headings, the short way round. */
export function apart(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/**
 * Speed and heading from a run of fixes, for a browser that gives neither
 * (a laptop, an emulator, many phones indoors). The last fix against the
 * newest one at least 2 s older, so two fixes a second apart do not read
 * GPS jitter as a sprint; heading only once they are further apart than
 * the jitter, else the last known heading.
 */
export function motionFrom(
  fixes: readonly { at: LngLat; accuracy: number; time: number }[],
  lastHeading: number | null,
): { speed: number; heading: number | null } {
  const last = fixes[fixes.length - 1];
  if (!last) return { speed: 0, heading: lastHeading };
  let ref: (typeof fixes)[number] | null = null;
  for (let i = fixes.length - 2; i >= 0; i--) {
    if (last.time - fixes[i].time >= 2000) {
      ref = fixes[i];
      break;
    }
  }
  if (!ref) return { speed: 0, heading: lastHeading };
  const metres = haversine(ref.at, last.at);
  const speed = metres / ((last.time - ref.time) / 1000);
  const heading =
    metres > Math.max(3, Math.min(ref.accuracy, last.accuracy) / 4)
      ? bearing(ref.at, last.at)
      : lastHeading;
  return { speed, heading };
}

/** What a phone's orientation event says, as far as a heading goes. */
export interface Orientation {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
}

/**
 * The way the phone's top faces, degrees clockwise from north, turned for
 * a screen held sideways: Safari's own compass heading, or an absolute
 * `alpha` (counter-clockwise from north, so turned round). Null: the
 * event has none — an `alpha` relative to wherever the phone started.
 */
export function compassHeading(e: Orientation, screenAngle: number): number | null {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading))
    h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha !== null) h = 360 - e.alpha;
  return h === null ? null : (((h + screenAngle) % 360) + 360) % 360;
}

/** A compass reading moves the camera only past this: the sensor shivers by a degree or two. */
const TURN_DEG = 3;

/**
 * The phone's compass heading while `on`, or null — no sensor, a laptop,
 * permission refused. Readings closer than TURN_DEG to the last are left
 * out, so the camera turning with it is not restarted sixty times a second.
 */
function useCompass(on: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!on || typeof window === 'undefined') return;
    const absolute = 'ondeviceorientationabsolute' in window;
    const type = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
    const read = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const h = compassHeading(
        {
          alpha: o.alpha,
          absolute: absolute || o.absolute,
          webkitCompassHeading: o.webkitCompassHeading,
        },
        screen.orientation?.angle ?? 0,
      );
      if (h !== null) setHeading((was) => (was === null || apart(was, h) >= TURN_DEG ? h : was));
    };
    window.addEventListener(type, read);
    return () => {
      window.removeEventListener(type, read);
      setHeading(null);
    };
  }, [on]);
  return heading;
}

/** Safari asks before it gives the compass, and only inside a tap. */
function askForCompass() {
  const ask = (
    globalThis.DeviceOrientationEvent as unknown as
      { requestPermission?: () => Promise<string> } | undefined
  )?.requestPermission;
  if (ask) void ask().catch(() => {});
}

export interface Locator {
  status: LocatorStatus;
  fix: Fix | null;
  /** The way the visitor faces: the phone's compass, else the way the fixes go. Null: unknown. */
  heading: number | null;
  /**
   * The phone's compass has been read: TrackedLocation's tap turns the map
   * by it. Not merely a touch screen — Safari's prompt refused, Firefox, a
   * tablet with no magnetometer give none, and the map would tilt with
   * nothing to turn by (the ds-reviewer, 2026-10-01).
   */
  compass: boolean;
  camera: Camera;
  /** The button's look (LocatorButton's Property 1). */
  mode: LocatorMode;
  /**
   * Asking, and the browser has said "no fix" (a timeout, or unavailable)
   * with none yet. A note beside `asking`, not a status of its own: the watch
   * is still live and the next fix may come (review finding 11).
   */
  noFix: boolean;
  /** The button: ask, or move the camera on round. */
  tap: () => void;
  /** How many times the button has been tapped: the dot's mood reads it (locatorMood). */
  taps: number;
}

interface Options {
  /** Where the visitor should sit from the map's centre, clear of an open card (clearOfSheet). */
  offset: () => [number, number];
  /** The open card's height: the camera keeps the visitor clear of it as it moves. */
  snap: Snap;
  /** A phone, which may have a compass to turn the map by. */
  compass: boolean;
  /**
   * Where in a commit the camera moves to the visitor (commitTurn.ts): the
   * page's turn, after the cards' camera, as when this hook was the page's
   * own (VisitorLocation, 2026-10-05). Without it, in this hook's effect.
   */
  cameraTurn?: Turn;
}

export function useLocator(
  map: MapLibreMap | null,
  { offset, snap, compass, cameraTurn }: Options,
): Locator {
  const [status, setStatus] = useState<LocatorStatus>('off');
  const [fix, setFix] = useState<Fix | null>(null);
  const [camera, setCamera] = useState<Camera>('free');
  // Bumped by every tap that moves the camera, so a tap on TrackedLocation
  // without a compass brings it back even though the camera's state stays.
  const [taps, setTaps] = useState(0);
  const [noFix, setNoFix] = useState(false);
  const watchRef = useRef<number | null>(null);
  const fixesRef = useRef<{ at: LngLat; accuracy: number; time: number }[]>([]);
  const headingRef = useRef<number | null>(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const phone = useCompass(compass && status === 'on');
  const heading = phone ?? fix?.heading ?? null;
  const read = phone !== null;
  const readRef = useRef(read);
  readRef.current = read;

  // TrackedLocation's zoom, chosen as the camera comes to the visitor from
  // elsewhere (trackedZoom) and kept through the compass view and back.
  // Null: to be chosen at the next fix.
  const trackedZoomRef = useRef<number | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const tap = useCallback(() => {
    setTaps((n) => n + 1);
    if (cameraRef.current === 'free') trackedZoomRef.current = null;
    if (watchRef.current !== null) {
      // Each tap is a gesture Safari's prompt may need: asked again until it is answered.
      if (compass && !readRef.current) askForCompass();
      setCamera((c) => afterTap(c, readRef.current));
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (compass) askForCompass();
    setStatus('asking');
    setCamera('tracked');
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const at: LngLat = [p.coords.longitude, p.coords.latitude];
        const time = p.timestamp || Date.now();
        const run = [
          ...fixesRef.current.filter((f) => time - f.time < 15_000),
          { at, accuracy: p.coords.accuracy, time },
        ];
        fixesRef.current = run;
        const derived = motionFrom(run, headingRef.current);
        const speed =
          p.coords.speed !== null && p.coords.speed >= 0 ? p.coords.speed : derived.speed;
        const heading =
          p.coords.heading !== null && !Number.isNaN(p.coords.heading) && speed >= STILL_BELOW_MPS
            ? p.coords.heading
            : derived.heading;
        headingRef.current = heading;
        setFix({ at, accuracy: p.coords.accuracy, speed, heading, time });
        setNoFix(false);
        setStatus('on');
      },
      (e) => {
        // Only a refusal ends the watch. "Position unavailable" and a timeout
        // come and go — indoors, under a flyover, and between every fix on
        // an emulated GPS — and the next fix is still coming; say "no fix
        // yet" only while there has been none.
        if (e.code === e.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(watchRef.current ?? -1);
          watchRef.current = null;
          fixesRef.current = [];
          // The last fix goes too: kept, the walker stood on the map where
          // the visitor was when they took the permission back, and the
          // next tap eased the camera there (review of 2026-10-03).
          headingRef.current = null;
          setFix(null);
          setCamera('free');
          setNoFix(false);
          setStatus('denied');
          return;
        }
        if (fixesRef.current.length === 0) setNoFix(true);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
  }, [compass]);

  // Any move of the camera off the visitor, however slight — a finger's, or
  // the app's for them (APP_MOVE: a hintuan picked, an end tapped), which
  // the next fix would otherwise undo — and the button says so
  // (TrackOwnLocation: "activate it if the focus of camera is change even
  // slight change"). The camera's own glides here carry neither.
  useEffect(() => {
    if (!map) return;
    const letGo = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setCamera('free');
    };
    const appMoved = (e: object) => {
      if ((e as { appMove?: boolean }).appMove) setCamera('free');
    };
    map.on('dragstart', letGo);
    map.on('zoomstart', letGo);
    map.on('rotatestart', letGo);
    map.on('pitchstart', letGo);
    map.on('movestart', appMoved);
    return () => {
      map.off('dragstart', letGo);
      map.off('zoomstart', letGo);
      map.off('rotatestart', letGo);
      map.off('pitchstart', letGo);
      map.off('movestart', appMoved);
    };
  }, [map]);

  // The camera on the visitor: each fix, each turn of the phone, each tap.
  // The whole view every time, not only the centre: a fix arriving mid-glide
  // would otherwise stop the zoom halfway. A finger zooming lets go first,
  // so the zoom is the one the tap chose.
  const lastTaps = useRef(taps);
  // The heading turns only the compass view: north stays up otherwise. And
  // the card's height: the visitor stays clear of it as it moves.
  const turn = camera === 'compass' ? heading : null;
  const lastSnap = useRef(snap);
  useEffect(() => {
    const follow = () => {
      if (!map || !fix || camera === 'free') return;
      const tapped = lastTaps.current !== taps || lastSnap.current !== snap;
      lastTaps.current = taps;
      lastSnap.current = snap;
      trackedZoomRef.current ??= trackedZoom(map.getZoom(), fix.at[1]);
      map.easeTo({
        center: fix.at,
        zoom:
          camera === 'compass' ? zoomForScale(COMPASS_SCALE_M, fix.at[1]) : trackedZoomRef.current,
        pitch: camera === 'compass' ? COMPASS_PITCH : 0,
        bearing: camera === 'compass' ? (turn ?? map.getBearing()) : 0,
        offset: offsetRef.current(),
        duration: tapped ? 800 : 400,
      });
    };
    // The card's height changed: the cards' overview starts in this same
    // commit (useHeightOverview), and the camera following the visitor
    // takes over from it, as it did when this ran among the page's hooks.
    // The turn of the render this effect is from: a new one comes with each
    // render of the page, and is no reason to move the camera.
    if (cameraTurn) cameraTurn(follow);
    else follow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fix, camera, turn, taps, snap]);

  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    },
    [],
  );

  return {
    status,
    fix,
    heading,
    compass: read,
    camera,
    mode: modeFor(camera, status === 'on' && !!fix),
    noFix,
    tap,
    taps,
  };
}
