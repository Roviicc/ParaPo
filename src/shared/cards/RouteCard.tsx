import type { Livery } from '../model/liveries'
import { BLOB_PLACE, CARD_BLOB, CARD_SHADOW, CARD_SHADOW_SELECTED, CARD_SURFACE, CARD_TEXT } from './liveryCard'
import { CircleArrowRightIcon } from './RouteIcons'

/**
 * A place and the routes that leave it, in a jeepney's livery — the owner's
 * RouteCard set (Figma 3665:2265): the place in SN Pro Black, and a row for
 * each place it goes to (his .RouteEndPointBar). The Figma property Variants
 * is `livery` here, the name the tokens give these colours, because a variant
 * in this codebase is a direction; Figma's Pink is the orange tokens (the
 * owner, 2026-09-28). How each livery paints the card — surface, words, glow,
 * shadow — is liveryCard.ts, shared with the trip card it opens.
 *
 * Figma's State (2026-09-29): Rest, or Selected — pressed in, under the
 * Selected shadow, while the map lights its routes alone. A row opens its
 * trip straight away; a tap anywhere else on the card — its name, the room
 * around its rows — selects it, or lets it go (the owner's picks, the same
 * day). Which card is Selected, one at a time, is the caller's to keep. The
 * pesos left the card with this set: the trip's Expected fare carries them.
 *
 * A row's State (RouteEndPointBar, 3848:11928, 2026-10-01): Rest, or Pressed
 * — while the finger is down on it, the row in the card's timeline colour,
 * Card/<livery>/Timeline/surface; the trip opens as it lets go (the owner's
 * pick, the same day: a tap's feedback, not kept once the trip is open).
 * A phone's own tap highlight is turned off on the row, so the colour under
 * the finger is the token's alone.
 */

/** A row Pressed: Card/<livery>/Timeline/surface, as the timeline's rail wears it. */
const ROW_PRESSED = {
  red: 'active:bg-card-red-timeline-surface',
  orange: 'active:bg-card-orange-timeline-surface',
  yellow: 'active:bg-card-yellow-timeline-surface',
  violet: 'active:bg-card-violet-timeline-surface',
  rose: 'active:bg-card-rose-timeline-surface',
  fuchsia: 'active:bg-card-fuchsia-timeline-surface',
} satisfies Record<Livery, string>

export type EndPoint = {
  /** Which direction the row opens. */
  id: string
  /** Figma's routeDirection: the place this direction goes to. */
  routeDirection: string
}

type Props = {
  livery: Livery
  /** Figma's State. */
  state: 'rest' | 'selected'
  /** Figma's Route Origin: the place the card's routes leave from. */
  routeOrigin: string
  /** One row per direction leaving it, in the order given. */
  endPoints: readonly EndPoint[]
  /** A tap on the card outside its rows: select it, or let it go. */
  onSelect: () => void
  /** A row was tapped: open that direction. */
  onPick: (id: string) => void
  /**
   * What the suites call the card and its parts — `<testId>-origin`, its
   * name `<testId>-select`, its rows `<testId>-item` — `chooser` in the route
   * list, `card` in a hotspot's card, the names the old rows there had.
   */
  testId: 'chooser' | 'card'
}

export function RouteCard({ livery, state, routeOrigin, endPoints, onSelect, onPick, testId }: Props) {
  const selected = state === 'selected'
  return (
    <div
      data-testid={`${testId}-origin`}
      data-livery={livery}
      data-state={state}
      className={
        'relative isolate flex w-full flex-col items-start gap-2 overflow-clip border-y-[0.6px] py-2 font-sn-pro ' +
        CARD_SURFACE[livery] +
        ' ' +
        CARD_TEXT[livery]
      }
    >
      <img src={CARD_BLOB[livery].src} alt="" aria-hidden className={BLOB_PLACE + ' ' + CARD_BLOB[livery].className} />
      <div className="flex w-full flex-col items-start px-4 pt-2">
        {/* The name is the card's own target, stretched over all of it; the
            rows are drawn over that, so they keep their own taps. At a
            sheet's Low, one line of it (sheetGesture's LOW_PX). */}
        <button
          type="button"
          data-testid={`${testId}-select`}
          aria-pressed={selected}
          onClick={onSelect}
          className="w-full text-left text-2xl/8 font-black after:absolute after:inset-0 sheet-low:line-clamp-1"
        >
          {routeOrigin}
        </button>
      </div>
      <ul className="flex w-full flex-col">
        {endPoints.map((e) => (
          <li key={e.id}>
            {/* `relative`: positioned after the name's stretched target, so
                drawn over it. */}
            <button
              type="button"
              data-testid={`${testId}-item`}
              data-direction={e.id}
              onClick={() => onPick(e.id)}
              className={'relative flex w-full items-center gap-1 px-4 py-2 text-left text-base/6 font-medium [-webkit-tap-highlight-color:transparent] ' +
                ROW_PRESSED[livery]}
            >
              <span aria-hidden className="size-6 shrink-0 *:size-full">
                <CircleArrowRightIcon />
              </span>
              <span className="min-w-0 flex-1">{e.routeDirection}</span>
            </button>
          </li>
        ))}
      </ul>
      <span
        aria-hidden
        className={'pointer-events-none absolute inset-0 ' + (selected ? CARD_SHADOW_SELECTED[livery] : CARD_SHADOW[livery])}
      />
    </div>
  )
}
