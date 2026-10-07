import type { LngLat, Segment } from '@/shared/utils/geo';
import { joinSegments } from '@/shared/utils/geo';

import type { Direction, RouteRow, TransportMode, UnnamedDirectionRow } from './direction-schema';
import { hotspotLabel, type Hotspot } from './hotspots';

export type {
  Confidence,
  Direction,
  RouteRow,
  RouteSummary,
  TransportMode,
  UnnamedDirectionRow,
} from './direction-schema';
export type { LineStringGeoJSON } from './geojson-schema';

export const MODES: { value: TransportMode; label: string }[] = [
  { value: 'jeepney', label: 'Jeepney' },
  { value: 'e_jeepney', label: 'Modern e-jeepney' },
  { value: 'uv_express', label: 'UV Express' },
  { value: 'bus', label: 'Bus' },
  { value: 'p2p', label: 'P2P bus' },
  { value: 'tricycle', label: 'Tricycle' },
  { value: 'lrt', label: 'LRT' },
  { value: 'mrt', label: 'MRT' },
  { value: 'ferry', label: 'Ferry' },
];

/**
 * The train lines (0011, the owner's ask of 2026-10-02): LRT-1, LRT-2 and
 * MRT-3, each a route whose `routeCode` names its line. A train runs on its
 * own track and stops only at its own stations, so everything that asks
 * which hintuans a line passes asks `servedBy` too.
 */
export const RAIL_MODES: readonly TransportMode[] = ['lrt', 'mrt'];

/** The lines a routeCode or a station's `line` may name; 0011 holds `hotspot.line` to them. */
export const RAIL_LINES = ['LRT-1', 'LRT-2', 'MRT-3'] as const;
export type RailLine = (typeof RAIL_LINES)[number];
export const isRailLine = (code: string | null | undefined): code is RailLine =>
  (RAIL_LINES as readonly string[]).includes(code ?? '');

export const isRail = (mode: TransportMode | null | undefined): boolean =>
  !!mode && RAIL_MODES.includes(mode);

/**
 * The ferry lines (0012, the owner's ask of 2026-10-03): the Pasig River
 * Ferry, PRFS. A ferry runs on the river as a train on its track, stopping
 * only at its own stations, so it is a line as a train is.
 */
export const FERRY_MODES: readonly TransportMode[] = ['ferry'];
export const FERRY_LINES = ['PRFS'] as const;

/** Every mode that runs on a line of its own: the trains and the ferry. */
export const LINE_MODES: readonly TransportMode[] = [...RAIL_MODES, ...FERRY_MODES];
/** Every line a routeCode or a station's `line` may name; 0011 and 0012 hold `hotspot.line` to them. */
export const LINES: readonly string[] = [...RAIL_LINES, ...FERRY_LINES];

export const isLineMode = (mode: TransportMode | null | undefined): boolean =>
  !!mode && LINE_MODES.includes(mode);
export const isFerry = (mode: TransportMode | null | undefined): boolean =>
  !!mode && FERRY_MODES.includes(mode);

/**
 * A line's own words under its trip's tiles, fixed: never a live status (the
 * owner's rule, nothing may look like live tracking). The ferry stops for
 * weather, holidays and repairs often, and MMDA says when.
 */
export const LINE_NOTES: Readonly<Record<string, string>> = {
  PRFS: 'Mon–Sat, daytime · Suspended in bad weather: check MMDA',
};

/** What `servedBy` reads of a route. `routeCode` is absent from files published before 0011. */
export interface ServedRoute {
  mode: TransportMode;
  routeCode?: string | null;
}

/**
 * Whether a direction of this route stops at this hintuan, beyond passing
 * within reach of its box. A line — a train, the ferry — stops only at its
 * own stations; a jeep at every hintuan that is not a station — the owner's
 * default of 2026-10-02, open to change. A line with none named stops
 * nowhere, so it can never pick up the jeep hintuans under its track or
 * along its river.
 */
export function servedBy(hotspot: { line?: string | null }, route: ServedRoute): boolean {
  const line = hotspot.line ?? null;
  if (!isLineMode(route.mode)) return line === null;
  return line !== null && line === (route.routeCode ?? null);
}

/** Spaced en dash. R3: applied by the app, never typed, so it cannot vary. */
const DASH = '–';

/**
 * `Tala – SM Fairview`, or `Tala – Novaliches via Zabarte`.
 *
 * R1–R4, decided 2026-09-21. Nothing stores this: it is generated wherever a
 * name is shown, from the two hotspots' current names, so renaming a hotspot
 * renames every route through it and no copy can fall behind.
 */
export function routeName(head: string, tail: string, via?: string | null): string {
  const base = `${head} ${DASH} ${tail}`;
  return via && via.trim() ? `${base} via ${via.trim()}` : base;
}

/**
 * `SM Fairview → Tala` — a direction named from where it leaves to where it is
 * going. Generated too: a direction is only which way round the route is
 * ridden, so it has nothing of its own to name. Both ends are said, because
 * "to Tala" beside the route name "Tala – SM Fairview" read as not reversed
 * at all (the owner, on his first return trip, 2026-09-22).
 */
export function directionName(head: string, tail: string, reversed: boolean): string {
  return reversed ? `${tail} → ${head}` : `${head} → ${tail}`;
}

/**
 * One direction as the editor lists it: what the map, the cards, the links
 * and a save need to know about every direction, without its drawing. The
 * drawing — the clicks and the road between each pair — is read on its own
 * when a direction is opened (DirectionDrawing, live.ts withDrawing): it is
 * half of every row, and the editor lists a thousand rows to open one.
 */
/**
 * One direction as the editor lists it: what the map, the cards, the links
 * and a save need to know about every direction, without its drawing. The
 * drawing — the clicks and the road between each pair — is read on its own
 * when a direction is opened (DirectionDrawing, live.ts withDrawing): it is
 * half of every row, and the editor lists a thousand rows to open one. Its
 * route carries the generated name (nameDirections).
 */
export type DirectionRow = Omit<UnnamedDirectionRow, 'route'> & {
  route: RouteRow & { name: string };
};

/** A direction with its drawing, for reopening and re-saving it. */
export type DirectionDrawing = DirectionRow & {
  controlPoints: LngLat[];
  segments: Segment[];
};

type HotspotName = Pick<Hotspot, 'id' | 'name' | 'informal'>;

interface Unnamed {
  reversed: boolean;
  name: string | null;
  route: Pick<RouteRow, 'signboard' | 'headHotspotId' | 'tailHotspotId' | 'via'>;
}

/**
 * Fill in the generated names from the hotspots at each route's ends. Nothing
 * stores them (R1, 2026-09-21), so a renamed hotspot shows its new name on the
 * next load or the next publish, and no copy can fall behind. The name read is
 * the hotspot's informal one when it has one (hotspotLabel, 0007): a route is
 * `Tala – SM Fairview`, never `Tala Jeepney Terminal – SM Fairview Terminal A`.
 *
 * A route whose ends cannot be found falls back to its signboard: the foreign
 * keys make that impossible from the database, so it only means an old file.
 */
export function nameDirections<V extends Unnamed>(
  directions: V[],
  hotspots: HotspotName[],
): (V & { route: V['route'] & { name: string } })[] {
  const byId = new Map(hotspots.map((s) => [s.id, hotspotLabel(s)]));
  return directions.map((v) => {
    const head = byId.get(v.route.headHotspotId);
    const tail = byId.get(v.route.tailHotspotId);
    if (!head || !tail) {
      return { ...v, route: { ...v.route, name: v.route.signboard ?? '(unnamed)' } };
    }
    return {
      ...v,
      name: directionName(head, tail, v.reversed),
      route: { ...v.route, name: routeName(head, tail, v.route.via) },
    };
  });
}

/** Whether a direction has a line to draw, as opposed to being a slot. */
export function isDrawn(v: Direction & { segments?: Segment[] | null }): boolean {
  return directionLine(v).length > 1;
}

/**
 * The places a direction runs from and to, as its generated name says them —
 * `Tala → SM Fairview` — so a list reads exactly what the card's title will.
 * Falls back to the route's name, read the way this direction rides it, for a
 * row that has no direction name (a file from before names were generated).
 */
export function directionEnds(v: Direction): { from: string; to: string } {
  const [from, to] = (v.name ?? '').split(' → ');
  if (from && to) return { from, to };
  const [head = '', tail = ''] = (v.route?.name ?? '').replace(/ via .*$/, '').split(` ${DASH} `);
  return v.reversed ? { from: tail, to: head } : { from: head, to: tail };
}

/** The hotspots a direction runs from and to: its route's head and tail, the way it rides them. */
export function directionEndHotspots(v: Direction): {
  fromHotspot: string | null;
  toHotspot: string | null;
} {
  const head = v.route?.headHotspotId ?? null;
  const tail = v.route?.tailHotspotId ?? null;
  return v.reversed
    ? { fromHotspot: tail, toHotspot: head }
    : { fromHotspot: head, toHotspot: tail };
}

/** Geometry to draw: the stored shape, or rebuilt from segments when the row has them. */
export function directionLine(v: Direction & { segments?: Segment[] | null }): LngLat[] {
  if (v.shape?.coordinates?.length) return v.shape.coordinates;
  return joinSegments(v.segments ?? []);
}
