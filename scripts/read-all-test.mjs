// The studio's paged table reader (src/studio/readAll.ts) against a fake
// server that caps its answers, the way Supabase's REST layer does.
//
//   node --experimental-strip-types scripts/read-all-test.mjs
//
// Why this exists: a table of 1,400 rows answers 1,000 with a 200 and no
// warning, and the editor would draw directions with hotspots missing and no
// error anywhere. This proves the reader keeps asking until it holds every
// row, whatever the server's cap, and asks once when one page is enough.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAll, PAGE } from '../src/studio/readAll.ts'

/** A table of `total` rows behind a server that answers at most `cap` rows a request. */
function server(total, { cap = 1000, count = true } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls = []
  const page = async (from, to) => {
    calls.push([from, to])
    const data = rows.slice(from, Math.min(to + 1, from + cap))
    return { data, count: count ? total : null, error: null }
  }
  return { page, calls }
}

const ids = (rows) => rows.map((r) => r.id)
const all = (n) => Array.from({ length: n }, (_, i) => i)

test('a table that fits in one page costs one request', async () => {
  const s = server(53)
  assert.deepEqual(ids(await readAll(s.page)), all(53))
  assert.equal(s.calls.length, 1)
})

test('2,350 rows behind a 1,000-row cap come back whole, in order, in three requests', async () => {
  const s = server(2350)
  assert.deepEqual(ids(await readAll(s.page)), all(2350))
  assert.deepEqual(s.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('exactly 1,000 rows: one page, and the count says so — no second request', async () => {
  const s = server(PAGE)
  assert.deepEqual(ids(await readAll(s.page)), all(PAGE))
  assert.equal(s.calls.length, 1)
})

test('a server capped below the page size (400) still gives every row', async () => {
  const s = server(1234, { cap: 400 })
  assert.deepEqual(ids(await readAll(s.page)), all(1234))
  assert.equal(s.calls.length, 4)
})

test('with no count, a short page is the end', async () => {
  const s = server(1500, { count: false })
  assert.deepEqual(ids(await readAll(s.page)), all(1500))
  assert.equal(s.calls.length, 2)
})

test('with no count and a full last page, one empty request ends it', async () => {
  const s = server(2000, { count: false })
  assert.deepEqual(ids(await readAll(s.page)), all(2000))
  assert.equal(s.calls.length, 3)
})

test('an empty table is an empty list', async () => {
  const s = server(0)
  assert.deepEqual(await readAll(s.page), [])
  assert.equal(s.calls.length, 1)
})

test('the server\'s error is thrown with its message', async () => {
  await assert.rejects(
    readAll(async () => ({ data: null, count: null, error: { message: 'permission denied for table stop' } })),
    { message: 'permission denied for table stop' },
  )
})
