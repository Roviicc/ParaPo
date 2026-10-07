// The studio's hotspot save (src/features/studio/data/hotspots-write.ts, saveStop)
// against a fake client.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/stop-save-test.mjs
//
// Review of 2026-10-03, finding 4: the row goes in, then its links in
// separate requests; when the links failed, Save again inserted the box a
// second time. saveStop now says which row it wrote, and the retry, given
// that id, updates it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSupabase } from './fixtures/fake-supabase.mjs';
import { setSupabase } from '../../src/features/studio/data/supabase.ts';
import { deleteStop, saveStop } from '../../src/features/studio/data/hotspots-write.ts';

const ring = [
  [121.04, 14.7],
  [121.0401, 14.7],
  [121.0401, 14.7001],
  [121.04, 14.7001],
];
const input = {
  stopId: null,
  kind: 'hintuan',
  name: 'Tala Ilalim',
  informal: 'Tala',
  aliases: [],
  note: '',
  ring,
  directions: [],
};
const row = { id: 's1', name: 'Tala Ilalim', informal: 'Tala', kind: 'hintuan', line: null };

test('a hotspot whose links failed is updated by the retry, not inserted again', async () => {
  let linksDown = true;
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'stop' && (q.op === 'insert' || q.op === 'update')) return { data: row };
    if (q.table === 'route_stop' && q.op === 'delete')
      return linksDown ? { error: { message: 'network' } } : {};
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  let written = null;
  await assert.rejects(
    saveStop(input, (id) => (written = id)),
    /hotspot is saved.*Press Save again/,
  );
  assert.equal(written, 's1');

  linksDown = false;
  const saved = await saveStop({ ...input, stopId: written }, (id) => (written = id));
  assert.equal(saved.id, 's1');
  const hotspotWrites = log.filter((q) => q.table === 'stop').map((q) => q.op);
  assert.deepEqual(hotspotWrites, ['insert', 'update']);
  assert.deepEqual(log.filter((q) => q.table === 'stop')[1].filters, [['eq', 'id', 's1']]);
});

test('a hotspot delete that matched no row says so (review of 2026-10-03, finding 6)', async () => {
  const { client } = fakeSupabase((q) => {
    if (q.table === 'stop' && q.op === 'delete') return { data: [] };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await assert.rejects(deleteStop({ id: 's1' }), /Nothing was changed/);
});
