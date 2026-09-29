import { useState } from 'react'
import type { HotspotKind } from '../drawing/useDrawing'

/**
 * The studio's two ways to start, at the bottom right: + New Route, and +
 * New hotspot with its menu — a terminal or a hintuan. Disabled until the
 * map is there to draw on.
 */
export function NewButtons({
  ready,
  onNewRoute,
  onNewHotspot,
}: {
  ready: boolean
  onNewRoute: () => void
  onNewHotspot: (kind: HotspotKind) => void
}) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
      {menu && (
        <div
          role="menu"
          className="mb-1 overflow-hidden rounded-xl bg-white text-sm shadow-lg ring-1 ring-black/10"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              onNewHotspot('terminal')
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-50"
          >
            <span className="h-3 w-3 rounded-sm bg-sky-500" />
            <span>
              <span className="font-medium text-neutral-900">Terminal</span>
              <span className="block text-xs text-neutral-500">Where routes start and stage</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              onNewHotspot('hintuan')
            }}
            className="flex w-full items-center gap-2 border-t border-neutral-100 px-4 py-2.5 text-left hover:bg-neutral-50"
          >
            <span className="h-3 w-3 rounded-sm bg-orange-500" />
            <span>
              <span className="font-medium text-neutral-900">Hintuan</span>
              <span className="block text-xs text-neutral-500">Where people wait and board</span>
            </span>
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={onNewRoute}
        title="Draw a route"
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-800
                   shadow-lg ring-1 ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + New Route
      </button>
      <button
        type="button"
        disabled={!ready}
        onClick={() => setMenu((open) => !open)}
        aria-expanded={menu}
        title="Trace a terminal or hintuan"
        className="rounded-full bg-white px-5 py-3 text-sm font-medium text-neutral-800
                   shadow-lg ring-1 ring-black/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + New hotspot
      </button>
    </div>
  )
}
