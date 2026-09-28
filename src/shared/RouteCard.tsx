import blobInverse from './route-card-blob-inverse.svg'
import blobPrimary from './route-card-blob-primary.svg'
import type { Livery } from './liveries'
import { CircleArrowRightIcon } from './RouteIcons'

/**
 * A place and the routes that leave it, in a jeepney's livery — the owner's
 * RouteCard set (Figma 3665:2265, 2026-09-28): the fare, the place in SN Pro
 * Black, and a row for each place it goes to (his .RouteEndPointBar). The
 * Figma property is Variants; here it is `livery`, the name the tokens give
 * these colours, because a variant in this codebase is a direction. Figma's
 * Pink is the orange tokens, and orange here (the owner, 2026-09-28).
 *
 * Red and orange write in Content/inverse under Route/RouteCardPrimary; mist
 * and yellow in Content/primary under Route/RouteCardInverse, their Blob
 * brighter and softened 2px more. The Blob's "image 13" layer is left out:
 * it sits some 840px below the card, where nothing shows. One correction to
 * Figma's export of the Primary Blob: its outer 2px blur came out with a
 * region only 4px round the shape, which cut the 64px glow into hard edges
 * on any card wider than 547px (the docked list at 640, a tablet) — widened
 * to the whole image, as the inner blur and the Inverse file already are.
 */

export type EndPoint = {
  /** Which direction the row opens. */
  id: string
  /** Figma's routeDirection: the place this direction goes to. */
  routeDirection: string
}

type Props = {
  livery: Livery
  /** Figma's Fare: the whole ride's pesos, `₱26–28`. Omitted when unpriced. */
  fare?: string
  /** Figma's Route Origin: the place the card's routes leave from. */
  routeOrigin: string
  /** One row per direction leaving it, in the order given. */
  endPoints: readonly EndPoint[]
  /** A row was tapped: open that direction. */
  onPick: (id: string) => void
}

const SURFACE = {
  red: 'bg-card-red-surface border-card-red-border-primary',
  orange: 'bg-card-orange-surface border-card-orange-border-primary',
  mist: 'bg-card-mist-surface border-card-mist-border-primary',
  yellow: 'bg-card-yellow-surface border-card-yellow-border-primary',
} satisfies Record<Livery, string>

const TEXT = {
  red: 'text-content-inverse',
  orange: 'text-content-inverse',
  mist: 'text-content-primary',
  yellow: 'text-content-primary',
} satisfies Record<Livery, string>

// Drawn over the card, as Figma lays it: above the Blob and the words.
const SHADOW = {
  red: 'shadow-route-card-primary',
  orange: 'shadow-route-card-primary',
  mist: 'shadow-route-card-inverse',
  yellow: 'shadow-route-card-inverse',
} satisfies Record<Livery, string>

// Figma's Blob, Primary and Inverse: a white glow over the card's top,
// 539×270 around its centre, 73px above it. The files carry 128px of blur
// room on every side, so the image is placed 128px further out. It lies
// behind the words (-z-10 inside the card's own stacking context, `isolate`),
// so nothing above it needs `relative` — which would trap a one-row card's
// stretched target inside that element instead of the card.
const BLOB = {
  red: { src: blobPrimary, className: '' },
  orange: { src: blobPrimary, className: '' },
  mist: { src: blobInverse, className: 'blur-[2px]' },
  yellow: { src: blobInverse, className: 'blur-[2px]' },
} satisfies Record<Livery, { src: string; className: string }>

export function RouteCard({ livery, fare, routeOrigin, endPoints, onPick }: Props) {
  // One way to go: the whole card is its row's target, not the row alone.
  const whole = endPoints.length === 1
  return (
    <div
      data-testid="chooser-origin"
      data-livery={livery}
      className={
        'relative isolate flex w-full flex-col items-start gap-2 overflow-clip border-y-[0.6px] py-2 font-sn-pro ' +
        SURFACE[livery] +
        ' ' +
        TEXT[livery]
      }
    >
      <img
        src={BLOB[livery].src}
        alt=""
        aria-hidden
        className={
          // Pixels, all three, like the glow inside the file: the rem scale
          // (-top-50.25) would drift from the image at a larger default text size.
          'pointer-events-none absolute -top-[201px] left-1/2 -z-10 h-[525.538px] w-[795.076px] max-w-none -translate-x-1/2 ' +
          BLOB[livery].className
        }
      />
      <div className="flex w-full flex-col items-start px-4 pt-2">
        {fare && <p className="w-full text-sm/5 font-medium">{fare}</p>}
        <p className="w-full text-2xl/8 font-black">{routeOrigin}</p>
      </div>
      <ul className="flex w-full flex-col">
        {endPoints.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              data-testid="chooser-item"
              onClick={() => onPick(e.id)}
              className={
                'flex w-full items-center gap-1 px-4 py-2 text-left text-base/6 font-medium' +
                (whole ? ' after:absolute after:inset-0' : '')
              }
            >
              <span aria-hidden className="size-5 shrink-0 *:size-full">
                <CircleArrowRightIcon />
              </span>
              <span className="min-w-0 flex-1">{e.routeDirection}</span>
            </button>
          </li>
        ))}
      </ul>
      <span aria-hidden className={'pointer-events-none absolute inset-0 ' + SHADOW[livery]} />
    </div>
  )
}
