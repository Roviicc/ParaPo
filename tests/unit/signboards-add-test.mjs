// Several signboards added at once (src/features/studio/data/signboards.ts,
// addSignboards), one refused halfway.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/signboards-add-test.mjs
//
// Review of 2026-10-03, finding 11: the editor learned the list only when
// every file was in, so after a refusal it held the list from before, and
// the next change wrote that back over the boards already uploaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSignboards } from '../../src/features/studio/data/signboards.ts';

test('each board listed is heard before a later one is refused', async () => {
  const add = async (_id, now, file) => {
    if (file.name === 'bad.svg') throw new Error('bad.svg: Not an SVG file.');
    return [...now, file.name];
  };
  const steps = [];
  const files = [{ name: 'a.svg' }, { name: 'b.svg' }, { name: 'bad.svg' }, { name: 'c.svg' }];
  await assert.rejects(
    addSignboards('v1', ['old.svg'], files, (l) => steps.push(l), add),
    /bad\.svg/,
  );
  assert.deepEqual(steps, [
    ['old.svg', 'a.svg'],
    ['old.svg', 'a.svg', 'b.svg'],
  ]);
});

test('all in: the whole list back, heard after each', async () => {
  const steps = [];
  const list = await addSignboards(
    'v1',
    [],
    [{ name: 'a.svg' }, { name: 'b.svg' }],
    (l) => steps.push(l),
    async (_i, now, f) => [...now, f.name],
  );
  assert.deepEqual(list, ['a.svg', 'b.svg']);
  assert.equal(steps.length, 2);
});
