/**
 * Edit and Delete along the bottom of a card, and Extend on a drawn route.
 * The editor passes these into a shared card's `actions` slot; the public map
 * passes nothing.
 */
export function CardActions({
  editLabel,
  onEdit,
  onDelete,
  onExtend,
}: {
  editLabel: string
  onEdit: () => void
  onDelete: () => void
  /** A new route that borrows part of this direction's line. Drawn directions only. */
  onExtend?: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
      >
        {editLabel}
      </button>
      {onExtend && (
        <button
          type="button"
          onClick={onExtend}
          title="Start a new route from part of this line"
          className="rounded-lg px-3 py-2 text-sm text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50"
        >
          Extend
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg px-3 py-2 text-sm text-red-600 ring-1 ring-red-200 hover:bg-red-50"
      >
        Delete
      </button>
    </>
  )
}
