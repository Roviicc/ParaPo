/**
 * Read a whole table through a server that answers a bounded number of rows
 * a request.
 *
 * Supabase's REST layer returns at most 1,000 rows to a request by default
 * (the project's "max rows" setting) and says nothing when it cuts: a table
 * of 1,400 rows answers 1,000 with a 200, and a reader that trusts one
 * answer silently loses the rest. The editor's links table crosses 1,000 at
 * about forty routes.
 *
 * `page(from, to)` asks for rows `from`..`to` inclusive, in a stable order,
 * and returns them with the table's total count. The loop asks page after
 * page until it holds `count` rows, so it is right whatever the server's
 * cap is — it stops on the count, not on a short page — and it costs one
 * request for a table that fits in one page.
 *
 * A caller's order must be total (end it with a unique column) or pages can
 * overlap or skip: rows tie on `updated_at`, not on `id`.
 */
export const PAGE = 1000

export type Page<T> = {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

export async function readAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, count, error } = await page(rows.length, rows.length + PAGE - 1)
    if (error) throw new Error(error.message)
    const got = data ?? []
    rows.push(...got)
    // No count means a server that did not say; the short page is then the
    // only sign of the end. An empty page always is: nothing to add.
    if (got.length === 0 || (count !== null ? rows.length >= count : got.length < PAGE)) return rows
  }
}
