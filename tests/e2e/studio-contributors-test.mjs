// The Contributors map's actions, signed in as an editor, against a stand-in
// for the database: Use this line, Draw a hintuan here, Hide and Show again,
// Block and Unblock, and the opened upload's marks. The reader and the writer are the stand-in's
// (lib/fake-studio-db.mjs); no router, no tiles, no account, nothing reaches
// the live project.
//
//   VITE_CONTRIBUTIONS=1 npm run dev     (in another terminal)
//   node tests/e2e/studio-contributors-test.mjs     against http://localhost:5173
//
// What it checks: an upload's phone says how many uploads it has sent; Block
// and Unblock call the two functions with the note and show the state; Hide
// keeps its note; Use this line begins a direction in the Playground from the
// upload's line, shows the two names as hints, and a save records
// `contribution_use` (direction) against the direction it wrote; Draw a
// hintuan here begins a box, and a save records one `contribution_use`
// (hintuan) for each upload with a hinto inside the box, none for one outside;
// a drawing in progress is never replaced.
import { chromium } from 'playwright';

import { BASE, bareStyle, harness } from './lib/harness.mjs';
import { fakeStudioDb } from './lib/fake-studio-db.mjs';
import { signInAsEditor } from './lib/studio-session.mjs';

const { check, tally } = harness();

// ------------------------------------------------------------- the tables
const PHONE_A = 'aaaaaa01-0000-4000-8000-000000000001';
const PHONE_B = 'bbbbbb02-0000-4000-8000-000000000002';
const [C1, C2, C3] = [1, 2, 3].map((n) => `c0000000-0000-4000-8000-00000000000${n}`);
/** Where the ride starts, 14.7 N 121.05 E, and ends 1.1 km north. */
const START = [121.05, 14.7];
const END = [121.05, 14.71];
const LINE = [START, [121.0505, 14.7035], [121.049, 14.707], END];
const HINTO = [121.0502, 14.7035];
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const RIDE_START = Date.now() - 3 * HOUR;
const upload = (id, phone, over) => ({
  id,
  contributor_id: phone,
  started_at: iso(Date.now() - 3 * HOUR),
  ended_at: iso(Date.now() - 2 * HOUR),
  received_at: iso(Date.now() - HOUR),
  vehicle: 'jeep',
  start_name: null,
  end_name: null,
  description: null,
  distance_m: 1100,
  moving_s: 900,
  standing_s: 240,
  lost_s: 0,
  point_count: 40,
  line: { type: 'LineString', coordinates: LINE },
  west: 121.049,
  south: 14.7,
  east: 121.0505,
  north: 14.71,
  hidden_at: null,
  hidden_note: null,
  ...over,
});
/** C1's trail, one fix a minute along its line, as the phone packs it (degrees × 1e6). */
const trailBatch = (contribution) => {
  const at = (n) => LINE[n];
  return {
    contribution_id: contribution,
    seq: 0,
    first_at: iso(RIDE_START),
    first_lat: Math.round(at(0)[1] * 1e6),
    first_lng: Math.round(at(0)[0] * 1e6),
    dt_ms: [0, 60_000, 60_000, 60_000],
    dlat: [0, 3500, 3500, 3000],
    dlng: [0, 500, -1500, 100],
  };
};
const hinto = (contribution, lng, lat, seconds) => ({
  contribution_id: contribution,
  seq: 0,
  started_at: iso(Date.now() - 2.5 * HOUR),
  seconds,
  lat,
  lng,
});
const terminal = (id, name, [x, y]) => ({
  id,
  name,
  informal: name,
  aliases: [],
  note: null,
  created_at: '2026-10-01T00:00:00+00:00',
  kind: 'terminal',
  point: { type: 'Point', coordinates: [x, y] },
  area: {
    type: 'Polygon',
    coordinates: [
      [
        [x - 0.0004, y - 0.0004],
        [x + 0.0004, y - 0.0004],
        [x + 0.0004, y + 0.0004],
        [x - 0.0004, y + 0.0004],
        [x - 0.0004, y - 0.0004],
      ],
    ],
  },
  owner_id: 'owner',
  line: null,
});

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text()))
    errors.push(msg.text().slice(0, 160));
});
await bareStyle(page);
await signInAsEditor(page);
const db = await fakeStudioDb(page, {
  contributor: [
    {
      id: PHONE_A,
      name: 'Maria Santos',
      phone: '+639171234567',
      blocked_at: null,
      block_note: null,
    },
    { id: PHONE_B, name: null, blocked_at: null, block_note: null },
  ],
  contribution: [
    upload(C1, PHONE_A, {
      start_name: 'SM Fairview',
      end_name: 'Cubao',
      started_at: iso(RIDE_START),
      events: [
        { kind: 'mark', at: iso(RIDE_START + 30_000) },
        { kind: 'switch', at: iso(RIDE_START + 90_000), to: 'return' },
        { kind: 'mark', at: iso(RIDE_START + 150_000) },
      ],
    }),
    upload(C2, PHONE_B, {
      start_name: 'Fairview',
      end_name: 'Cubao',
      received_at: iso(Date.now() - 2 * HOUR),
    }),
    upload(C3, PHONE_A, { description: 'Far away', received_at: iso(Date.now() - 3 * HOUR) }),
  ],
  // C2's hinto is 7 m from C1's, inside a box round it; C3's is 600 m north, outside.
  point_batch: [trailBatch(C1)],
  hinto: [
    hinto(C1, ...HINTO, 240),
    hinto(C2, HINTO[0] + 0.00006, HINTO[1], 120),
    hinto(C3, HINTO[0], HINTO[1] + 0.0055, 300),
  ],
  stop: [
    terminal('55555555-0000-4000-8000-000000000001', 'Fairview Terminal', START),
    terminal('55555555-0000-4000-8000-000000000002', 'Cubao Terminal', END),
  ],
});
await page.route(/router\.project-osrm\.org/, (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'NoRoute', routes: [] }),
  }),
);

await page.goto(`${BASE}/studio/?map=contributors`, { waitUntil: 'load' });
const list = page.getByRole('list', { name: 'Uploads' });
await list.waitFor({ timeout: 30000 });
const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const waitFor = async (fn, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await fn()) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const open = async (name) => {
  await page
    .getByRole('button', { name: new RegExp(name) })
    .first()
    .click();
  await page.getByText(/On the map: the whole trail/).waitFor({ timeout: 15000 });
};
const shot = (name) =>
  process.env.PARAPO_SHOTS
    ? page.screenshot({ path: `${process.env.PARAPO_SHOTS}/${name}.png` })
    : null;
const writes = () => db.log.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');

// -------------------------------------------------------- Block, Unblock
await open('SM Fairview to Cubao');
check(
  'an upload says how many uploads its phone has sent',
  await waitFor(async () => (await body()).includes('Phone aaaaaa has sent 2 uploads.')),
  (await body()).match(/Phone aaaaaa[^.]*\./)?.[0],
);
check(
  "  and shows the contributor's name, never their number",
  (await body()).includes('Maria Santos') &&
    !(await body()).includes('09171234567') &&
    !(await body()).includes('639171234567') &&
    db.log.every((r) => r.table !== 'contributor' || !/phone|email/.test(r.query)),
);
check(
  '  and lists its hintos as text, each with Draw a hintuan here',
  (await body()).includes('Hinto 1: 4 min') &&
    (await page.getByRole('button', { name: 'Draw a hintuan here' }).count()) === 1,
);
check(
  '  and lists its two marks as text, the way switch left out',
  (await body()).includes('2 marks. Marked at'),
  (await body()).match(/.{20}Marked at.{40}/)?.[0],
);
const pinCount = () =>
  page.evaluate(async () => {
    const data = await window.__src('studio-contribution-opened');
    return data?.features.filter((f) => f.properties.kind === 'mark').length ?? 0;
  });
check('  and draws two pins on its ride', await waitFor(async () => (await pinCount()) === 2));
await shot('marks-pins');
await page.getByRole('button', { name: 'Block phone' }).click();
check(
  'Block asks why, the note focused and optional',
  await page.getByLabel('Why block it? (optional)').evaluate((el) => el === document.activeElement),
);
await page.getByLabel('Why block it? (optional)').fill('Sends rides that are walks');
await page.getByRole('button', { name: 'Block phone' }).scrollIntoViewIfNeeded();
await shot('block-1-asking');
await page.getByRole('button', { name: 'Block phone' }).click();
await page.getByRole('button', { name: 'Unblock phone' }).waitFor({ timeout: 8000 });
await shot('block-2-blocked');
const blockCall = writes().find((r) => r.table === 'block_contributor');
check(
  '  Block calls block_contributor with the whole phone and the note',
  blockCall?.body.target === PHONE_A && blockCall.body.note === 'Sends rides that are walks',
  JSON.stringify(blockCall?.body),
);
check(
  '  and the phone shows Blocked, with the note',
  /Blocked .*: Sends rides that are walks\. Its next uploads are refused\./.test(await body()),
);
await page.getByRole('button', { name: 'Unblock phone' }).click();
await page.getByRole('button', { name: 'Block phone', exact: true }).waitFor({ timeout: 8000 });
check(
  'Unblock calls unblock_contributor, and the phone is as before',
  writes().some((r) => r.table === 'unblock_contributor' && r.body.target === PHONE_A) &&
    !/Blocked /.test(await body()),
  (await body()).match(/.{30}Blocked .{30}/)?.[0],
);

// ------------------------------------------------------------ Hide, Show
await page.getByRole('button', { name: 'Hide', exact: true }).click();
await page.getByLabel('Why hide it? (optional)').fill('Test ride');
await shot('hide-1-asking');
await page.getByRole('button', { name: 'Hide upload' }).click();
await page.getByText('Upload hidden. Show hidden lists it again.').waitFor({ timeout: 8000 });
const hidePatch = writes().find((r) => r.method === 'PATCH' && r.table === 'contribution');
check(
  'Hide records its note, and the upload leaves the list',
  hidePatch?.body.hidden_note === 'Test ride' &&
    (await page.getByRole('button', { name: /SM Fairview to Cubao/ }).count()) === 0,
);
await page.getByLabel('Show hidden').check();
await page.getByRole('button', { name: /Hidden · SM Fairview to Cubao/ }).click();
await shot('hide-2-hidden');
await page.getByRole('button', { name: 'Show again' }).click();
await page.getByText('Upload shown again.').waitFor({ timeout: 8000 });
check('Show again clears it', db.tables.contribution.find((c) => c.id === C1).hidden_at === null);
await page.getByLabel('Show hidden').uncheck();
await page.getByRole('button', { name: 'Close' }).click();

// --------------------------------------------------------- Use this line
await open('SM Fairview to Cubao');
await shot('1-contributors-opened');
const before = writes().length;
await page.getByRole('button', { name: 'Use this line' }).click();
await page.getByRole('button', { name: /Done/ }).waitFor({ timeout: 10000 });
const draft = async () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('parapo.draft.v1') ?? 'null'));
await page
  .waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 15000 })
  .catch(() => {});
await page.waitForTimeout(600);
const drawn = await draft();
check(
  'Use this line opens the Playground with the line begun as a new direction',
  (await page.getByRole('radio', { name: /Playground/ }).isChecked()) &&
    drawn?.controlPoints?.length >= 2 &&
    !drawn.area &&
    !drawn.target?.directionId,
  `${drawn?.controlPoints?.length} control points`,
);
check(
  "  starting at the upload's start and ending at its end",
  Math.abs(drawn.controlPoints[0][0] - START[0]) < 1e-6 &&
    Math.abs(drawn.controlPoints.at(-1)[1] - END[1]) < 1e-6,
);
const hint = page.getByRole('region', { name: 'From an upload' });
check(
  "  the contributor's start and end names show as hints",
  /Start: SM Fairview/.test(await hint.innerText()) && /End: Cubao/.test(await hint.innerText()),
  (await hint.innerText()).replace(/\s+/g, ' '),
);
check('  nothing is written yet', writes().length === before);
await shot('2-use-this-line');
await page.getByRole('button', { name: /Done/ }).click();
await page.getByTestId('save-head').waitFor({ timeout: 10000 });
await page.getByTestId('save-head').selectOption({ label: 'Fairview Terminal' });
await page.getByTestId('save-tail').selectOption({ label: 'Cubao Terminal' });
await shot('3-save-panel');
await page.getByRole('button', { name: /^Save$/ }).click();
const wrote = await waitFor(
  () => db.tables.route_variant.length > 0 && db.tables.contribution_use.length > 0,
);
const drawnDirection = db.tables.route_variant.find((v) => v.shape);
check(
  'saving the direction records contribution_use (direction), against the direction it wrote',
  wrote &&
    db.tables.contribution_use.length === 1 &&
    db.tables.contribution_use[0].kind === 'direction' &&
    db.tables.contribution_use[0].contribution_id === C1 &&
    db.tables.contribution_use[0].subject_id === drawnDirection?.id,
  JSON.stringify(db.tables.contribution_use),
);
await waitFor(
  async () => (await page.getByRole('region', { name: 'From an upload' }).count()) === 0,
);
check(
  '  and the hint goes with the drawing',
  (await page.getByRole('region', { name: 'From an upload' }).count()) === 0,
);

// ------------------------------------------------- Draw a hintuan here
await page.getByText('Contributors', { exact: true }).click();
await list.waitFor();
await open('SM Fairview to Cubao');
await page.getByRole('button', { name: 'Draw a hintuan here' }).click();
await page.getByRole('button', { name: /Done/ }).waitFor({ timeout: 10000 });
const box = await draft();
check(
  'Draw a hintuan here opens the Playground with a box begun round the hinto',
  box?.area?.kind === 'hintuan' && !box.area.hotspotId && box.controlPoints.length === 4,
  JSON.stringify(box?.area),
);
check(
  '  and the hint says what it is for',
  /Shape the box/.test(await page.getByRole('region', { name: 'From an upload' }).innerText()),
);
await shot('4-draw-a-hintuan');
await page.getByRole('button', { name: /Done/ }).click();
await page.getByPlaceholder('SM Fairview Ilalim').fill('Mid-route Hintuan');
await page.getByRole('button', { name: 'Save hintuan' }).click();
await waitFor(() => db.tables.contribution_use.length > 1);
const newStop = db.tables.stop.find((s) => s.name === 'Mid-route Hintuan');
const hintuanUses = db.tables.contribution_use.filter((u) => u.kind === 'hintuan');
check(
  'saving the hintuan records contribution_use (hintuan) for each upload with a hinto inside the box',
  !!newStop &&
    hintuanUses.length === 2 &&
    hintuanUses.every((u) => u.subject_id === newStop.id) &&
    [C1, C2].every((id) => hintuanUses.some((u) => u.contribution_id === id)),
  JSON.stringify(hintuanUses.map((u) => u.contribution_id.slice(-1))),
);
check(
  '  and none for an upload whose hinto is outside it',
  !hintuanUses.some((u) => u.contribution_id === C3),
);

// ------------------------------------- a drawing in progress is kept
await page.getByText('Contributors', { exact: true }).click();
await list.waitFor();
await open('SM Fairview to Cubao');
await page.getByRole('button', { name: 'Use this line' }).click();
await page.getByRole('button', { name: /Done/ }).waitFor({ timeout: 10000 });
const first = await draft();
await page.getByText('Contributors', { exact: true }).click();
await open('Fairview to Cubao');
await page.getByRole('button', { name: 'Use this line' }).click();
await page.getByText('Finish or cancel the drawing in progress first').waitFor({ timeout: 8000 });
check(
  'Use this line never replaces a drawing in progress: it says so, and the drawing is as it was',
  JSON.stringify((await draft())?.controlPoints) === JSON.stringify(first.controlPoints),
);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
tally();
