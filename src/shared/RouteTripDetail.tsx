import { useState } from 'react'
import type { Livery } from './liveries'
import { BLOB_PLACE, CARD_BLOB, CARD_SHADOW, CARD_SURFACE, CARD_TEXT, TIMELINE_SURFACE } from './liveryCard'
import { RouteCardHeader } from './RouteCardHeader'
import { RouteDock } from './RouteDock'
import { ChevronDownIcon, ChevronUpIcon, CircleArrowRightIcon } from './RouteIcons'

type Props = {
  livery: Livery
  /** Figma's Fare on TimelineTop: the whole ride's pesos, `₱24–28`. Omitted when unpriced. */
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
  /** ‹: back to what the trip was picked from — the list, the Chooser, a hotspot's card — or to its route with those sharing an end; null when there is none. */
  onBackToList: (() => void) | null
  onClose: () => void
}

/**
 * One direction as a trip — the owner's RouteTripDetail (Figma 3732:2516,
 * folded as his section 3762:3546 draws it, 2026-09-29): RouteCardHeader's
 * Variant2 over a card in the livery of the place the trip leaves from,
 * where a rail runs from the fare and the origin (TimelineTop) down to the
 * place it goes to (TimelineBottomEndRoute).
 *
 * The hintuans between fold into one row, "10 more hintuan" (the owner
 * writes hintuan without an s); opened, every one of them shows alike — a
 * place other routes end at, SM Fairview on the way to Novaliches, is a
 * hintuan like the rest (his redrawing of the 28th's big mid-route row) —
 * and "View less" folds them again. It opens folded. A lone hintuan is shown
 * as it is: a row saying "1 more hintuan" would take its place only to hide
 * it (Claude's call, 2026-09-29, the owner's "go" standing on it).
 *
 * The rows are the owner's Timeline set (3716:1894) — TimelineStick for the
 * rail, TimelineDot for the stops — drawn in red there; each livery takes
 * its own Card/<livery>/Timeline/surface.
 */
export function RouteTripDetail({
  livery,
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
      <div
        data-testid="trip"
        data-livery={livery}
        className={
          'relative isolate flex w-full flex-col overflow-clip border-y-[0.6px] py-4 font-sn-pro ' +
          CARD_SURFACE[livery] +
          ' ' +
          CARD_TEXT[livery]
        }
      >
        <img src={CARD_BLOB[livery].src} alt="" aria-hidden className={BLOB_PLACE + ' ' + CARD_BLOB[livery].className} />
        {/* The fold row keeps its place among the children whether open or not,
            so a keyboard's focus stays on it while the hintuans come and go. */}
        <ol className="flex w-full flex-col">
          <TimelineTop rail={rail} fare={fare} routeOrigin={routeOrigin} />
          {(!folds || open) &&
            hintuans.map((h, i) => <TimelineHintuan key={i + ':' + h.id} rail={rail} label={h.label} />)}
          {folds && (
            <TimelineDisclosure rail={rail} open={open} count={hintuans.length} onToggle={() => setOpen((o) => !o)} />
          )}
          <TimelineBottomEndRoute rail={rail} routeDirection={routeDirection} />
        </ol>
        <span aria-hidden className={'pointer-events-none absolute inset-0 ' + CARD_SHADOW[livery]} />
      </div>
    </RouteDock>
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

/** Figma's TimelineTop: the dot the rail leaves from, the fare, the origin in SN Pro Black. */
function TimelineTop({ rail, fare, routeOrigin }: { rail: string; fare?: string; routeOrigin: string }) {
  return (
    <li data-testid="trip-origin" className="flex w-full items-center pl-4">
      <span aria-hidden className={STICK}>
        <TimelineDot rail={rail} />
        <span className={'min-h-px w-2 flex-1 ' + rail} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center pb-2.5 pl-3">
        {fare && (
          <p data-testid="trip-fare" className="text-sm/5 font-normal">
            {fare}
          </p>
        )}
        <p className="text-2xl/8 font-black">{routeOrigin}</p>
      </div>
    </li>
  )
}

/** Figma's TimelineHintuan: a hintuan on the way, its dot on the rail. */
function TimelineHintuan({ rail, label }: { rail: string; label: string }) {
  return (
    <li data-testid="trip-hintuan" className="flex w-full items-start pl-4">
      <span aria-hidden className={STICK}>
        <span className={'-mb-0.5 min-h-px w-2 flex-1 ' + rail} />
        <TimelineDot rail={rail} />
        <span className={'min-h-px w-2 flex-1 ' + rail} />
      </span>
      <p className="min-w-0 flex-1 py-2.5 pl-3 text-sm/5 font-medium">{label}</p>
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
          <span aria-hidden className="size-5 shrink-0 *:size-full">
            {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </span>
          {open ? 'View less' : `${count} more hintuan`}
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
        <span className="min-w-0 flex-1 text-lg/7 font-medium">{routeDirection}</span>
      </p>
    </li>
  )
}
