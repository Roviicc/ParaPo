// The map's colours (src/design-system/foundation/map-colours.ts) are the
// Map/… semantics of tokens.css written once more, in hex, for MapLibre, which
// reads neither var() nor oklch. Two copies drift, so this holds them
// together: every Map/… token has its hex, every hex its token, and each hex
// is the primitive its token aliases — Tailwind's own oklch, converted, or
// one of ours from tokens.css. It holds CARD_COLOURS the same way: the
// Card/<livery>/surface hexes a picked card's routes and an open trip's line
// are lit in (2026-09-29).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-colours-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { CARD_COLOURS, MAP_COLOURS, MAP_PAINT } from '../../src/design-system/foundation/map-colours.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tokens = read('../../src/design-system/foundation/tokens.css')
const tailwind = read('../../node_modules/tailwindcss/theme.css')

/** Figma's name as tokens.css spells it: Map/RouteLine/Arrow/Rest → map-route-line-arrow-rest. */
const cssName = (figma) =>
  figma
    .split('/')
    .map((part) => part.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-')

/** The Map/… tokens tokens.css defines: css name → the primitive it aliases (blue-200). */
const aliases = new Map(
  [...tokens.matchAll(/^\s*--(map-[a-z-]+):\s*var\(--color-([a-z0-9-]+)\);/gm)].map((m) => [m[1], m[2]]),
)

/** OKLCH as CSS writes it (`oklch(88.2% 0.059 254.128)`) to sRGB hex, the way the browser does. */
function oklchHex(text) {
  const [l, c, h] = text.split(/\s+/)
  const L = parseFloat(l) / (l.endsWith('%') ? 100 : 1)
  const C = parseFloat(c)
  const H = h === 'none' ? 0 : (parseFloat(h) * Math.PI) / 180
  const [a, b] = [C * Math.cos(H), C * Math.sin(H)]
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
  return '#' + linear.map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, '0')).join('')
}

/** A primitive's hex: ours from tokens.css, else Tailwind's (hex or oklch). */
function primitiveHex(name) {
  const find = (css) => css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1].trim()
  const value = find(tokens) ?? find(tailwind)
  assert.ok(value, `no --color-${name} in tokens.css or Tailwind's theme`)
  if (value.startsWith('oklch(')) return oklchHex(value.slice(6, -1))
  const hex = value.toLowerCase()
  return hex.length === 4 ? '#' + [...hex.slice(1)].map((d) => d + d).join('') : hex
}

/** Channel by channel: oklch is written to three places, so a hex may land one off. */
const near = (x, y) => [1, 3, 5].every((i) => Math.abs(parseInt(x.slice(i, i + 2), 16) - parseInt(y.slice(i, i + 2), 16)) <= 1)

test("each card colour is the primitive its Card/<livery>/surface aliases", () => {
  assert.ok(Object.keys(CARD_COLOURS).length === 6, 'the six liveries')
  for (const [figma, hex] of Object.entries(CARD_COLOURS)) {
    const css = cssName(figma)
    const primitive = tokens.match(new RegExp(`^\\s*--${css}:\\s*var\\(--color-([a-z0-9-]+)\\);`, 'm'))?.[1]
    assert.ok(primitive, `no --${css} in tokens.css`)
    const want = primitiveHex(primitive)
    assert.ok(near(hex, want), `${figma} is ${hex}, but --${css} is ${primitive}, ${want}`)
  }
})

test('the converter lands on hexes the Figma file holds', () => {
  assert.ok(near(oklchHex('88.2% 0.059 254.128'), '#bedbff')) // blue/200
  assert.ok(near(oklchHex('48.8% 0.243 264.376'), '#1447e6')) // blue/700
  assert.ok(near(oklchHex('20.5% 0 none'), '#171717')) // neutral/900
})

test('every Map/… token has its hex, and every hex its token', () => {
  const mirrored = Object.keys(MAP_COLOURS).map(cssName).sort()
  assert.deepEqual(mirrored, [...aliases.keys()].sort())
  assert.ok(aliases.size > 0, 'no Map/… tokens read from tokens.css')
})

test('each is a utility too: bg-map-…', () => {
  for (const name of aliases.keys()) {
    assert.match(tokens, new RegExp(`--color-${name}:\\s*var\\(--${name}\\);`), name)
  }
})

test('each hex is the primitive its token aliases', () => {
  for (const [figma, hex] of Object.entries(MAP_COLOURS)) {
    const primitive = aliases.get(cssName(figma))
    const want = primitiveHex(primitive)
    assert.ok(near(hex, want), `${figma}: ${hex} in mapColours.ts, but ${primitive} is ${want}`)
  }
})

// Every colour the map paints comes from mapColours.ts (stage 9 of the
// clean-up): the Map/… tokens, the cards', and MAP_PAINT for those Figma does
// not name yet. A colour written in the map's code itself — a quoted hex or
// rgb() in the painters of both pages and the editor's drawing — is one the
// next restyle cannot find.
test('no colour is written in the map code outside mapColours.ts', () => {
  const dirs = [
    '../../src/features/routes/map/',
    '../../src/features/routes/geo/',
    '../../src/shared/utils/',
    '../../src/features/studio/drawing/',
    '../../src/features/locator/',
    '../../src/features/published-map/',
    '../../src/app/public-map/',
    '../../src/shared/hooks/',
  ]
  const found = []
  for (const dir of dirs) {
    for (const f of readdirSync(new URL(dir, import.meta.url)).filter((n) => /\.ts$/.test(n))) {
      const text = read(dir + f)
      for (const m of text.matchAll(/['"`](#[0-9a-f]{3,8}|rgba?\([^'"`]*\))['"`]/gi)) found.push(`${dir.replace('../../', '')}${f}: ${m[1]}`)
    }
  }
  assert.deepEqual(found, [])
})

test('every MAP_PAINT colour is one MapLibre reads: a hex, or rgb()', () => {
  for (const [name, colour] of Object.entries(MAP_PAINT)) {
    assert.match(colour, /^(#[0-9a-f]{6}|rgb\(\d{1,3}, \d{1,3}, \d{1,3}\))$/i, name)
  }
})
