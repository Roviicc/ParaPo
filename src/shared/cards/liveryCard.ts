import blobInverse from './route-card-blob-inverse.svg'
import blobPrimary from './route-card-blob-primary.svg'
import type { Livery } from '../model/liveries'

/**
 * How a livery paints a card — the owner's RouteCard set (Figma 3665:2265,
 * 2026-09-28) — for the list's cards and a trip's card alike (RouteTripDetail,
 * 2026-09-29), so a trip opens in the colours of the card it was picked from.
 *
 * Red and orange write in Content/inverse under Route/RouteCardPrimary; mist
 * and yellow in Content/primary under Route/RouteCardInverse, their Blob
 * brighter and softened 2px more. The owner's yellow trip frames (3762:3546)
 * wear the red card's Primary Blob and shadow; the yellow card's own are used
 * here, so the card and the trip it opens match. Violet and rose (2026-09-30)
 * are the two between: white words, as on red and orange, under the Inverse
 * shadow and softened Blob of mist and yellow.
 */

export const CARD_SURFACE = {
  red: 'bg-card-red-surface border-card-red-border-primary',
  orange: 'bg-card-orange-surface border-card-orange-border-primary',
  mist: 'bg-card-mist-surface border-card-mist-border-primary',
  yellow: 'bg-card-yellow-surface border-card-yellow-border-primary',
  violet: 'bg-card-violet-surface border-card-violet-border-primary',
  rose: 'bg-card-rose-surface border-card-rose-border-primary',
} satisfies Record<Livery, string>

export const CARD_TEXT = {
  red: 'text-content-inverse',
  orange: 'text-content-inverse',
  mist: 'text-content-primary',
  yellow: 'text-content-primary',
  violet: 'text-content-inverse',
  rose: 'text-content-inverse',
} satisfies Record<Livery, string>

// Drawn over the card, as Figma lays it: above the Blob and the words.
export const CARD_SHADOW = {
  red: 'shadow-route-card-primary',
  orange: 'shadow-route-card-primary',
  mist: 'shadow-route-card-inverse',
  yellow: 'shadow-route-card-inverse',
  violet: 'shadow-route-card-inverse',
  rose: 'shadow-route-card-inverse',
} satisfies Record<Livery, string>

// A RouteCard's State=Selected (2026-09-29): pressed in, and nothing else
// changes — the fill, the words, the Blob stay the Rest card's.
export const CARD_SHADOW_SELECTED = {
  red: 'shadow-route-card-primary-selected',
  orange: 'shadow-route-card-primary-selected',
  mist: 'shadow-route-card-inverse-selected',
  yellow: 'shadow-route-card-inverse-selected',
  violet: 'shadow-route-card-inverse-selected',
  rose: 'shadow-route-card-inverse-selected',
} satisfies Record<Livery, string>

// Figma's Blob, Primary and Inverse: a white glow over the card's top,
// 539×270 around its centre, 73px above it. The files carry 128px of blur
// room on every side, so the image is placed 128px further out (BLOB_PLACE).
// It lies behind the words (-z-10 inside the card's own stacking context,
// `isolate`), so nothing above it needs `relative` — which would trap a
// card's name, stretched over the card, inside that element instead.
//
// The Blob's "image 13" layer is left out: it sits some 840px below the card,
// where nothing shows. One correction to Figma's export of the Primary Blob:
// its outer 2px blur came out with a region only 4px round the shape, which
// cut the 64px glow into hard edges on any card wider than 547px (the docked
// list at 640, a tablet) — widened to the whole image, as the inner blur and
// the Inverse file already are.
export const CARD_BLOB = {
  red: { src: blobPrimary, className: '' },
  orange: { src: blobPrimary, className: '' },
  mist: { src: blobInverse, className: 'blur-[2px]' },
  yellow: { src: blobInverse, className: 'blur-[2px]' },
  violet: { src: blobInverse, className: 'blur-[2px]' },
  rose: { src: blobInverse, className: 'blur-[2px]' },
} satisfies Record<Livery, { src: string; className: string }>

// Pixels, all three, like the glow inside the file: the rem scale
// (-top-50.25) would drift from the image at a larger default text size.
export const BLOB_PLACE =
  'pointer-events-none absolute -top-[201px] left-1/2 -z-10 h-[525.538px] w-[795.076px] max-w-none -translate-x-1/2'

/** A trip's rail and its dots' rings: Figma's Card/<livery>/Timeline/surface. */
export const TIMELINE_SURFACE = {
  red: 'bg-card-red-timeline-surface',
  orange: 'bg-card-orange-timeline-surface',
  mist: 'bg-card-mist-timeline-surface',
  yellow: 'bg-card-yellow-timeline-surface',
  violet: 'bg-card-violet-timeline-surface',
  rose: 'bg-card-rose-timeline-surface',
} satisfies Record<Livery, string>

/**
 * A picked hintuan's pill, with the pesos to it (the owner's Timeline
 * State=Selected, 3769:2847; his yellow and mist cards, 3785:4462 and
 * 3785:4575): the card's own colour on Content/inverse where its words are
 * white, on Content/primary where they are dark. Orange follows red: he drew
 * no orange trip; nor violet and rose, whose words are white too.
 */
export const TIMELINE_PILL = {
  red: 'bg-content-inverse text-card-red-surface',
  orange: 'bg-content-inverse text-card-orange-surface',
  mist: 'bg-content-primary text-card-mist-surface',
  yellow: 'bg-content-primary text-card-yellow-surface',
  violet: 'bg-content-inverse text-card-violet-surface',
  rose: 'bg-content-inverse text-card-rose-surface',
} satisfies Record<Livery, string>
