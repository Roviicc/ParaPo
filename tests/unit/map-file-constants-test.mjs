// The build reads MAP_FILE_URL and EARLY_MAP_FILE off map-file.ts's text
// (scripts/node/map-file-constants.ts): the Vite config writes the early
// request into index.html with them, and check-build.mjs proves the built
// page carries it. Both forms of the line read the same, so formatting the
// source with semicolons cannot break the build silently (ticket 02 of the
// restructure follow-ups, 2026-10-07).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/map-file-constants-test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapFileConstants } from '../../scripts/node/map-file-constants.ts'

const bare = `export const MAP_FILE_URL = '/data/index.v4.json'
const LINES_URL = '/data/lines/'
export const EARLY_MAP_FILE = '__parapoMapFile'
`
const withSemicolons = bare.replace(/'$/gm, "';")

test('the two constants read the same with or without a semicolon after the quote', () => {
  const expected = { MAP_FILE_URL: '/data/index.v4.json', EARLY_MAP_FILE: '__parapoMapFile' }
  assert.deepEqual(mapFileConstants(bare), expected)
  assert.deepEqual(mapFileConstants(withSemicolons), expected)
})

test('a constant missing, or not a single-quoted string, is named', () => {
  const message = /must export MAP_FILE_URL and EARLY_MAP_FILE as single-quoted string constants/
  assert.throws(() => mapFileConstants(bare.replace(/^export const EARLY_MAP_FILE.*\n/m, '')), message)
  assert.throws(() => mapFileConstants(bare.replace("'/data/index.v4.json'", '"/data/index.v4.json"')), message)
  assert.throws(() => mapFileConstants(bare.replace("'/data/index.v4.json'", "'/data/' + 'index.v4.json'")), message)
})

test('the committed map-file.ts declares both', () => {
  const source = readFileSync(new URL('../../src/features/published-map/map-file.ts', import.meta.url), 'utf8')
  const { MAP_FILE_URL, EARLY_MAP_FILE } = mapFileConstants(source)
  assert.equal(MAP_FILE_URL, '/data/index.v4.json')
  assert.match(EARLY_MAP_FILE, /^__parapo/)
})
