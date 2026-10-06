// The icons' lossless PNG recompressor (scripts/assets/recompress-png.mjs).
//
//   node --experimental-strip-types --import ./scripts/node/ts-resolve.mjs tests/unit/recompress-png-test.mjs
//
// The owner's answers to questions Q and N of the cheap-phone report
// (2026-10-06): the tool is kept, and stores the two opaque icons as RGB.
// What it may write rests on these: it reads a PNG as the pixels a decoder
// shows, keeps a candidate only when every one of them is the original's —
// and the smaller of the two — and drops the alpha channel only when asked
// and only when every alpha is full. The PNGs here are made by this file,
// with zlib and the filters as the PNG specification gives them, not by
// the tool.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { decodePng, differingPixels, keepSmaller, recompressPng } from '../../scripts/assets/recompress-png.mjs'

const TOOL = new URL('../../scripts/assets/recompress-png.mjs', import.meta.url)
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])))
  return Buffer.concat([head, data, crc])
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
/** A row filtered as the specification's section 9 says. */
function filtered(type, row, up, bpp) {
  const out = Buffer.alloc(row.length)
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0
    const b = up ? up[i] : 0
    const c = up && i >= bpp ? up[i - bpp] : 0
    out[i] = row[i] - [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][type]
  }
  return out
}

/**
 * A PNG of `rows` (each row's bytes, unfiltered), with `filters` (one a row,
 * repeated), deflated at `level`, `before` and `after` the image data.
 */
function makePng({ width, height, colour, depth = 8, rows, filters = [0], level = 9, before = [], after = [] }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = colour
  const bpp = Math.max(1, ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour] * depth) / 8)
  const raw = Buffer.concat(rows.flatMap((row, y) => [Buffer.from([filters[y % filters.length]]), filtered(filters[y % filters.length], row, rows[y - 1], bpp)]))
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    ...before.map(([t, d]) => chunk(t, Buffer.from(d))),
    chunk('IDAT', deflateSync(raw, { level })),
    ...after.map(([t, d]) => chunk(t, Buffer.from(d))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** An 8 x 8 RGBA image, 8 bits: a gradient, with `alpha(x, y)`; colour under every pixel, transparent ones too. */
function rgbaRows(alpha = () => 255, size = 8) {
  return Array.from({ length: size }, (_, y) => Buffer.from(Array.from({ length: size }, (_, x) => [x * 30, y * 30, (x * y * 7) % 256, alpha(x, y)]).flat()))
}
const ROUND = (x, y) => (Math.hypot(x - 3.5, y - 3.5) > 3.6 ? 0 : 255) // transparent corners, colour under them

const colourType = (png) => png[25]
const pixelsOf = (png) => decodePng(png).rgba

test('a PNG is read as the pixels a decoder shows: every filter, RGBA, 16 bits, a palette with its tRNS', () => {
  const rows = rgbaRows(ROUND)
  const want = new Uint16Array(rows.flatMap((r) => [...r]).map((v) => v * 257))
  assert.deepEqual(pixelsOf(makePng({ width: 8, height: 8, colour: 6, rows })), want)
  assert.deepEqual(pixelsOf(makePng({ width: 8, height: 8, colour: 6, rows, filters: [0, 1, 2, 3, 4] })), want)
  assert.deepEqual(pixelsOf(makePng({ width: 8, height: 8, colour: 6, rows, filters: [4, 3, 2, 1] })), want)
  // 16 bits a channel, RGB: as they are, every pixel opaque.
  const rows16 = [Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xff, 0xff, 0, 0, 0, 1])]
  assert.deepEqual([...pixelsOf(makePng({ width: 2, height: 1, colour: 2, depth: 16, rows: rows16, filters: [1] }))], [0x1234, 0x5678, 0x9abc, 65535, 0xffff, 0, 1, 65535])
  // A palette at 2 bits: index 1's alpha from tRNS, index 2 past it opaque.
  const plte = [10, 20, 30, 40, 50, 60, 70, 80, 90]
  const pal = makePng({ width: 3, height: 1, colour: 3, depth: 2, rows: [Buffer.from([0b00011000])], before: [['PLTE', plte], ['tRNS', [255, 128]]] })
  assert.deepEqual([...pixelsOf(pal)], [10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255].map((v) => v * 257))
})

test('a candidate is kept only when every pixel is the original\'s: one channel off, the colour under a transparent pixel, another size, refused', () => {
  const rows = rgbaRows(ROUND)
  const original = makePng({ width: 8, height: 8, colour: 6, rows, level: 0 })
  const same = makePng({ width: 8, height: 8, colour: 6, rows, filters: [1, 2, 4] })
  assert.equal(keepSmaller(original, same), same)
  const off = rgbaRows(ROUND)
  off[3][3 * 4 + 1]++ // one green, one step
  assert.throws(() => keepSmaller(original, makePng({ width: 8, height: 8, colour: 6, rows: off })), /refused: 1 of 64 pixels differ/)
  const under = rgbaRows(ROUND)
  assert.equal(under[0][3], 0) // a transparent corner
  under[0][0] = 255 // its red, unseen
  assert.throws(() => keepSmaller(original, makePng({ width: 8, height: 8, colour: 6, rows: under })), /refused: 1 of 64/)
  const smaller = makePng({ width: 4, height: 4, colour: 6, rows: rgbaRows(ROUND, 4) })
  assert.throws(() => keepSmaller(original, smaller), /refused: 64 of 64/)
  assert.throws(() => keepSmaller(original, Buffer.from('not a png')), /not a PNG/)
  // What recompressPng writes is that: decoded from its own bytes, the original's pixels.
  const { png } = recompressPng(original)
  assert.ok(png.length < original.length)
  assert.equal(differingPixels(decodePng(original), decodePng(png)), 0)
  assert.deepEqual(pixelsOf(png), pixelsOf(original))
})

test('the chunks that change what is shown are kept in their place, text and time dropped, and a PNG it cannot read is refused', () => {
  const gama = [0, 0, 0xb1, 0x8f]
  const original = makePng({
    width: 8, height: 8, colour: 6, rows: rgbaRows(ROUND), level: 0,
    before: [['gAMA', gama], ['sRGB', [0]], ['tEXt', 'Software\0an editor']],
    after: [['tIME', [7, 234, 10, 6, 0, 0, 0]], ['eXIf', 'MM\0*\0\0\0\x08\0\0']],
  })
  const { png } = recompressPng(original)
  const types = []
  for (let o = 8; o < png.length; o += 12 + png.readUInt32BE(o)) types.push(png.toString('latin1', o + 4, o + 8))
  assert.deepEqual(types, ['IHDR', 'gAMA', 'sRGB', 'IDAT', 'eXIf', 'IEND'])
  assert.deepEqual([...decodePng(png).chunks.find((c) => c.type === 'gAMA').data], gama)
  // An interlaced file, a critical chunk it does not know, a bad CRC: left alone.
  const interlaced = Buffer.from(original)
  interlaced[28] = 1
  interlaced.writeUInt32BE(crc32(interlaced.subarray(12, 29)), 29)
  assert.throws(() => recompressPng(interlaced), /interlaced/)
  assert.throws(() => recompressPng(makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows(), before: [['ZZZZ', [1]]] })), /critical chunk/)
  const corrupt = Buffer.from(original)
  corrupt[42] ^= 1
  assert.throws(() => recompressPng(corrupt), /bad CRC/)
})

test('RGB only when asked, and only when every alpha is 255 (65535 at 16 bits)', () => {
  const opaque = makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows(), level: 0 })
  const asked = recompressPng(opaque, { rgb: true })
  assert.equal(colourType(asked.png), 2)
  assert.deepEqual(asked.colour, [6, 2])
  assert.deepEqual(pixelsOf(asked.png), pixelsOf(opaque))
  assert.ok(asked.png.length < recompressPng(opaque).png.length)
  // Not asked: RGBA it stays.
  assert.equal(colourType(recompressPng(opaque).png), 6)
  // One alpha of 254, or a transparent corner: RGBA, asked or not.
  const nearly = makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows((x, y) => (x === 7 && y === 7 ? 254 : 255)), level: 0 })
  assert.equal(colourType(recompressPng(nearly, { rgb: true }).png), 6)
  assert.deepEqual(pixelsOf(recompressPng(nearly, { rgb: true }).png), pixelsOf(nearly))
  assert.equal(colourType(recompressPng(makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows(ROUND), level: 0 }), { rgb: true }).png), 6)
  // 16 bits: alpha 0xffff everywhere, RGB; 0xfffe once, RGBA. sBIT loses its alpha byte.
  const rows16 = (last) => [Buffer.from([1, 2, 3, 4, 5, 6, 0xff, 0xff, 7, 8, 9, 10, 11, 12, 0xff, last])]
  const opaque16 = makePng({ width: 2, height: 1, colour: 6, depth: 16, rows: rows16(0xff), level: 0, before: [['sBIT', [16, 16, 16, 16]]] })
  const rgb16 = recompressPng(opaque16, { rgb: true }).png
  assert.equal(colourType(rgb16), 2)
  assert.deepEqual([...decodePng(rgb16).chunks.find((c) => c.type === 'sBIT').data], [16, 16, 16])
  assert.deepEqual(pixelsOf(rgb16), pixelsOf(opaque16))
  assert.equal(colourType(recompressPng(makePng({ width: 2, height: 1, colour: 6, depth: 16, rows: rows16(0xfe), level: 0 }), { rgb: true }).png), 6)
  // Other colour types are left their own.
  const gray = makePng({ width: 4, height: 1, colour: 4, rows: [Buffer.from([1, 255, 2, 255, 3, 255, 4, 255])], level: 0 })
  assert.equal(colourType(recompressPng(gray, { rgb: true }).png), 4)
})

test('the smaller file is kept: a candidate no smaller leaves the original, byte for byte', () => {
  const rows = rgbaRows(ROUND)
  const small = makePng({ width: 8, height: 8, colour: 6, rows, filters: [1] })
  const big = makePng({ width: 8, height: 8, colour: 6, rows, level: 0 })
  assert.ok(small.length < big.length)
  assert.equal(keepSmaller(big, small), small)
  assert.equal(keepSmaller(small, big), small)
  assert.equal(keepSmaller(small, Buffer.from(small)), small) // the same size: the original
  // Run again on its own output, the tool finds nothing smaller and keeps those very bytes.
  const once = recompressPng(big).png
  const twice = recompressPng(once)
  assert.equal(twice.png, once)
  // RGB asked of a file already RGB: the same.
  const rgb = recompressPng(makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows(), level: 0 }), { rgb: true }).png
  assert.equal(recompressPng(rgb, { rgb: true }).png, rgb)
})

test('the command writes only with --write, refuses what it cannot read, and imports nothing but Node', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recompress-png-'))
  try {
    const big = makePng({ width: 8, height: 8, colour: 6, rows: rgbaRows(), level: 0 })
    const file = join(dir, 'icon.png')
    const junk = join(dir, 'junk.png')
    writeFileSync(file, big)
    writeFileSync(junk, 'not a png')
    const run = (...args) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, [TOOL.pathname, ...args], { encoding: 'utf8' }) }
      } catch (e) {
        return { code: e.status, out: e.stdout }
      }
    }
    let r = run('--rgb', file)
    assert.equal(r.code, 0)
    assert.match(r.out, /colour type 6 -> 2; \d+ -> \d+ B .*64 pixels compared, 0 differing; would be written/)
    assert.deepEqual(readFileSync(file), big)
    r = run('--write', '--rgb', file, junk)
    assert.equal(r.code, 1)
    assert.match(r.out, /junk\.png: left as it is — not a PNG/)
    assert.deepEqual(readFileSync(file), recompressPng(big, { rgb: true }).png)
    assert.equal(readFileSync(junk, 'utf8'), 'not a png')
    assert.equal(run('--wrte', file).code, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const source = readFileSync(TOOL, 'utf8')
  const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(imports, ['node:fs', 'node:url', 'node:zlib'])
})
