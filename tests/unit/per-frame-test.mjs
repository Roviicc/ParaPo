// What arrives in a burst, handed on once a frame (src/shared/map/perFrame.ts):
// the directions' full lines as useSavedRoutes takes them in since the
// cheap-phone plan, step 16 (e), 2026-10-04. A fake frame clock stands in
// for the browser's.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/per-frame-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { perFrame } from '../../src/shared/map/perFrame.ts'

/** A frame clock the test turns by hand: `tick` runs the frame's callbacks. */
function clock() {
  let next = 1
  const waiting = new Map()
  return {
    request: (run) => {
      waiting.set(next, run)
      return next++
    },
    cancel: (h) => waiting.delete(h),
    tick() {
      const runs = [...waiting.values()]
      waiting.clear()
      for (const run of runs) run()
    },
    get waiting() {
      return waiting.size
    },
  }
}

test('arrivals in one frame are handed on together, once, at the frame, and not before', () => {
  const frames = clock()
  const batches = []
  const lines = perFrame((b) => batches.push(new Map(b)), frames)
  lines.add('a', 1)
  lines.add('b', 2)
  lines.add('c', 3)
  assert.equal(batches.length, 0, 'nothing handed on as they arrive')
  assert.equal(frames.waiting, 1, 'one frame asked for, not three')
  frames.tick()
  assert.deepEqual(batches, [new Map([['a', 1], ['b', 2], ['c', 3]])])
  frames.tick()
  assert.equal(batches.length, 1, 'nothing more without arrivals')
})

test('the later of two for one key wins; the next frame takes only what came after', () => {
  const frames = clock()
  const batches = []
  const lines = perFrame((b) => batches.push(new Map(b)), frames)
  lines.add('a', 1)
  lines.add('a', 2)
  frames.tick()
  lines.add('b', 3)
  frames.tick()
  assert.deepEqual(batches, [new Map([['a', 2]]), new Map([['b', 3]])])
})

test('clear drops what has not been handed on, and its frame; arrivals after it go on as before', () => {
  const frames = clock()
  const batches = []
  const lines = perFrame((b) => batches.push(new Map(b)), frames)
  lines.add('a', 1)
  lines.clear()
  assert.equal(frames.waiting, 0, 'the frame is let go')
  frames.tick()
  assert.equal(batches.length, 0)
  lines.add('b', 2)
  assert.equal(frames.waiting, 1)
  frames.tick()
  assert.deepEqual(batches, [new Map([['b', 2]])])
  lines.clear()
  assert.equal(frames.waiting, 0, 'clear with nothing waiting is nothing')
})

test('an arrival while a batch is being handed on goes in the next frame', () => {
  const frames = clock()
  const batches = []
  const lines = perFrame((b) => {
    batches.push(new Map(b))
    if (b.has('a')) lines.add('late', 9)
  }, frames)
  lines.add('a', 1)
  frames.tick()
  assert.equal(frames.waiting, 1)
  frames.tick()
  assert.deepEqual(batches, [new Map([['a', 1]]), new Map([['late', 9]])])
})
