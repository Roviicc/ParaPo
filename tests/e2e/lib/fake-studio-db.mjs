// The studio's database in memory, for the suites that need an editor reading
// and writing: PostgREST's filters (eq, in, is, not.is, gte, lte), the embeds
// the studio asks for (`route:route(*)`, `route_variant(…)`), inserts, patches,
// deletes, an upsert that ignores duplicates, a HEAD count, and the two phone
// block functions. A table the suite does not seed is empty. Every request to
// /rest/v1/ lands here, so no suite reaches the live project.
//
//   const db = await fakeStudioDb(page, { contribution: [...], hinto: [...], stop: [...] });
//   db.log           every request: { method, table, query, body }
//   db.tables        the rows, by table name
//   db.next          { when(method, table, url) → bool }, refused once with a 500

const TABLES = [
  'contribution',
  'point_batch',
  'hinto',
  'contributor',
  'contribution_use',
  'route',
  'route_variant',
  'route_stop',
  'stop',
  'draft',
];
const SKIPPED = ['select', 'order', 'offset', 'limit', 'columns', 'on_conflict'];
const now = '2026-10-22T00:00:00+00:00';

/** Split a select on its top-level commas: `id,route_variant(id,reversed)`. */
const splitTop = (s) => {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

export async function fakeStudioDb(page, seed = {}) {
  const tables = Object.fromEntries(TABLES.map((t) => [t, [...(seed[t] ?? [])]]));
  const db = { tables, log: [], fault: null };
  let seq = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const shape = (table, row, select) => {
    if (!select || select === '*') return { ...row };
    const out = {};
    for (const item of splitTop(select)) {
      const emb = item.match(/^(?:(\w+):)?(\w+)\((.*)\)$/);
      if (!emb) {
        if (item in row) out[item] = row[item];
        continue;
      }
      const [, alias, rel, inner] = emb;
      if (table === 'route_variant' && rel === 'route') {
        const r = tables.route.find((x) => x.id === row.route_id);
        out[alias ?? rel] = r ? shape('route', r, inner) : null;
      } else if (table === 'route' && rel === 'route_variant') {
        out[alias ?? rel] = tables.route_variant
          .filter((v) => v.route_id === row.id)
          .map((v) => shape('route_variant', v, inner));
      }
    }
    return out;
  };

  const compare = (val, op, arg) => {
    const [a, b] = typeof val === 'number' ? [val, Number(arg)] : [String(val), arg];
    return op === 'gte' ? a >= b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a < b;
  };
  const matches = (row, params) => {
    for (const [k, v] of params) {
      if (SKIPPED.includes(k)) continue;
      const val = row[k];
      const op = v.slice(0, v.indexOf('.'));
      const arg = v.slice(v.indexOf('.') + 1);
      if (op === 'eq') {
        if (String(val) !== arg) return false;
      } else if (v === 'is.null') {
        if (val !== null && val !== undefined) return false;
      } else if (v === 'not.is.null') {
        if (val === null || val === undefined) return false;
      } else if (op === 'in') {
        if (
          !arg
            .slice(1, -1)
            .split(',')
            .map((s) => s.replace(/^"(.*)"$/, '$1'))
            .includes(String(val))
        )
          return false;
      } else if (['gte', 'lte', 'gt', 'lt'].includes(op)) {
        if (!compare(val, op, arg)) return false;
      } else throw new Error(`the stand-in does not know the filter ${k}=${v}`);
    }
    return true;
  };
  const sorted = (rows, order) => {
    if (!order) return rows;
    const keys = order.split(',').map((o) => o.split('.'));
    return [...rows].sort((x, y) => {
      for (const [col, dir] of keys) {
        const c = x[col] < y[col] ? -1 : x[col] > y[col] ? 1 : 0;
        if (c) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  };
  const fill = (table, r) => {
    const base = { id: newId(), owner_id: 'owner', created_at: now };
    if (table === 'route')
      return {
        ...base,
        signboard: null,
        route_code: null,
        short_name: null,
        long_name: null,
        mode: 'jeepney',
        fare_note: null,
        fare_as_of: null,
        via: null,
        is_loop: false,
        updated_at: now,
        ...r,
      };
    if (table === 'route_variant')
      return {
        ...base,
        direction_name: null,
        origin_terminal: null,
        destination_terminal: null,
        confidence: 'drawn',
        overview: null,
        borrowed_from: null,
        borrowed_part: null,
        borrowed_m: null,
        signboards: [],
        updated_at: now,
        ...r,
      };
    if (table === 'stop') return { ...base, informal: null, aliases: [], note: null, ...r };
    return { ...base, ...r };
  };

  const rpc = (name, body) => {
    const phone = tables.contributor.find((c) => c.id === body.target);
    if (!phone) return { status: 404, body: { code: 'P0002', message: 'no_contributor' } };
    if (name === 'block_contributor') {
      phone.blocked_at = now;
      phone.block_note = body.note ?? null;
    } else {
      phone.blocked_at = null;
      phone.block_note = null;
    }
    return { status: 200, body: null };
  };

  const serve = (req) => {
    const u = new URL(req.url());
    const path = u.pathname.split('/rest/v1/')[1];
    const method = req.method();
    const text = req.postData();
    const body = text ? JSON.parse(text) : null;
    const table = path.replace(/^rpc\//, '');
    db.log.push({ method, table, query: decodeURIComponent(u.search), body });
    if (db.fault?.(method, table, u)) {
      db.fault = null;
      return { status: 500, body: { code: 'XX000', message: 'refused on purpose' } };
    }
    if (path.startsWith('rpc/')) return rpc(table, body);
    const params = [...u.searchParams];
    const select = u.searchParams.get('select');
    const prefer = req.headers().prefer ?? '';
    const one = /vnd\.pgrst\.object/.test(req.headers().accept ?? '');
    const answer = (out) => {
      const rows = out.map((r) => shape(table, r, select));
      if (one)
        return rows.length === 1
          ? { status: 200, body: rows[0] }
          : {
              status: 406,
              body: {
                code: 'PGRST116',
                message: 'JSON object requested, multiple (or no) rows returned',
              },
            };
      return { status: method === 'POST' ? 201 : 200, body: rows };
    };
    const all = tables[table].filter((r) => matches(r, params));
    if (method === 'GET' || method === 'HEAD') {
      const rows = sorted(all, u.searchParams.get('order'));
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 1000);
      const page = rows.slice(offset, offset + Math.min(limit, 1000));
      const range = page.length
        ? `${offset}-${offset + page.length - 1}/${rows.length}`
        : `*/${rows.length}`;
      return method === 'HEAD' ? { status: 200, body: null, range } : { ...answer(page), range };
    }
    if (method === 'DELETE') {
      tables[table] = tables[table].filter((r) => !all.includes(r));
      return { status: 200, body: all.map((r) => shape(table, r, select)) };
    }
    if (method === 'PATCH') {
      for (const r of all) Object.assign(r, body);
      return answer(all);
    }
    const made = [];
    for (const r of Array.isArray(body) ? body : [body]) {
      const row = fill(table, r);
      if (table === 'contribution_use' && /ignore-duplicates/.test(prefer)) {
        const same = (x) =>
          x.contribution_id === row.contribution_id &&
          x.kind === row.kind &&
          x.subject_id === row.subject_id;
        if (tables[table].some(same)) continue;
      }
      tables[table].push(row);
      made.push(row);
    }
    return answer(made);
  };

  await page.route(/\/rest\/v1\//, async (route) => {
    const out = serve(route.request());
    const headers = {
      'access-control-expose-headers': 'content-range',
      'access-control-allow-origin': '*',
    };
    if (out.range) headers['content-range'] = out.range;
    await route.fulfill({
      status: out.status,
      contentType: 'application/json',
      headers,
      body: out.body === null ? '' : JSON.stringify(out.body),
    });
  });
  return db;
}
