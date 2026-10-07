// The page's own "Loading map…" (the owner's Q4, 2026-10-04): the root
// index.html shows the map's gray loading state from its first paint, until
// the app's first render replaces it with MapView's own. Written out in the
// page, so this holds it to what MapView draws and to the tokens it draws
// with; phone-test holds the two to each other as the browser draws them.
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/loading-screen-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../../index.html')
const studio = read('../../studio/index.html')
const mapView = read('../../src/features/routes/map/map-view.tsx')
const tokens = read('../../src/design-system/foundation/tokens.css')
const tailwind = read('../../node_modules/tailwindcss/theme.css')

/** A Tailwind theme value as its theme.css writes it, spaces folded. */
const theme = (name) => {
  const m = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(tailwind)
  assert.ok(m, `${name} in tailwindcss/theme.css`)
  return m[1].replace(/\s+/g, ' ').trim()
}
/** The style attribute's declarations, in order: [property, value]. */
const declarations = (style) =>
  style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const at = d.indexOf(':')
      return [d.slice(0, at).trim(), d.slice(at + 1).trim()]
    })
/** The last value given to `property`: the one a browser that reads it all keeps. */
const last = (decls, property) => decls.filter(([p]) => p === property).at(-1)?.[1]

const root = /<div id="root"><div style="([^"]+)"><p style="([^"]+)">Loading map…<\/p><\/div><\/div>/.exec(page)

test('the root page holds "Loading map…" inside #root, the only thing there, for React to replace', () => {
  assert.ok(root, 'index.html: <div id="root"><div style=…><p style=…>Loading map…</p></div></div>')
  // The module script comes after it, as before: the app replaces it on its first render.
  assert.ok(page.indexOf('Loading map…') < page.indexOf('<script type="module" src="/src/app/public-map/main.tsx">'))
  assert.equal(studio.includes('Loading map…'), false, "the studio's page opens on its sign-in and has none")
})

test('it carries neither data-directions nor data-dock-host, nor a word of the registration', () => {
  const body = page.slice(page.indexOf('<body>'))
  assert.equal(/data-directions|data-dock-host/.test(body.replace(/<!--[\s\S]*?-->/g, '')), false)
  assert.equal(/registerSW|vite-plugin-pwa/.test(page), false, 'check-build.mjs fails a page that carries one')
})

test("its gray is MapView's: bg-surface-secondary, Tailwind's neutral-100, over the whole screen", () => {
  assert.match(mapView, /<div className="absolute inset-0 bg-surface-secondary">/)
  assert.match(tokens, /--surface-secondary: var\(--color-neutral-100\);/)
  const screen = declarations(root[1])
  assert.equal(last(screen, 'background-color'), theme('--color-neutral-100'))
  assert.equal(screen.find(([p]) => p === 'background-color')[1], '#f5f5f5', 'the same gray in hex first, for a browser without oklch()')
  for (const side of ['top', 'right', 'bottom', 'left']) assert.equal(last(screen, side), '0')
  assert.equal(last(screen, 'position'), 'absolute')
  assert.equal(last(screen, 'display'), 'grid')
  assert.equal(last(screen, 'place-items'), 'center')
})

test("its text is MapView's: text-sm, text-neutral-500, in Tailwind's sans", () => {
  assert.match(mapView, /<div className="pointer-events-none absolute inset-0 grid place-items-center">\s*<p className="text-sm text-neutral-500">Loading map…<\/p>/)
  const text = declarations(root[2])
  assert.equal(last(text, 'color'), theme('--color-neutral-500'))
  assert.equal(text.find(([p]) => p === 'color')[1], '#737373', 'the same gray in hex first')
  assert.equal(last(text, 'font-size'), theme('--text-sm'))
  assert.equal(last(text, 'line-height'), theme('--text-sm--line-height'))
  assert.equal(last(text, 'font-family').replace(/'/g, '"'), theme('--font-sans').replace(/'/g, '"'))
  assert.equal(last(text, 'margin'), '0')
})
