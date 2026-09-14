/**
 * Edit and Delete along the bottom of a card. The editor passes these into a
 * shared card's `actions` slot; the public map passes nothing.
 */
export function CardActions({
  editLabel,
  onEdit,
  onDelete,
}: {
  editLabel: string
  onEdit: () => void
  onDelete: () => void
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
