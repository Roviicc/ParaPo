import { useEffect, useRef, useState, type Ref } from 'react'
import { Button } from '../../design-system/primitives/Button'
import { IconButton } from '../../design-system/primitives/IconButton'
import { haversine } from '../geo/geo'
import type { Livery } from '../model/liveries'
import { drawnDepartures } from '../model/departures'
import { placeBoxes } from '../model/places'
import type { VariantSummary } from '../model/routes'
import { stopLabel, type StopKind, type StopSummary } from '../model/stops'
import { BottomSheet, type SheetHeight } from './BottomSheet'
import { ChevronLeftIcon, CloseIcon, HintuanIcon, InformationIcon, JeepIcon, TerminalIcon } from './RouteIcons'
import { RouteCardStack, type PickedPlace } from './RouteCardStack'

type Props = {
  /** The box picked: the one tapped on the map, or a row since. Its row is Selected. */
  stop: StopSummary
  /** Every hotspot, for the other boxes of its place. */
  stops: readonly StopSummary[]
  /** The directions that stop at a box, by its id. */
  linkedVariantIds: (id: string) => readonly string[]
  variants: readonly VariantSummary[]
  /** Called with the direction picked, and the colour its card wore: its trip wears the same. */
  onSelectVariant: (v: VariantSummary, livery?: Livery) => void
  /**
   * The routes stopping at the box as RouteCards, as the route list shows
   * them: the place whose card is Selected, what to do when one is picked or
   * let go, and where to say which directions they show, for the map to light.
   */
  routeCards: {
    selected: string | null
    onSelect: (place: PickedPlace | null) => void
    onShown: (ids: readonly string[]) => void
  }
  /** Another box of the place picked — its row, or SWITCH moving to it: select it and go there. */
  onPickBox: (id: string) => void
  /**
   * No row Selected: the Selected one tapped again lets it go (the owner's
   * ask, 2026-10-01), and the card shows the routes through every box of
   * the place until a row is picked — the same one, or another.
   */
  deselected?: boolean
  /** The Selected row tapped: let it go. */
  onDeselect?: () => void
  onClose: () => void
  /** ‹, back to the trip whose name on the map opened the card; none, and no ‹. */
  onBack?: (() => void) | null
  /** Kept but not shown, while a trip picked from it is on top: ‹ comes back to it as it was left. */
  hidden?: boolean
  /** Its height, shared with the trip opened from it (BottomSheet). */
  height?: SheetHeight
  /** The dock the card sits in, for the map to glide a picked box clear of it. */
  dockRef?: Ref<HTMLDivElement>
}

// Figma's HotspotSelectionBar, a terminal's and a hintuan's: the fill, its
// hairlines and its letter.
const BAR = {
  terminal: 'bg-map-hotspots-card-terminal-surface border-map-hotspots-card-terminal-border-primary',
  hintuan: 'bg-map-hotspots-card-hintuan-surface border-map-hotspots-card-hintuan-border-primary',
} satisfies Record<StopKind, string>

const LETTER = { terminal: <TerminalIcon />, hintuan: <HintuanIcon /> } satisfies Record<StopKind, unknown>

/**
 * A place and every box of it — the owner's HintuanCard (3854:12690,
 * 2026-09-30), the public map's card for a hotspot since that day, in place
 * of one card per box with its siblings as chips.
 *
 * Under the place's name, a HotspotSelectionBar per box: terminals first, in
 * sky, then the hintuans, in green, each in the order drawn, and boxes of one
 * name numbered (placeBoxes). The box tapped on the map is the Selected one,
 * pressed in; a tap on another row picks it, and the map goes there, the
 * card staying at its height (the caller's `onPickBox`). A tap on the
 * Selected row lets it go: no row Selected, and the routes below are the
 * whole place's until a row is picked again (`deselected`, the owner's ask
 * of 2026-10-01).
 *
 * Under the rows, the routes that stop at the Selected box — only there:
 * Lagro 1, on the way to SM Fairview, lists Tala → SM Fairview and
 * → Novaliches; Lagro 2, across the road, their way back (the owner's
 * example). The HintuanCardRouteCounter (3851:12206) sits across the join,
 * with SWITCH: the other way round, at this box when it is passed both ways,
 * else at the nearest box of the place that is — the selection moves there.
 * With no box passed the other way, SWITCH rests disabled; with no route at
 * all, the counter is left out.
 *
 * ⓘ opens the hintuan's description, a card the owner has yet to design: it
 * rests disabled until then (his call, 2026-09-30).
 */
export function HintuanCard({
  stop,
  stops,
  linkedVariantIds,
  variants,
  onSelectVariant,
  routeCards,
  onPickBox,
  deselected = false,
  onDeselect,
  onClose,
  onBack,
  hidden,
  height,
  dockRef,
}: Props) {
  const label = stopLabel(stop)
  const rows = placeBoxes(stop, stops.some((s) => s.id === stop.id) ? stops : [stop, ...stops])
  const byId = new Map(variants.map((v) => [v.id, v]))
  const linked = (id: string) =>
    linkedVariantIds(id)
      .map((v) => byId.get(v))
      .filter((v): v is VariantSummary => !!v)
  /** Whether a box is passed `back` — the way back — or the way there, by a drawn direction. */
  const passes = (id: string, back: boolean) => drawnDepartures(linked(id), back).length > 0

  // What the routes below are of: the Selected box, or with none, every box
  // of the place, each direction once.
  const routes = deselected
    ? [...new Map(rows.flatMap((r) => linked(r.box.id)).map((v) => [v.id, v])).values()]
    : linked(stop.id)

  // The way round asked for; routes passing one way only show that way.
  const [flipped, setFlipped] = useState(false)
  const there = drawnDepartures(routes, false).length > 0
  const backToo = drawnDepartures(routes, true).length > 0
  const back = there && backToo ? flipped : backToo
  const shown = drawnDepartures(routes, back).flatMap((p) => p.directions.map((d) => d.v.id))

  // The other way round: here, when these routes run both ways; else the
  // nearest box of the place that is passed that way — none with no row
  // Selected, where the whole place already shows.
  const other = !back
  const switchTo =
    there && backToo
      ? stop
      : deselected
        ? null
        : (rows
          .map((r) => r.box)
          .filter((b) => b.id !== stop.id && passes(b.id, other))
          .sort((a, b) => haversine(a.point.coordinates, stop.point.coordinates) - haversine(b.point.coordinates, stop.point.coordinates))[0] ?? null)

  // What the RouteCards show, for the map to light; nothing once the card
  // closes. Told only when that changes: the caller's function is read from
  // a ref, so one made afresh each render cannot set the lights going in a loop.
  const shownKey = shown.join('\n')
  const onShown = useRef(routeCards.onShown)
  onShown.current = routeCards.onShown
  useEffect(() => {
    const tell = onShown.current
    tell(shownKey ? shownKey.split('\n') : [])
    return () => tell([])
  }, [shownKey])

  // Figma's "2 routes passes here" (the owner's of 2026-10-01; "… through"
  // before), its verb agreeing with the count.
  const count = `${shown.length} ${shown.length === 1 ? 'route passes' : 'routes pass'} here`

  return (
    <BottomSheet
      ref={dockRef}
      testId="card"
      label={label}
      onClose={onClose}
      hidden={hidden}
      height={height}
      header={
        // RouteCardHeader/Variant3: the place's name, ⓘ and ✕; ‹ before
        // the name when a trip's name on the map opened it, as a trip has.
        <div data-testid="card-place" className="flex w-full items-center gap-2 bg-surface px-3 pb-4 pt-0 @float:pt-3">
          {onBack && <IconButton variant="special" icon={<ChevronLeftIcon />} label="Back" tooltip="top" onClick={onBack} />}
          <p className="min-w-0 flex-1 truncate font-sn-pro text-2xl/8 font-black text-content-primary">{label}</p>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton variant="special" icon={<InformationIcon />} label="About this place" tooltip="top" disabled />
            <IconButton variant="special" icon={<CloseIcon />} label="Close" tooltip="top" onClick={onClose} />
          </div>
        </div>
      }
    >
      <ul>
        {rows.map(({ box, label: name }, i) => {
          const selected = !deselected && box.id === stop.id
          return (
            <li key={box.id}>
              <button
                type="button"
                data-testid="card-box"
                data-box={box.id}
                data-kind={box.kind}
                // A toggle since the owner's ask of 2026-10-01: the Selected
                // row is pressed, a tap on it lets it go, and a tap on any
                // row picks that one.
                aria-pressed={selected}
                onClick={() => {
                  if (!selected) onPickBox(box.id)
                  else onDeselect?.()
                }}
                className={
                  'relative flex w-full items-center gap-1 border-y-[0.6px] px-4 pt-3 text-left font-sn-pro text-base/6 font-medium text-content-inverse ' +
                  BAR[box.kind] +
                  // The last row makes room for the counter across the join.
                  (i === rows.length - 1 && shown.length > 0 ? ' pb-11' : ' pb-2.5')
                }
              >
                <span aria-hidden className="size-6 shrink-0 *:size-full">
                  {LETTER[box.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {/* Pressed in when Selected, as a RouteCard is. */}
                <span
                  aria-hidden
                  className={
                    'pointer-events-none absolute inset-0 ' +
                    (selected ? 'shadow-route-card-primary-selected' : 'shadow-route-card-primary')
                  }
                />
              </button>
            </li>
          )
        })}
      </ul>

      {shown.length > 0 && (
        // The first RouteCard makes room at its top for the counter: 36 over
        // its title's own 8 (3854:12526, 2026-10-01).
        <div className="relative [&>:first-child]:pt-9">
          <RouteCardStack
            routes={routes}
            back={back}
            selected={routeCards.selected}
            onSelect={routeCards.onSelect}
            onRoute={onSelectVariant}
            testId="card"
          />
          {/* HintuanCardRouteCounter (3851:12206, 2026-10-01), across the join of the rows and the cards, 24 in. */}
          <div className="absolute inset-x-0 -top-6 z-10 px-6">
            <div className="flex w-full items-center gap-2 rounded-full bg-surface py-3 pl-4 pr-3">
              <div className="flex min-w-0 flex-1 items-center gap-1 text-content-primary">
                <span aria-hidden className="size-5 shrink-0 *:size-full">
                  <JeepIcon />
                </span>
                <p data-testid="card-count" className="min-w-0 flex-1 truncate font-sn-pro text-base/6 font-black">
                  {count}
                </p>
              </div>
              <Button
                variant="special"
                size="small"
                label="SWITCH"
                data-testid="card-flip"
                aria-pressed={back}
                disabled={!switchTo}
                onClick={() => {
                  if (!switchTo) return
                  routeCards.onSelect(null)
                  setFlipped(other)
                  if (switchTo.id !== stop.id) onPickBox(switchTo.id)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
