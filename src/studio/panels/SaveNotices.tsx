import type { Drawing } from '../drawing/useDrawing'
import { routeStreets } from '../drawing/snap'
import type { VariantRow } from '../../shared/model/routes'

/**
 * What the save panel says about the line before it is saved: the streets it
 * runs along, the U-turns ringed on the map, a return trip drawn from the
 * wrong end, what an Extend shares with its parent, ends that already make
 * a route, and no hotspots at all to end at. Each says and never blocks;
 * the `save-*` test ids are the suites' (split from SavePanel.tsx,
 * 2026-09-29).
 */
export function SaveNotices({
  segments,
  uTurns,
  stopsCount,
  wrongWay,
  borrowed,
  sameEnds,
  direction,
}: {
  /** The drawing's stretches, for the streets they run along. */
  segments: Drawing['segments']
  /** The U-turns ringed on the map. */
  uTurns: Drawing['uTurns']
  stopsCount: number
  /** The slot's direction, the end the line starts nearer, and the end it should. */
  wrongWay: { direction: string; startsAt: string; from: string } | null
  borrowed: { metres: number; parent: VariantRow } | null
  sameEnds: { name: string; drawn: boolean } | null
  direction: string
}) {
  const streets = routeStreets(segments)
  return (
    <>
      {/* For a jeepney the street list says more than the two terminals do. */}
      {streets.names.length > 0 && (
        <p data-testid="save-streets" className="mt-2 text-xs text-neutral-700">
          via {streets.names.join(' → ')}
          {streets.straight > 0 && (
            <span className="text-neutral-400">
              {' '}
              · and {streets.straight} straight {streets.straight === 1 ? 'stretch' : 'stretches'}
            </span>
          )}
        </p>
      )}
      {streets.missing > 0 && (
        <p className="mt-1 text-[11px] text-neutral-400">
          No street names yet for {streets.missing === 1 ? 'one stretch' : `${streets.missing} stretches`}{' '}
          routed before they were recorded. Moving a point re-routes its stretches and fills them in.
        </p>
      )}
      {uTurns.length > 0 && (
        <p
          data-testid="save-uturns"
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          This route turns back on itself at{' '}
          {uTurns.length === 1 ? 'one point' : `${uTurns.length} points`}, ringed in amber
          on the map. Save anyway if the jeep really turns there; otherwise go back and drag the
          point to the corner.
        </p>
      )}
      {wrongWay && (
        <p
          data-testid="save-wrong-way"
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          This is the slot for <strong>{wrongWay.direction}</strong>, but the line starts nearer{' '}
          {wrongWay.startsAt}. If you drew it from the wrong end, go back and
          redraw it starting at {wrongWay.from}; if the jeep really leaves
          from there, save anyway.
        </p>
      )}

      {borrowed && (
        <p data-testid="save-borrowed" className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Shares {(borrowed.metres / 1000).toFixed(2)} km with <strong>{borrowed.parent.direction_name}</strong>{' '}
          ({borrowed.parent.route.name}), copied from it. If that line is changed later, this one can
          follow.
        </p>
      )}

      {sameEnds && (
        <p
          data-testid="save-same-ends"
          className={
            'mt-3 rounded-lg px-3 py-2 text-xs ' +
            (sameEnds.drawn ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900')
          }
        >
          {sameEnds.drawn ? (
            <>
              <strong>{sameEnds.name}</strong> already has {direction || 'this direction'} drawn. To
              change it, open it and press Edit route.
            </>
          ) : (
            <>
              <strong>{sameEnds.name}</strong> already exists, and {direction || 'this direction'} is
              still undrawn: this line fills it. The route's signboard, mode and fare stay as they
              are.
            </>
          )}
        </p>
      )}

      {stopsCount === 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No hotspots yet. A route is named after the hotspots at its two ends, so draw a terminal
          at each end of this line first — then come back and save.
        </p>
      )}
    </>
  )
}
