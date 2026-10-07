// Each page asks for its stylesheets before its scripts (vite.config.ts,
// stylesheetsBeforeScripts, 2026-10-05): over HTTP/1.1 the scripts ahead of
// them took all six of a host's connections and the first paint waited a
// round trip. Run on the heads Vite writes; check-build.mjs checks the built
// pages.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/stylesheets-first-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import config, { stylesheetsBeforeScripts } from '../../vite.config.ts';

// The root page's head as Vite writes it, with index.html's early map-file script.
const vite = `<html>
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin />
    <script>(function(){window.__early=1})()</script>
    <script type="module" crossorigin src="/assets/commuter-a.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-b.js">
    <link rel="modulepreload" crossorigin href="/assets/react-c.js">
    <link rel="modulepreload" crossorigin href="/assets/shared-d.js">
    <link rel="stylesheet" crossorigin href="/assets/shared-e.css">
    <link rel="stylesheet" crossorigin href="/assets/commuter-f.css">
  <link rel="manifest" href="/manifest.webmanifest"></head>
  <body><div id="root"></div></body>
</html>`;

const moved = `<html>
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin />
    <script>(function(){window.__early=1})()</script>
    <link rel="stylesheet" crossorigin href="/assets/shared-e.css">
    <link rel="stylesheet" crossorigin href="/assets/commuter-f.css">
    <script type="module" crossorigin src="/assets/commuter-a.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-b.js">
    <link rel="modulepreload" crossorigin href="/assets/react-c.js">
    <link rel="modulepreload" crossorigin href="/assets/shared-d.js">
  <link rel="manifest" href="/manifest.webmanifest"></head>
  <body><div id="root"></div></body>
</html>`;

test('the stylesheets go just before the module script, in their order, after the early script; nothing else moves', () => {
  assert.equal(stylesheetsBeforeScripts(vite), moved);
  assert.equal(stylesheetsBeforeScripts(moved), moved, 'once is enough');
  // The studio's page: no early script.
  const studio = vite
    .replace(/\n    <script>.*<\/script>/, '')
    .replace(/\n    <link rel="stylesheet"[^>]*commuter-f\.css">/, '');
  const studioMoved = moved
    .replace(/\n    <script>.*<\/script>/, '')
    .replace(/\n    <link rel="stylesheet"[^>]*commuter-f\.css">/, '');
  assert.notEqual(studio, vite);
  assert.equal(stylesheetsBeforeScripts(studio), studioMoved);
});

test('a page with no stylesheet after its module script, or no module script, or a stylesheet in its body, is left alone', () => {
  const noSheets = vite.replace(/\n    <link rel="stylesheet"[^>]*>/g, '');
  assert.equal(stylesheetsBeforeScripts(noSheets), noSheets);
  const noScript = vite.replace(/\n    <script type="module"[^>]*><\/script>/, '');
  assert.equal(stylesheetsBeforeScripts(noScript), noScript);
  const inBody = noSheets.replace('<body>', '<body><link rel="stylesheet" href="/late.css">');
  assert.equal(stylesheetsBeforeScripts(inBody), inBody);
});

test('the plugin runs in a build only, after Vite has written the tags, on both pages', () => {
  const plugin = config.plugins.flat().find((p) => p?.name === 'parapo:stylesheets-first');
  assert.ok(plugin);
  assert.equal(plugin.apply, 'build');
  assert.equal(plugin.transformIndexHtml.order, 'post');
  assert.equal(plugin.transformIndexHtml.handler, stylesheetsBeforeScripts);
});
