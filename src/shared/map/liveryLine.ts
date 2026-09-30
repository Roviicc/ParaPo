import { CARD_COLOURS, MAP_COLOURS } from '../../design-system/foundation/mapColours'
import type { Livery } from '../model/liveries'

/** How a lit route line is painted: the line, and the chevrons flowing inside it. The end circles ring in the line's colour. */
export type LineLook = { line: string; arrow: string }

/**
 * A picked RouteCard's routes, and an open trip's line, in the card's own
 * colour (the owner's ask, 2026-09-29: "the highlighted route should change
 * the color to the surface color of selected routecard", and the trip's
 * line too). Card/<livery>/surface, the chevrons in Map/RouteLine/Arrow/Rest
 * on the dark liveries and …/Arrow/Inverse on the light ones, as the card's
 * own words are white on red, orange, violet and rose, near-black on mist
 * and yellow.
 */
export const LIVERY_LINE = {
  red: { line: CARD_COLOURS['Card/red/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Rest'] },
  orange: { line: CARD_COLOURS['Card/orange/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Rest'] },
  mist: { line: CARD_COLOURS['Card/mist/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Inverse'] },
  yellow: { line: CARD_COLOURS['Card/yellow/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Inverse'] },
  violet: { line: CARD_COLOURS['Card/violet/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Rest'] },
  rose: { line: CARD_COLOURS['Card/rose/surface'], arrow: MAP_COLOURS['Map/RouteLine/Arrow/Rest'] },
} satisfies Record<Livery, LineLook>

/** Every other lit line — a list's or a hotspot card's with no card picked, and the studio's: Map/RouteLine/surface-selected. */
export const LIT_LINE: LineLook = {
  line: MAP_COLOURS['Map/RouteLine/surface-selected'],
  arrow: MAP_COLOURS['Map/RouteLine/Arrow/Rest'],
}
