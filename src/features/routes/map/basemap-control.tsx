import type { MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { BASEMAPS, applyBasemap, rememberBasemap, type Basemap } from './basemap';
import { MapControlButton } from './map-control-button';

type Props = {
  map: MapLibreMap;
  /** The design the map was built with. */
  initial: Basemap;
  /** What MapLibre has in the top-right corner above it; the button rests under that. */
  under: Above;
};

/**
 * What can sit above the button: the attribution on a phone (it moves to the
 * top there), MapLibre's +, − and compass for a mouse in the studio, or, for
 * a mouse on the public map, nothing since the owner took those off
 * (2026-09-29) — then the button takes the corner itself.
 */
type Above = 'attribution' | 'zoom' | 'nothing';
// Below the status bar on an installed iPhone: the map's own corner controls
// already sit inside the safe area (styles/index.css), and these follow them.
const TOP = {
  attribution: 'top-[calc(3rem+env(safe-area-inset-top))]',
  zoom: 'top-[calc(7.5rem+env(safe-area-inset-top))]',
  nothing: 'top-[calc(0.625rem+env(safe-area-inset-top))]',
} satisfies Record<Above, string>;

/**
 * One round button at the top right; tap it for the three designs. It draws
 * nothing on the map itself — `applyBasemap` does the switch and carries the
 * routes and hotspots across — so both pages get it from MapView for free.
 */
export function BasemapControl({ map, initial, under }: Props) {
  const [current, setCurrent] = useState<Basemap>(initial);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A tap anywhere else closes the menu, as a tap on the map closes a card.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Escape closes the menu, as it closes a card (useEscape), and only the
  // menu: heard first, on the way down, so the card under it stays open
  // (review of 2026-10-03: the menu could not be closed from the keyboard).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  function choose(b: Basemap) {
    setOpen(false);
    if (b.id === current.id) return;
    setCurrent(b);
    rememberBasemap(b);
    applyBasemap(map, b);
  }

  return (
    <div
      ref={rootRef}
      className={`absolute right-[calc(0.625rem+env(safe-area-inset-right))] z-10 flex flex-col items-end gap-1 ${TOP[under]}`}
    >
      <MapControlButton
        onClick={() => setOpen((o) => !o)}
        aria-label="Map design"
        aria-expanded={open}
        title={`Map design: ${current.label}`}
        aria-haspopup="menu"
        data-testid="basemap"
      >
        {/* Three stacked sheets: the usual sign for "layers". */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        >
          <path d="M8 2.5 14 5.5 8 8.5 2 5.5Z" />
          <path d="m2 8.5 6 3 6-3" />
          <path d="m2 11.5 6 3 6-3" />
        </svg>
      </MapControlButton>
      {open && (
        <ul
          role="menu"
          data-testid="basemap-menu"
          className="min-w-28 overflow-hidden rounded-lg bg-surface py-1 text-sm text-content-secondary shadow-lg ring-1 ring-black/10"
        >
          {BASEMAPS.map((b) => (
            <li key={b.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={b.id === current.id}
                onClick={() => choose(b)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-secondary"
              >
                <span
                  className={`w-3 text-xs ${b.id === current.id ? 'text-content-primary' : 'text-transparent'}`}
                >
                  ✓
                </span>
                {b.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
