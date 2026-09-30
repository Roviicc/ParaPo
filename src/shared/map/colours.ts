import type { StopKind } from '../model/stops'
import { MAP_PAINT } from '../../design-system/foundation/mapColours'

/**
 * Colours the editor and the public map both paint with. They live apart from
 * either, so the public map never imports the editor just to know what colour
 * a terminal is.
 */
export const HOTSPOT_COLOUR: Record<StopKind, string> = {
  // Plain blue is the saved-route colour; sky keeps "blue" without clashing.
  terminal: MAP_PAINT['Paint/hotspot-terminal'],
  hintuan: MAP_PAINT['Paint/hotspot-hintuan'],
}
