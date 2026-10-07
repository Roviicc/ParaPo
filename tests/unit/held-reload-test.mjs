// The reload a dev server holds for the next page to connect, taken before a
// suite's own page connects (tests/e2e/lib/harness.mjs, takeHeldReload; the
// owner's answer to question W of the cheap-phone report, 2026-10-06). Vite
// keeps a full reload sent while no page is connected and hands it to the
// next one, which loads a second time: phone-test's first page did, after an
// edit to tests/e2e/README.md made between two runs. Run against a Vite dev
// server of its own, on a page of its own, in a folder of its own.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/held-reload-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { hmrSocketUrl, takeHeldReload } from '../e2e/lib/harness.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A check that cannot finish fails rather than holding up the run.
const limit = { timeout: 20000 };

// The lines of Vite's /@vite/client the socket is read from, as Vite 8 serves them.
const client = (port = 'null', token = 'Tk3n_1') => `const hmrPort = ${port};
const socketHost = \`\${null || importMetaUrl.hostname}:\${hmrPort || importMetaUrl.port}\${"/"}\`;
const wsToken = "${token}";
const transport = normalizeModuleRunnerTransport((() => {
	let wsTransport = createWebSocketModuleRunnerTransport({
		createConnection: () => new WebSocket(\`\${socketProtocol}://\${socketHost}?token=\${wsToken}\`, "vite-hmr"),`;

test("the socket a dev server's client connects to, with its token; none from a page that is not that client", () => {
  assert.equal(
    hmrSocketUrl('http://localhost:5173', client()),
    'ws://localhost:5173/?token=Tk3n_1',
  );
  assert.equal(hmrSocketUrl('https://example.test', client()), 'wss://example.test/?token=Tk3n_1');
  assert.equal(
    hmrSocketUrl('http://localhost:5173', client('24678')),
    'ws://localhost:24678/?token=Tk3n_1',
  );
  assert.equal(hmrSocketUrl('http://localhost:5173', client('null', '')), 'ws://localhost:5173/');
  // A preview build answers /@vite/client with the app's page.
  assert.equal(
    hmrSocketUrl('http://localhost:4173', '<!doctype html><html><head><title>Para Po</title>'),
    null,
  );
  assert.equal(hmrSocketUrl('http://localhost:4173', null), null);
});

/** A Vite dev server on a free port, serving a folder with one page. */
async function devServer() {
  const root = mkdtempSync(join(tmpdir(), 'parapo-held-reload-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><body><p>page</p></body></html>');
  const server = await createServer({
    configFile: false,
    envFile: false,
    root,
    cacheDir: join(root, '.vite'),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const { port } = server.httpServer.address();
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    server,
    close: async () => {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A page's client connected to `base`'s socket, as the page's own: every message it gets. */
async function pageClient(base) {
  const code = await (await fetch(`${base}/@vite/client`)).text();
  const ws = new WebSocket(hmrSocketUrl(base, code), 'vite-hmr');
  const got = [];
  ws.onmessage = (e) => got.push(JSON.parse(String(e.data)));
  const until = Date.now() + 5000;
  while (!got.some((m) => m.type === 'connected') && Date.now() < until) await wait(10);
  return { got, close: () => ws.close() };
}

/** Until `dev`'s server counts no page connected, 5 s at most: a socket is let go of once it has closed. */
const noPage = async (dev) => {
  const until = Date.now() + 5000;
  while (dev.server.ws.clients.size > 0 && Date.now() < until) await wait(10);
};

test(
  'a full reload sent while no page is connected is held for the next to connect, and taken: none left for the page',
  limit,
  async () => {
    const dev = await devServer();
    try {
      assert.deepEqual(
        await takeHeldReload(dev.base),
        { socket: true, held: null },
        'nothing held at the start',
      );
      await noPage(dev);
      // As Tailwind's plugin sends it for a file it reads that is not code.
      dev.server.environments.client.hot.send({ type: 'full-reload' });
      assert.deepEqual(
        await takeHeldReload(dev.base),
        { socket: true, held: { type: 'full-reload' } },
        'the held reload taken',
      );
      const page = await pageClient(dev.base);
      await wait(300);
      assert.deepEqual(
        page.got,
        [{ type: 'connected' }],
        'the page that connects next gets no reload',
      );
      page.close();
    } finally {
      await dev.close();
    }
  },
);

test(
  'a full reload sent while a page is connected reaches that page, and is not held for the next',
  limit,
  async () => {
    const dev = await devServer();
    try {
      const page = await pageClient(dev.base);
      dev.server.environments.client.hot.send({ type: 'full-reload' });
      await wait(300);
      assert.deepEqual(page.got, [{ type: 'connected' }, { type: 'full-reload' }]);
      page.close();
      await noPage(dev);
      assert.deepEqual(await takeHeldReload(dev.base), { socket: true, held: null });
    } finally {
      await dev.close();
    }
  },
);

test('nothing to take where no dev server answers, or another server does', limit, async () => {
  // A preview build: /@vite/client is the app's page.
  const preview = createHttpServer((_, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><title>Para Po</title>'),
  );
  await new Promise((r) => preview.listen(0, '127.0.0.1', r));
  const port = preview.address().port;
  try {
    assert.deepEqual(await takeHeldReload(`http://127.0.0.1:${port}`), { socket: false });
  } finally {
    await new Promise((r) => preview.close(r));
  }
  // Nothing listening there any more.
  assert.deepEqual(await takeHeldReload(`http://127.0.0.1:${port}`), { socket: false });
});
