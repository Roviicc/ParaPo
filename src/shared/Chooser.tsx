import type { VariantSummary } from './routes'
import { Sheet } from './Sheet'
import type { StopSummary } from './stops'

type Props = {
  routes?: VariantSummary[]
  stops?: StopSummary[]
  onRoute: (v: VariantSummary) => void
  onStop: (s: StopSummary) => void
  onClose: () => void
}

/** "2 routes", "1 hotspot", "2 routes · 1 hotspot". */
function title(routes: number, stops: number): string {
  const parts = []
  if (routes > 0) parts.push(`${routes} ${routes === 1 ? 'route' : 'routes'}`)
  if (stops > 0) parts.push(`${stops} ${stops === 1 ? 'hotspot' : 'hotspots'}`)
  return parts.join(' · ') + ' here'
}

/**
 * Several things under one tap.
 *
 * A finger covers about 20 px of map, and in Metro Manila most roads carry
 * more than one route, so a tap that hits two or three lines is the normal
 * case, not the edge case; a terminal has its own route running through it.
 * Rather than guess which one was meant, list them all.
 *
 * It opens pulled up: a chooser that only peeks would hide the very choice it
 * exists to offer. Whoever renders it gives it a key from what it lists, so a
 * fresh tap gets a fresh, open sheet.
 */
export function Chooser({ routes = [], stops = [], onRoute, onStop, onClose }: Props) {
  return (
    <Sheet
      onClose={onClose}
      initial="open"
      testId="chooser"
      peek={<p className="text-base font-semibold text-neutral-900">{title(routes.length, stops.length)}</p>}
    >
      {/* Full-bleed rows: a whole row is the target, not the words inside it. */}
      <ul className="-mx-4 mt-3 border-t border-neutral-200">
        {routes.map((v) => (
          <li key={v.id} className="border-b border-neutral-200 last:border-b-0">
            <button
              type="button"
              data-testid="chooser-item"
              onClick={() => onRoute(v)}
              className="block w-full px-4 py-2.5 text-left hover:bg-neutral-100"
            >
              <span className="block truncate font-medium text-neutral-900">
                {v.route?.signboard}
              </span>
              <span className="block truncate text-xs text-neutral-500">{v.direction_name}</span>
            </button>
          </li>
        ))}
        {stops.map((s) => (
          <li key={s.id} className="border-b border-neutral-200 last:border-b-0">
            <button
              type="button"
              data-testid="chooser-item"
              onClick={() => onStop(s)}
              className="block w-full px-4 py-2.5 text-left hover:bg-neutral-100"
            >
              <span className="block truncate font-medium text-neutral-900">{s.name}</span>
              <span className="block truncate text-xs text-neutral-500">
                {s.kind === 'terminal' ? 'Terminal' : 'Hintuan'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
