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
 * and returns them with the table's total count. The first page says how
 * many rows there are and how many the server answers at once; the rest
 * are asked for together, one request per page, rather than one after the
 * other — with 1,000 directions the links table is 14 pages, and asked in
 * turn they were 14 round trips (measured 2026-09-25, future-proofing
 * stage 2). It is right whatever the server's cap is, because it steps by
 * the size the server actually answered with, not by PAGE, and it costs one
 * request for a table that fits in one page.
 *
 * A server that gives no count is read the old way, page after page until
 * a short one: nothing says how many to ask for.
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
  const first = await page(0, PAGE - 1)
  if (first.error) throw new Error(first.error.message)
  const rows: T[] = first.data ?? []
  if (rows.length === 0) return rows
  if (first.count !== null ? rows.length >= first.count : rows.length < PAGE) return rows

  if (first.count !== null) {
    // The rest, together. The server answered `step` rows: that is its cap
    // when below PAGE, and it will answer the same again.
    const step = rows.length
    const asks: PromiseLike<Page<T>>[] = []
    for (let from = step; from < first.count; from += step) asks.push(page(from, from + step - 1))
    for (const p of await Promise.all(asks)) {
      if (p.error) throw new Error(p.error.message)
      const got = p.data ?? []
      rows.push(...got)
      // A short page, other than the last: the pages after it were asked
      // for from too far along, so they are dropped and read again below.
      if (got.length < step) break
    }
    if (rows.length >= first.count) return rows
  }

  // No count, or a page that came back short of its share (a server whose
  // cap changed under us): carry on one page at a time, from the row after
  // the last one held.
  for (;;) {
    const { data, count, error } = await page(rows.length, rows.length + PAGE - 1)
    if (error) throw new Error(error.message)
    const got = data ?? []
    rows.push(...got)
    if (got.length === 0 || (count !== null ? rows.length >= count : got.length < PAGE)) return rows
  }
}
