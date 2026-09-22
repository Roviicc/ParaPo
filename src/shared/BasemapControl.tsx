import { useEffect, useRef, useState } from 'react'
import type { MapLibreMap } from 'maplibre-gl'
import { BASEMAPS, applyBasemap, rememberBasemap, type Basemap } from './basemap'

type Props = {
  map: MapLibreMap
  /** The design the map was built with. */
  initial: Basemap
  /** Where to sit: under the zoom buttons on a desktop, under the attribution on a phone. */
  coarse: boolean
}

/**
 * One round button at the top right; tap it for the three designs. It draws
 * nothing on the map itself — `applyBasemap` does the switch and carries the
 * routes and hotspots across — so both pages get it from MapView for free.
 */
export function BasemapControl({ map, initial, coarse }: Props) {
  const [current, setCurrent] = useState<Basemap>(initial)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // A tap anywhere else closes the menu, like the chooser sheets do.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  function choose(b: Basemap) {
    setOpen(false)
    if (b.id === current.id) return
    setCurrent(b)
    rememberBasemap(b)
    applyBasemap(map, b)
  }

  return (
    <div
      ref={rootRef}
      className={`absolute right-2.5 z-10 flex flex-col items-end gap-1 ${coarse ? 'top-12' : 'top-[7.5rem]'}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Map design"
        aria-expanded={open}
        title={`Map design: ${current.label}`}
        data-testid="basemap"
        className="grid h-[29px] w-[29px] place-items-center rounded bg-white text-neutral-800
                   shadow-[0_0_0_2px_rgba(0,0,0,0.1)] hover:bg-neutral-100"
      >
        {/* Three stacked sheets: the usual sign for "layers". */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M8 2.5 14 5.5 8 8.5 2 5.5Z" />
          <path d="m2 8.5 6 3 6-3" />
          <path d="m2 11.5 6 3 6-3" />
        </svg>
      </button>
      {open && (
        <ul
          role="menu"
          data-testid="basemap-menu"
          className="min-w-28 overflow-hidden rounded-lg bg-white py-1 text-sm text-neutral-800 shadow-lg ring-1 ring-black/10"
        >
          {BASEMAPS.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={b.id === current.id}
                onClick={() => choose(b)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100"
              >
                <span className={`w-3 text-xs ${b.id === current.id ? 'text-neutral-900' : 'text-transparent'}`}>✓</span>
                {b.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
