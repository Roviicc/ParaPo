import type { Timeline, TimelineStop } from '../model/stops'

/**
 * A direction as a line of stops, the way a train app shows a line: where it
 * leaves from at the top, every hintuan it passes in order, where it is going
 * at the bottom. The ends are filled dots; the hintuans are hollow. Flipping
 * the direction turns the whole thing upside down, which is exactly what
 * riding it the other way means.
 *
 * `onPick` makes each row a button — the ride-to preview: the map shows the
 * ride only up to that hintuan — and is left off where there is no map to
 * show it on (the save panel). `pickedId` is the row ridden to: it reads as
 * the end for now, and every row past it fades.
 */
/** "Passes through 3 hintuans" — the one wording the card and the save panel share. */
export function passesThrough(n: number): string {
  return `Passes through ${n} ${n === 1 ? 'hintuan' : 'hintuans'}`
}

export function StopTimeline({
  timeline,
  onPick,
  pickedId = null,
}: {
  timeline: Timeline
  /** Called with the row's id, or null for an end row (ride the whole way). */
  onPick?: (id: string | null) => void
  pickedId?: string | null
}) {
  const rows: (TimelineStop & { end: boolean })[] = [
    ...(timeline.from ? [{ ...timeline.from, end: true }] : []),
    ...timeline.between.map((s) => ({ ...s, end: false })),
    ...(timeline.to ? [{ ...timeline.to, end: true }] : []),
  ]
  if (rows.length === 0) return null
  const pickedAt = pickedId ? rows.findIndex((s) => s.id === pickedId && !s.end) : -1

  return (
    <ol data-testid="timeline" className="relative mt-2 space-y-0">
      {/* The line itself, behind the dots, from the first dot to the last. */}
      <span aria-hidden className="absolute bottom-3 left-1.25 top-3 w-0.5 bg-neutral-300" />
      {rows.map((s, i) => {
        const picked = i === pickedAt
        const past = pickedAt >= 0 && i > pickedAt
        const dot =
          s.end || picked
            ? 'h-3 w-3 rounded-full bg-neutral-900 ring-2 ring-white'
            : 'h-3 w-3 rounded-full border-2 border-neutral-500 bg-white'
        const inner = (
          <>
            <span className={'relative z-10 shrink-0 ' + dot} />
            <span
              className={
                'min-w-0 truncate ' + (s.end || picked ? 'font-medium text-neutral-900' : 'text-neutral-800')
              }
            >
              {s.label}
              {s.end && s.kind === 'terminal' && (
                <>
                  {' '}
                  <span className="ml-1 text-[11px] font-normal text-neutral-400">terminal</span>
                </>
              )}
              {picked && <span className="ml-1 text-[11px] font-normal text-neutral-400">get off here</span>}
            </span>
          </>
        )
        return (
          <li key={s.id + (s.end ? '-end' : '')} className={'relative' + (past ? ' opacity-40' : '')}>
            {onPick ? (
              <button
                type="button"
                data-testid="timeline-row"
                aria-pressed={picked}
                onClick={() => onPick(s.end || picked ? null : s.id)}
                title={
                  s.end || picked ? 'Show the whole route' : 'Show the ride up to here'
                }
                className="flex w-full items-center gap-3 rounded py-1.5 pl-0 pr-1 text-left text-sm hover:bg-neutral-50"
              >
                {inner}
              </button>
            ) : (
              <span className="flex items-center gap-3 py-1.5 text-sm">{inner}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
