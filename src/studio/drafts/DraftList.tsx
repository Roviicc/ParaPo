import { draftDetail, type HintuanDraft } from './drafts'

/**
 * The hintuan drafts still to look at, north to south, in place of the + New
 * buttons while it is open: a row opens its draft as an outline, its name
 * filled in, for the owner to check against the ground and save (or ✕ and
 * leave). Under each name, the saved hotspot nearest it and how far: a draft
 * a few tens of metres from one may be the same stop by another name.
 */
export function DraftList({
  area,
  drafts,
  onOpen,
  onClose,
}: {
  area: string
  drafts: readonly HintuanDraft[]
  onOpen: (d: HintuanDraft) => void
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label={`Hintuan drafts in ${area}`}
      className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))]
                 z-10 flex max-h-[min(32rem,calc(100%-6rem))] w-80 max-w-[calc(100%-3rem)] flex-col overflow-hidden
                 rounded-xl bg-white text-sm shadow-lg ring-1 ring-black/10"
    >
      <div className="flex items-start gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-neutral-900">
            Hintuan drafts in {area} · {drafts.length}
          </p>
          <p className="text-xs text-neutral-500">From OpenStreetMap's stops. Open one, check it on the ground, save it.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the drafts"
          className="-mr-1 rounded-full px-2 text-lg leading-none text-neutral-500 hover:text-neutral-900 pointer-coarse:min-h-11"
        >
          ×
        </button>
      </div>
      {drafts.length === 0 ? (
        <p className="px-4 py-3 text-neutral-500">None left: each is saved, or a hotspot stands where it was.</p>
      ) : (
        <ul className="overflow-y-auto">
          {drafts.map((d) => (
            <li key={d.id} className="border-t border-neutral-100 first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(d)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-50 pointer-coarse:min-h-11"
              >
                <span className="h-3 w-3 shrink-0 rounded-sm border border-dashed border-violet-600 bg-violet-600/10" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900">{d.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{draftDetail(d)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
