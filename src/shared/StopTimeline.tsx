import type { Timeline, TimelineStop } from './stops'

/**
 * A direction as a line of stops, the way a train app shows a line: where it
 * leaves from at the top, every hintuan it passes in order, where it is going
 * at the bottom. The ends are filled dots; the hintuans are hollow. Flipping
 * the direction turns the whole thing upside down, which is exactly what
 * riding it the other way means.
 *
 * `onPick` makes each row a button — the map shows that box — and is left off
 * where there is no map to show it on (the save panel).
 */
/** "Passes through 3 hintuans" — the one wording the card and the save panel share. */
export function passesThrough(n: number): string {
  return `Passes through ${n} ${n === 1 ? 'hintuan' : 'hintuans'}`
}

export function StopTimeline({ timeline, onPick }: { timeline: Timeline; onPick?: (id: string) => void }) {
  const rows: (TimelineStop & { end: boolean })[] = [
    ...(timeline.from ? [{ ...timeline.from, end: true }] : []),
    ...timeline.between.map((s) => ({ ...s, end: false })),
    ...(timeline.to ? [{ ...timeline.to, end: true }] : []),
  ]
  if (rows.length === 0) return null

  return (
    <ol data-testid="timeline" className="relative mt-2 space-y-0">
      {/* The line itself, behind the dots, from the first dot to the last. */}
      <span aria-hidden className="absolute bottom-3 left-1.25 top-3 w-0.5 bg-neutral-300" />
      {rows.map((s) => {
        const dot = s.end
          ? 'h-3 w-3 rounded-full bg-neutral-900 ring-2 ring-white'
          : 'h-3 w-3 rounded-full border-2 border-neutral-500 bg-white'
        const inner = (
          <>
            <span className={'relative z-10 shrink-0 ' + dot} />
            <span className={'min-w-0 truncate ' + (s.end ? 'font-medium text-neutral-900' : 'text-neutral-800')}>
              {s.label}
              {s.end && s.kind === 'terminal' && (
                <>
                  {' '}
                  <span className="ml-1 text-[11px] font-normal text-neutral-400">terminal</span>
                </>
              )}
            </span>
          </>
        )
        return (
          <li key={s.id} className="relative">
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(s.id)}
                title="Show this hotspot on the map"
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
