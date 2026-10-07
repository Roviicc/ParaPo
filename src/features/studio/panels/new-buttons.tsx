import type { HotspotKind } from '../drawing/use-drawing'

/**
 * The studio's two ways to start, at the bottom right: + New Route, and +
 * New hotspot with its menu — a terminal or a hintuan. Disabled until the
 * map is there to draw on. Split from StudioApp.tsx, 2026-09-29; the menu's
 * open state stays the workshop's, which keeps it while these buttons are
 * away (a drawing, the list).
 */
export function NewButtons({
  ready,
  menu,
  setMenu,
  onNewRoute,
  onNewHotspot,
}: {
  ready: boolean
  /** Whether the hotspot menu is open. */
  menu: boolean
  setMenu: (open: boolean | ((open: boolean) => boolean)) => void
  onNewRoute: () => void
  onNewHotspot: (kind: HotspotKind) => void
}) {
  return (
    <div
      className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))]
                 z-10 flex flex-col items-end gap-2"
    >
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
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-50 pointer-coarse:min-h-11"
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
            className="flex w-full items-center gap-2 border-t border-neutral-100 px-4 py-2.5 text-left hover:bg-neutral-50 pointer-coarse:min-h-11"
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
