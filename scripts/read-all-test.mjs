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

/**
 * A table of `total` rows behind a server that answers at most `cap` rows a
 * request. With `hold`, every answer waits until `release()` is called, so a
 * test can see how many requests are in flight at once.
 */
function server(total, { cap = 1000, count = true, hold = false } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls = []
  const waiting = []
  const page = (from, to) => {
    calls.push([from, to])
    const answer = { data: rows.slice(from, Math.min(to + 1, from + cap)), count: count ? total : null, error: null }
    if (!hold) return Promise.resolve(answer)
    return new Promise((resolve) => waiting.push(() => resolve(answer)))
  }
  const release = () => {
    for (const w of waiting.splice(0)) w()
  }
  return { page, calls, release }
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

test('the pages after the first are asked for together, not one after the other', async () => {
  const s = server(13250, { hold: true })
  const reading = readAll(s.page)
  await Promise.resolve()
  assert.equal(s.calls.length, 1, 'only the first page before it answers')
  s.release()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(s.calls.length, 14, 'every other page in flight at once after the first answered')
  s.release()
  assert.deepEqual(ids(await reading), all(13250))
})

test('exactly 1,000 rows: one page, and the count says so — no second request', async () => {
  const s = server(PAGE)
  assert.deepEqual(ids(await readAll(s.page)), all(PAGE))
  assert.equal(s.calls.length, 1)
})

test('a server capped below the page size (400) still gives every row, stepping by what it answers', async () => {
  const s = server(1234, { cap: 400 })
  assert.deepEqual(ids(await readAll(s.page)), all(1234))
  assert.deepEqual(s.calls, [[0, 999], [400, 799], [800, 1199], [1200, 1599]])
})

test('a page that comes back short of its share is followed up one page at a time', async () => {
  // The first page answers 1,000; the later ones only 300 each (a cap that
  // changed under the reader). Every row still arrives, none twice.
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
  let n = 0
  const page = async (from, to) => {
    const cap = n++ === 0 ? 1000 : 300
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), count: 2500, error: null }
  }
  assert.deepEqual(ids(await readAll(page)), all(2500))
})

test('with no count, a first page that is short is the end: one request', async () => {
  const s = server(53, { count: false })
  assert.deepEqual(ids(await readAll(s.page)), all(53))
  assert.equal(s.calls.length, 1)
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
