// The studio's direction save (src/features/studio/data/routes-write.ts, saveDirection)
// against a fake client: which rows a failed save takes back out.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/route-save-test.mjs
//
// Review of 2026-10-03, finding 3: when the two directions' insert failed,
// the route row was deleted whether this save had inserted it or claimed it
// from another save still in flight, and two overlapping saves of one new
// route cascaded the first one's line away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSupabase } from './fixtures/fake-supabase.mjs';
import { setSupabase } from '../../src/features/studio/data/supabase.ts';
import { deleteDirection, saveDirection } from '../../src/features/studio/data/routes-write.ts';

const input = {
  routeId: null,
  directionId: null,
  signboard: '',
  mode: 'jeepney',
  fare_note: '',
  head_stop_id: 'tala',
  tail_stop_id: 'fairview',
  via: '',
  reversed: false,
  control_points: [
    [121.04, 14.7],
    [121.05, 14.7],
  ],
  segments: [
    {
      mode: 'freehand',
      coordinates: [
        [121.04, 14.7],
        [121.05, 14.7],
      ],
    },
  ],
  borrowed_from: null,
  borrowed_part: null,
  borrowed_m: null,
};

const refused = { code: '23505', message: 'duplicate key value violates unique constraint' };

test("a save that claimed another save's route does not delete it when its directions are refused", async () => {
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route' && q.op === 'insert') return { error: refused };
    // The other save's route, its directions not in yet: an orphan to claim.
    if (q.table === 'route' && q.op === 'select') return { data: { id: 'r1', route_variant: [] } };
    if (q.table === 'route' && q.op === 'update') return {};
    // Meanwhile the other save's directions landed.
    if (q.table === 'route_variant' && q.op === 'insert') return { error: refused };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await assert.rejects(saveDirection(input));
  assert.equal(log.filter((q) => q.op === 'delete').length, 0);
});

test('a save that inserted the route takes it back out when its directions are refused', async () => {
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route' && q.op === 'insert') return { data: { id: 'r2' } };
    if (q.table === 'route_variant' && q.op === 'insert')
      return { error: { code: '23502', message: 'null value' } };
    if (q.table === 'route' && q.op === 'delete') return {};
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await assert.rejects(saveDirection(input), /null value/);
  const deletes = log.filter((q) => q.op === 'delete');
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0].filters, [['eq', 'id', 'r2']]);
});

// Finding 6: with the session gone the publishable key matches no row, and
// PostgREST answers 2xx with nothing. That is said, not reloaded as done.
test('emptying a direction that matched no row says so', async () => {
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route_variant' && q.op === 'update') return { data: [] };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await assert.rejects(deleteDirection({ id: 'v1', route_id: 'r1' }), /Nothing was changed/);
  assert.equal(log.length, 1);
});

test('emptying a direction clears its signboards with its line', async () => {
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route_variant' && q.op === 'update') return { data: [{ id: 'v1' }] };
    if (q.table === 'route_stop' && q.op === 'delete') return {};
    if (q.table === 'route_variant' && q.op === 'select') return { count: 1 };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await deleteDirection({ id: 'v1', route_id: 'r1' });
  assert.deepEqual(log[0].payload.signboards, []);
});

test("a save whose own route another save's directions filled first leaves it", async () => {
  // A inserted the route; B claimed it and its directions landed first, so
  // A's are refused as already there. Deleting would cascade B's line away.
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route' && q.op === 'insert') return { data: { id: 'r3' } };
    if (q.table === 'route_variant' && q.op === 'insert') return { error: refused };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  await assert.rejects(saveDirection(input));
  assert.equal(log.filter((q) => q.op === 'delete').length, 0);
});

test('a route with these ends but no row this way round is filled, not refused as drawn', async () => {
  const { client, log } = fakeSupabase((q) => {
    if (q.table === 'route' && q.op === 'insert') return { error: refused };
    if (q.table === 'route' && q.op === 'select')
      return { data: { id: 'r4', route_variant: [{ id: 'v9', reversed: true, shape: {} }] } };
    if (q.table === 'route_variant' && q.op === 'update') return { data: null };
    if (q.table === 'route_variant' && q.op === 'insert')
      return { data: { id: 'v10', route_id: 'r4', reversed: false } };
    throw new Error(`unexpected ${q.op} on ${q.table}`);
  });
  setSupabase(client);
  const saved = await saveDirection(input);
  assert.equal(saved.id, 'v10');
  assert.deepEqual(
    log.map((q) => `${q.table} ${q.op}`),
    ['route insert', 'route select', 'route_variant update', 'route_variant insert'],
  );
});
