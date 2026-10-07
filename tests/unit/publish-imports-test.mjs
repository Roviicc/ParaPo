// The publish script imports the app's own rules from src/ (publish-map.mjs's
// header), and nothing runs it before the nightly workflow does: it reads the
// database as it loads. A renamed export it imports would fail there first,
// at four in the morning. So each name it imports from src/ is checked here,
// against the module it names (ticket 07 of the restructure follow-ups,
// 2026-10-07, which renamed stops and variants).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/publish-imports-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCRIPT = new URL('../../scripts/publish/publish-map.mjs', import.meta.url);

/** `import { a, b } from '../../src/…'` lines, as [names, specifier]. */
function sourceImports(text) {
  return [...text.matchAll(/^import \{([^}]+)\} from '(\.\.\/\.\.\/src\/[^']+)';?$/gm)].map((m) => [
    m[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean),
    m[2],
  ]);
}

test('every name the publish script imports from src/ is exported by the module it names', async () => {
  const imports = sourceImports(readFileSync(SCRIPT, 'utf8'));
  assert.ok(imports.length >= 5, `the script imports from src/ (${imports.length} lines found)`);
  for (const [names, specifier] of imports) {
    const module = await import(new URL(specifier, SCRIPT).href);
    for (const name of names) {
      assert.ok(name in module, `${specifier} exports ${name}`);
    }
  }
});

test('the reader of the import lines reads the real forms', () => {
  const text = `import { a, b } from '../../src/x/y.ts';\nimport { c } from '../../src/z.ts'\nimport { d } from './local.mjs';\n`;
  assert.deepEqual(sourceImports(text), [
    [['a', 'b'], '../../src/x/y.ts'],
    [['c'], '../../src/z.ts'],
  ]);
});
