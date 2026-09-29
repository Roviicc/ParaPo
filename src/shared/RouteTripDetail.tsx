import { useState } from 'react'
import { kmLabel } from './geo'
import type { Livery } from './liveries'
import { BLOB_PLACE, CARD_BLOB, CARD_SHADOW, CARD_SURFACE, CARD_TEXT, TIMELINE_SURFACE } from './liveryCard'
import { RouteCardHeader } from './RouteCardHeader'
import { RouteDock } from './RouteDock'
import { ChevronDownIcon, CircleArrowRightIcon } from './RouteIcons'

type Props = {
  livery: Livery
  /** Figma's Kilometer tile: the whole ride's length, in metres; written `12.8km`. */
  metres: number
  /** Figma's Expected fare tile: the whole ride's pesos, `₱24–28`. Omitted when unpriced, and the tile with it. */
  fare?: string
  /** Figma's Route on TimelineTop: the place the trip leaves from. */
  routeOrigin: string
  /** Figma's TimelineHintuan rows: every hintuan on the way, in the order the jeep reaches them. */
  hintuans: readonly { id: string; label: string }[]
  /** Figma's Route on TimelineBottomEndRoute: the place the trip goes to. */
  routeDirection: string
  /** SWITCH: the same route the other way. */
  onSwitch: () => void
  /** False when the route has no other way drawn; SWITCH then rests disabled. */
  switchable: boolean
  /** Whether this trip is the route's way back: SWITCH is pressed then, as over the list. */
  back: boolean
  /** ‹: back to what the trip was picked from — the list, a hotspot's card — or to its route with those sharing an end; null when there is none. */
  onBackToList: (() => void) | null
  onClose: () => void
}

/**
 * One direction as a trip — the owner's RouteTripDetail (Figma 3778:3183,
 * 2026-09-29): RouteCardHeader's Variant2; two tiles, the ride's Kilometer
 * and its Expected fare; then a card in the livery of the place the trip
 * leaves from, inset from the sides and rounded, where a rail runs from the
 * origin (TimelineTop) down to the place it goes to (TimelineBottomEndRoute).
 * The pesos moved off the rail into their tile with this set; a route no
 * fare rule prices has no Expected fare tile, and Kilometer takes the row
 * (the owner kept that default, 2026-09-29: nothing is drawn for it).
 *
 * The hintuans between fold into one row, "10 more hintuans" (with an s
 * since this set); opened, every one of them shows alike — a
 * place other routes end at, SM Fairview on the way to Novaliches, is a
 * hintuan like the rest (his redrawing of the 28th's big mid-route row) —
 * and "View less" folds them again. It opens folded. A lone hintuan is shown
 * as it is: a row saying "1 more hintuan" would take its place only to hide
 * it (Claude's call, 2026-09-29, the owner's "go" standing on it).
 *
 * The fold moves on the Motion tokens (the owner's "try it", 2026-09-29: no
 * frames to animate it in first): the rows open over gentle, arriving
 * (ease-enter), and fold over base, leaving (ease-exit), each drawn from the
 * top as its height grows; the chevron turns over quick (ease-move). Folded,
 * the rows stay, invisible, so they can close in view; nothing moves for a
 * phone set to reduce motion. Height is layout, which the Motion note keeps
 * to opacity and transform: a fold is its one exception, since only the
 * height can push the destination down without measuring (the owner's
 * call, 2026-09-29).
 *
 * The rows are the owner's Timeline set (3716:1894) — TimelineStick for the
 * rail, TimelineDot for the stops — drawn in red there; each livery takes
 * its own Card/<livery>/Timeline/surface.
 */
export function RouteTripDetail({
  livery,
  metres,
  fare,
  routeOrigin,
  hintuans,
  routeDirection,
  onSwitch,
  switchable,
  back,
  onBackToList,
  onClose,
}: Props) {
  const [open, setOpen] = useState(false)
  const folds = hintuans.length > 1
  const rail = TIMELINE_SURFACE[livery]

  return (
    <RouteDock
      label={`${routeOrigin} → ${routeDirection}`}
      testId="card"
      onClose={onClose}
      header={
        <RouteCardHeader
          onBackToList={onBackToList}
          onSwitch={onSwitch}
          switchable={switchable}
          back={back}
          onClose={onClose}
        />
      }
    >
      <dl className="flex w-full gap-2 bg-surface px-4 pt-3 pb-2 text-center font-sn-pro">
        <Tile testId="trip-km" label="Kilometer" value={kmLabel(metres)} />
        {fare && <Tile testId="trip-fare" label="Expected fare" value={fare} />}
      </dl>
      <div className="w-full px-3 pb-4">
        <div
          data-testid="trip"
          data-livery={livery}
          className={
            'relative isolate flex w-full flex-col overflow-clip rounded-2xl border-y-[0.6px] py-4 font-sn-pro ' +
            CARD_SURFACE[livery] +
            ' ' +
            CARD_TEXT[livery]
          }
        >
          <img src={CARD_BLOB[livery].src} alt="" aria-hidden className={BLOB_PLACE + ' ' + CARD_BLOB[livery].className} />
          {/* The fold row keeps its place among the children whether open or not,
              so a keyboard's focus stays on it while the hintuans come and go. */}
          <ol className="flex w-full flex-col">
            <TimelineTop rail={rail} routeOrigin={routeOrigin} />
            {hintuans.map((h, i) => (
              <TimelineHintuan key={i + ':' + h.id} rail={rail} label={h.label} shown={!folds || open} />
            ))}
            {folds && (
              <TimelineDisclosure rail={rail} open={open} count={hintuans.length} onToggle={() => setOpen((o) => !o)} />
            )}
            <TimelineBottomEndRoute rail={rail} routeDirection={routeDirection} />
          </ol>
          <span aria-hidden className={'pointer-events-none absolute inset-0 rounded-[inherit] ' + CARD_SHADOW[livery]} />
        </div>
      </div>
    </RouteDock>
  )
}

/**
 * One of the two tiles over the card, in Figma's row of them (3771:3055): a
 * figure under its name, on Background/surface-secondary, read out as the
 * pair it is. Figma writes the figure in a raw black; Content/primary is the
 * token nearest it.
 */
function Tile({ testId, label, value }: { testId: 'trip-km' | 'trip-fare'; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-secondary p-4">
      <dt className="text-sm/5 font-normal text-content-tertiary">{label}</dt>
      <dd data-testid={testId} className="text-2xl/8 font-bold text-content-primary">
        {value}
      </dd>
    </div>
  )
}

/**
 * Figma's TimelineDot: Content/inverse ringed in the rail's colour. It sits
 * 2px into the rail after it, as the TimelineStick's -2px gap lays them.
 */
function TimelineDot({ rail }: { rail: string }) {
  return (
    <span className={'-mb-0.5 flex shrink-0 rounded-full p-1.5 ' + rail}>
      <span className="size-3 rounded-full bg-content-inverse" />
    </span>
  )
}

/** The rail's column, 24 wide, as tall as its row. */
const STICK = 'flex w-6 shrink-0 flex-col items-center self-stretch'

/** Figma's TimelineTop: the dot the rail leaves from, and the origin in SN Pro Black. */
function TimelineTop({ rail, routeOrigin }: { rail: string; routeOrigin: string }) {
  return (
    <li data-testid="trip-origin" className="flex w-full items-center pl-4">
      <span aria-hidden className={STICK}>
        <TimelineDot rail={rail} />
        <span className={'min-h-px w-2 flex-1 ' + rail} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center pb-2.5 pl-3">
        <p className="text-2xl/8 font-black">{routeOrigin}</p>
      </div>
    </li>
  )
}

/**
 * A hintuan row open, or folded away: its one grid row runs from nothing to
 * its height (1fr), and back. `visibility` flips at the end of the fold, so
 * the row stays in sight while it closes, then leaves the words and the
 * screen reader.
 */
const ROW_SHOWN = 'visible grid-rows-[1fr] duration-gentle ease-enter'
const ROW_FOLDED = 'invisible grid-rows-[0fr] duration-base ease-exit'

/** Figma's TimelineHintuan: a hintuan on the way, its dot on the rail. */
function TimelineHintuan({ rail, label, shown }: { rail: string; label: string; shown: boolean }) {
  return (
    <li
      data-testid="trip-hintuan"
      className={
        'grid transition-[grid-template-rows,visibility] motion-reduce:transition-none ' +
        (shown ? ROW_SHOWN : ROW_FOLDED)
      }
    >
      {/* Clipped, not squeezed: the row keeps its height inside, and shows from the top. */}
      <div className="min-h-0 overflow-hidden">
        <div className="flex w-full items-start pl-4">
          <span aria-hidden className={STICK}>
            <span className={'-mb-0.5 min-h-px w-2 flex-1 ' + rail} />
            <TimelineDot rail={rail} />
            <span className={'min-h-px w-2 flex-1 ' + rail} />
          </span>
          <p className="min-w-0 flex-1 py-2.5 pl-3 text-base/6 font-medium">{label}</p>
        </div>
      </div>
    </li>
  )
}

/** Figma's TimelineDisclosure: the hintuans folded into one row, or, opened, the row that folds them. */
function TimelineDisclosure({
  rail,
  open,
  count,
  onToggle,
}: {
  rail: string
  open: boolean
  count: number
  onToggle: () => void
}) {
  return (
    <li>
      <button
        type="button"
        data-testid="trip-fold"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start pl-4 text-left"
      >
        <span aria-hidden className={STICK}>
          <span className={'min-h-px w-2 flex-1 ' + rail} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 text-sm/5 font-normal whitespace-nowrap">
          {/* One chevron, turned: Figma's chevron-down, and its chevron-up opened. */}
          <span
            aria-hidden
            className={
              'size-5 shrink-0 transition-transform duration-quick ease-move motion-reduce:transition-none *:size-full ' +
              (open ? 'rotate-180' : 'rotate-0')
            }
          >
            <ChevronDownIcon />
          </span>
          {open ? 'View less' : `${count} more hintuans`}
        </span>
      </button>
    </li>
  )
}

/** Figma's TimelineBottomEndRoute: the rail's last dot, and where the trip goes, behind the list's arrow. */
function TimelineBottomEndRoute({ rail, routeDirection }: { rail: string; routeDirection: string }) {
  return (
    <li data-testid="trip-destination" className="flex w-full items-center pl-4">
      <span aria-hidden className={STICK}>
        <span className={'-mb-0.5 h-5 w-2 shrink-0 ' + rail} />
        <TimelineDot rail={rail} />
      </span>
      <p className="flex min-w-0 flex-1 items-start gap-1 pt-4 pl-2">
        <span aria-hidden className="shrink-0 p-1 *:size-5">
          <CircleArrowRightIcon />
        </span>
        <span className="min-w-0 flex-1 text-xl/7 font-medium">{routeDirection}</span>
      </p>
    </li>
  )
}
