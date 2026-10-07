import { MAP_COLOURS, MAP_OPACITY } from '@/design-system/foundation/map-colours';

import type { HotspotKind } from '../model/hotspots';

/**
 * Colours the editor and the public map both paint with. They live apart from
 * either, so the public map never imports the editor just to know what colour
 * a terminal is. The owner's HotspotOverlayCard (Figma 3837:11308,
 * 2026-09-30): a hintuan green, a terminal sky — orange and a brighter sky
 * before.
 */
export const HOTSPOT_COLOUR: Record<HotspotKind, string> = {
  terminal: MAP_COLOURS['Map/OverlayCard/Terminal/surface'],
  hintuan: MAP_COLOURS['Map/OverlayCard/Hintuan/surface'],
};

/** A box at rest: its fill's opacity. */
export const HOTSPOT_OPACITY: Record<HotspotKind, number> = {
  terminal: MAP_OPACITY['Map/OverlayCard/Terminal/surface'],
  hintuan: MAP_OPACITY['Map/OverlayCard/Hintuan/surface'],
};

/** A box's edge, its name, and its Selected stripes. */
export const HOTSPOT_CONTENT: Record<HotspotKind, string> = {
  terminal: MAP_COLOURS['Map/OverlayCard/Terminal/content'],
  hintuan: MAP_COLOURS['Map/OverlayCard/Hintuan/content'],
};
