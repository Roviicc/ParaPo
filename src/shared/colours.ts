import type { StopKind } from './stops'

/**
 * Colours the editor and the public map both paint with. They live apart from
 * either, so the public map never imports the editor just to know what colour
 * a terminal is.
 */
export const HOTSPOT_COLOUR: Record<StopKind, string> = {
  // Plain blue is the saved-route colour; sky keeps "blue" without clashing.
  terminal: '#0ea5e9',
  hintuan: '#f97316',
}
