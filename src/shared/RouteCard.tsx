import type { Livery } from './liveries'
import { BLOB_PLACE, CARD_BLOB, CARD_SHADOW, CARD_SURFACE, CARD_TEXT } from './liveryCard'
import { CircleArrowRightIcon } from './RouteIcons'

/**
 * A place and the routes that leave it, in a jeepney's livery — the owner's
 * RouteCard set (Figma 3665:2265, 2026-09-28): the fare, the place in SN Pro
 * Black, and a row for each place it goes to (his .RouteEndPointBar). The
 * Figma property is Variants; here it is `livery`, the name the tokens give
 * these colours, because a variant in this codebase is a direction. Figma's
 * Pink is the orange tokens, and orange here (the owner, 2026-09-28). How
 * each livery paints the card — surface, words, glow, shadow — is
 * liveryCard.ts, shared with the trip card it opens.
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

export function RouteCard({ livery, fare, routeOrigin, endPoints, onPick }: Props) {
  // One way to go: the whole card is its row's target, not the row alone.
  const whole = endPoints.length === 1
  return (
    <div
      data-testid="chooser-origin"
      data-livery={livery}
      className={
        'relative isolate flex w-full flex-col items-start gap-2 overflow-clip border-y-[0.6px] py-2 font-sn-pro ' +
        CARD_SURFACE[livery] +
        ' ' +
        CARD_TEXT[livery]
      }
    >
      <img src={CARD_BLOB[livery].src} alt="" aria-hidden className={BLOB_PLACE + ' ' + CARD_BLOB[livery].className} />
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
      <span aria-hidden className={'pointer-events-none absolute inset-0 ' + CARD_SHADOW[livery]} />
    </div>
  )
}
