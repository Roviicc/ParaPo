// Lossless PNG recompression with Node's zlib alone: the same pixels in
// fewer bytes. Written for the app's icons (public/icons/), which the service
// worker stores on a first visit: the cheap-phone plan's step 9 (2026-10-05)
// ran it once, as a throwaway, and the owner's answer to question Q of the
// cheap-phone report (2026-10-06) keeps it here for the next icon export.
// No oxipng or zopflipng needed, and no package.
//
//   node scripts/assets/recompress-png.mjs <file.png ...>                say what it would do
//   node scripts/assets/recompress-png.mjs --write <file.png ...>        and do it
//   node scripts/assets/recompress-png.mjs --write --rgb <file.png ...>  and store an opaque RGBA image as RGB
//
// For each file:
//
// 1. Decode it: every chunk's CRC checked, the IDAT data inflated and
//    unfiltered, honouring its colour type and bit depth, palette and tRNS.
//    An interlaced or animated PNG, or one with a critical chunk this tool
//    does not know, is left as it is.
// 2. Encode the same image data under the same IHDR — the same size, colour
//    type, bit depth and no interlacing — trying each row's filter by what it
//    adds to the deflate stream after the rows already chosen, each of the
//    five filters for every row, libpng's own choice (the least sum of
//    absolute values) and the file's own filters, with deflate level 9,
//    memLevel 9, the default and the filtered strategies; the smallest wins.
//    The ancillary chunks that can change what is shown, or how, are kept in
//    their place (KEEP); the rest — text, tIME, private ones such as Apple's
//    iDOT, which points into the old IDAT — are dropped.
// 3. Decode that candidate again, from its own bytes alone, and compare it
//    with the original pixel by pixel, as RGBA at 16 bits a channel, the
//    colour under transparent pixels included. One pixel differing and the
//    file is refused: nothing is written and the run exits 1.
// 4. Keep the smaller of the original and the candidate: a file that does
//    not shrink is left as it is, byte for byte.
//
// --rgb: an RGBA image (colour type 6) whose every alpha is full is stored
// as RGB (colour type 2), without its alpha channel — a quarter fewer bytes
// before deflate. Only when asked, as it changes the PNG's colour type: the
// owner chose it for the two opaque icons (question N, 2026-10-06). An image
// with one alpha below full stays RGBA, as do the other colour types.
//
// Without --write nothing is written. The run exits 1 when any file was
// refused or could not be read, 0 otherwise. It is slow, as it tries every
// filter on every row twice over: half a minute to a minute for a 512 px
// icon, two minutes for all five of public/icons (2026-10-06).
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { constants as Z, deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

// --------------------------------------------------------------- chunks, CRC
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(bytes) {
  let c = -1
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** The critical chunks a decoder must understand; any other one is refused. */
const CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND'])

/** A PNG's chunks, `{ type, data }`, up to IEND, every CRC checked. */
export function readChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  const chunks = []
  let o = 8
  while (o < buf.length) {
    if (o + 12 > buf.length) throw new Error('cut short')
    const length = buf.readUInt32BE(o)
    if (o + 12 + length > buf.length) throw new Error('cut short')
    const type = buf.toString('latin1', o + 4, o + 8)
    const data = buf.subarray(o + 8, o + 8 + length)
    if (crc32(buf.subarray(o + 4, o + 8 + length)) !== buf.readUInt32BE(o + 8 + length)) throw new Error(`bad CRC in ${type}`)
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error('an animated PNG')
    if ((type.charCodeAt(0) & 32) === 0 && !CRITICAL.has(type)) throw new Error(`a critical chunk this tool does not know, ${type}`)
    chunks.push({ type, data })
    o += 12 + length
    if (type === 'IEND') break
  }
  if (chunks[0]?.type !== 'IHDR' || chunks.at(-1)?.type !== 'IEND') throw new Error('no IHDR first or no IEND last')
  return chunks
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

// ------------------------------------------------------------------ decoding
/** Samples per pixel, by colour type: gray, RGB, palette, gray + alpha, RGBA. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
/** The bit depths each colour type allows. */
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }

function header(ihdr) {
  if (ihdr.length !== 13) throw new Error('IHDR is not 13 bytes')
  const h = { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], colour: ihdr[9], interlace: ihdr[12] }
  if (!h.width || !h.height) throw new Error('an empty image')
  if (!DEPTHS[h.colour]?.includes(h.depth)) throw new Error(`colour type ${h.colour} at ${h.depth} bits`)
  if (ihdr[10] !== 0 || ihdr[11] !== 0) throw new Error('an unknown compression or filter method')
  if (h.interlace !== 0) throw new Error('interlaced (Adam7)')
  h.channels = CHANNELS[h.colour]
  h.bpp = Math.max(1, (h.channels * h.depth) / 8) // the filters' bytes per complete pixel
  h.stride = Math.ceil((h.width * h.channels * h.depth) / 8)
  return h
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** The image's rows, unfiltered, without their filter bytes. */
function unfilter(raw, h) {
  const { height, stride, bpp } = h
  if (raw.length !== height * (stride + 1)) throw new Error(`the image data is ${raw.length} bytes, not ${height * (stride + 1)}`)
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)]
    if (type > 4) throw new Error(`filter type ${type} on row ${y}`)
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = out.subarray(y * stride, (y + 1) * stride)
    const up = y ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0
      const b = up ? up[x] : 0
      const c = up && x >= bpp ? up[x - bpp] : 0
      const p = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c)
      row[x] = src[x] + p // a Buffer keeps the low 8 bits
    }
  }
  return out
}

/**
 * A PNG decoded from its bytes alone: its header, its chunks, its rows
 * unfiltered (`raw` is the inflated data, filter bytes and all) and every
 * pixel as RGBA at 16 bits a channel, palette, tRNS and bit depth applied,
 * as a decoder would show them.
 */
export function decodePng(buf) {
  const chunks = readChunks(buf)
  const h = header(chunks[0].data)
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)))
  const rows = unfilter(raw, h)
  const plte = chunks.find((c) => c.type === 'PLTE')?.data
  const trns = chunks.find((c) => c.type === 'tRNS')?.data
  if (h.colour === 3 && !plte) throw new Error('a palette image without PLTE')
  const max = 2 ** h.depth - 1
  const scale = (v) => Math.round((v * 65535) / max) // to 16 bits, as a decoder would
  const sample = (row, i) => {
    if (h.depth === 16) return row.readUInt16BE(i * 2)
    if (h.depth === 8) return row[i]
    const bit = i * h.depth
    return (row[bit >> 3] >> (8 - h.depth - (bit & 7))) & max
  }
  const key = (i) => (trns && trns.length >= 2 * (i + 1) ? trns.readUInt16BE(2 * i) : -1) // tRNS's colour key, gray or R, G, B
  const rgba = new Uint16Array(h.width * h.height * 4)
  for (let y = 0; y < h.height; y++) {
    const row = rows.subarray(y * h.stride, (y + 1) * h.stride)
    for (let x = 0; x < h.width; x++) {
      const s = (k) => sample(row, x * h.channels + k)
      let r, g, b, a
      if (h.colour === 3) {
        const i = s(0)
        if (i * 3 + 2 >= plte.length) throw new Error(`palette index ${i} out of range`)
        r = plte[i * 3] * 257
        g = plte[i * 3 + 1] * 257
        b = plte[i * 3 + 2] * 257
        a = trns && i < trns.length ? trns[i] * 257 : 65535
      } else if (h.colour === 0 || h.colour === 4) {
        const v = s(0)
        r = g = b = scale(v)
        a = h.colour === 4 ? scale(s(1)) : v === key(0) ? 0 : 65535
      } else {
        const [vr, vg, vb] = [s(0), s(1), s(2)]
        r = scale(vr)
        g = scale(vg)
        b = scale(vb)
        a = h.colour === 6 ? scale(s(3)) : vr === key(0) && vg === key(1) && vb === key(2) ? 0 : 65535
      }
      const o = (y * h.width + x) * 4
      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = a
    }
  }
  return { header: h, chunks, raw, rows, rgba }
}

/** How many pixels of two decoded images differ, as RGBA at 16 bits; all of them when their sizes do. */
export function differingPixels(a, b) {
  const n = a.header.width * a.header.height
  if (a.header.width !== b.header.width || a.header.height !== b.header.height) return Math.max(n, b.header.width * b.header.height)
  let differing = 0
  for (let i = 0; i < a.rgba.length; i += 4) {
    if (a.rgba[i] !== b.rgba[i] || a.rgba[i + 1] !== b.rgba[i + 1] || a.rgba[i + 2] !== b.rgba[i + 2] || a.rgba[i + 3] !== b.rgba[i + 3]) differing++
  }
  return differing
}

// ------------------------------------------------------------------ encoding
function filterRow(type, row, up, bpp) {
  const out = Buffer.alloc(row.length + 1)
  out[0] = type
  for (let x = 0; x < row.length; x++) {
    const a = x >= bpp ? row[x - bpp] : 0
    const b = up ? up[x] : 0
    const c = up && x >= bpp ? up[x - bpp] : 0
    const p = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c)
    out[x + 1] = (row[x] - p) & 0xff
  }
  return out
}

const WINDOW = 32768 // deflate looks back this far, and no further
const zopts = (strategy) => ({ level: 9, memLevel: 9, windowBits: 15, strategy })

/**
 * Each row's filter chosen by what it adds to the stream after the rows
 * already chosen: deflate(context + row) - deflate(context), the last 32 kB
 * as the context.
 */
function filteredByCost(rows, h, strategy) {
  const { height, stride, bpp } = h
  const parts = []
  let tail = Buffer.alloc(0)
  for (let y = 0; y < height; y++) {
    const row = rows.subarray(y * stride, (y + 1) * stride)
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null
    const base = tail.length ? deflateSync(tail, zopts(strategy)).length : 0
    let best = null
    for (let t = 0; t <= 4; t++) {
      const f = filterRow(t, row, up, bpp)
      const cost = deflateSync(Buffer.concat([tail, f]), zopts(strategy)).length - base
      if (!best || cost < best.cost) best = { cost, f }
    }
    parts.push(best.f)
    tail = Buffer.concat([tail, best.f])
    if (tail.length > WINDOW) tail = tail.subarray(tail.length - WINDOW)
  }
  return Buffer.concat(parts)
}

/** Every row with one filter, or with libpng's choice: the least sum of absolute values. */
function filteredBy(rows, h, pick) {
  const { height, stride, bpp } = h
  const parts = []
  for (let y = 0; y < height; y++) {
    const row = rows.subarray(y * stride, (y + 1) * stride)
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null
    if (pick !== 'minsum') {
      parts.push(filterRow(pick, row, up, bpp))
      continue
    }
    let best = null
    for (let t = 0; t <= 4; t++) {
      const f = filterRow(t, row, up, bpp)
      let sum = 0
      for (let i = 1; i < f.length; i++) sum += f[i] < 128 ? f[i] : 256 - f[i]
      if (!best || sum < best.sum) best = { sum, f }
    }
    parts.push(best.f)
  }
  return Buffer.concat(parts)
}

/**
 * The ancillary chunks that can change what is shown, or how: kept, in
 * their place before or after the image data. PLTE, a critical one, too.
 */
export const KEEP = new Set(['PLTE', 'tRNS', 'iCCP', 'gAMA', 'sRGB', 'cHRM', 'cICP', 'mDCV', 'cLLI', 'sBIT', 'pHYs', 'eXIf', 'bKGD', 'hIST', 'sPLT'])

function encode(ihdr, chunks, idat) {
  const before = []
  const after = []
  let seenIdat = false
  for (const c of chunks.slice(1, -1)) {
    if (c.type === 'IDAT') seenIdat = true
    else if (KEEP.has(c.type)) (seenIdat ? after : before).push(c)
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    ...before.map((c) => chunk(c.type, c.data)),
    chunk('IDAT', idat),
    ...after.map((c) => chunk(c.type, c.data)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The image as RGB when it is RGBA (colour type 6) and every alpha is full;
 * null otherwise. sBIT loses its alpha byte with the channel.
 */
function opaqueAsRgb(png) {
  const { header: h, chunks, rows } = png
  if (h.colour !== 6) return null
  const size = h.depth / 8 // bytes a sample
  const full = 2 ** h.depth - 1
  for (let i = 3 * size; i < rows.length; i += 4 * size) if ((size === 2 ? rows.readUInt16BE(i) : rows[i]) !== full) return null
  const rgb = Buffer.alloc((rows.length / 4) * 3)
  for (let i = 0, j = 0; i < rows.length; i += 4 * size, j += 3 * size) rows.copy(rgb, j, i, i + 3 * size)
  const ihdr = Buffer.from(chunks[0].data)
  ihdr[9] = 2
  return {
    header: header(ihdr),
    ihdr,
    chunks: chunks.map((c) => (c.type === 'sBIT' ? { type: 'sBIT', data: c.data.subarray(0, 3) } : c)),
    rows: rgb,
  }
}

/**
 * The smallest encoding found of `buf`'s image, under its own IHDR, or as
 * RGB with `rgb` when it is RGBA and fully opaque. Not yet checked against
 * the original: keepSmaller does that.
 */
export function smallestEncoding(buf, { rgb = false } = {}) {
  const png = decodePng(buf)
  const asRgb = rgb ? opaqueAsRgb(png) : null
  const image = asRgb ?? { header: png.header, ihdr: png.chunks[0].data, chunks: png.chunks, rows: png.rows }
  const tries = []
  for (const strategy of [Z.Z_DEFAULT_STRATEGY, Z.Z_FILTERED]) {
    tries.push({ how: `each row's filter by its cost, strategy ${strategy}`, strategy, data: filteredByCost(image.rows, image.header, strategy) })
    for (const pick of [0, 1, 2, 3, 4, 'minsum']) tries.push({ how: `filter ${pick}, strategy ${strategy}`, strategy, data: filteredBy(image.rows, image.header, pick) })
    if (!asRgb) tries.push({ how: `the file's own filters, strategy ${strategy}`, strategy, data: png.raw })
  }
  let best = null
  for (const t of tries) {
    const out = encode(image.ihdr, image.chunks, deflateSync(t.data, zopts(t.strategy)))
    if (!best || out.length < best.png.length) best = { png: out, how: t.how }
  }
  return best
}

/**
 * The file to keep: `candidate` when its pixels are `original`'s, every
 * one, and it is smaller; `original`, the very bytes, when it is not
 * smaller. Throws, refusing, when one pixel differs or either cannot be
 * decoded — whatever made the candidate.
 */
export function keepSmaller(original, candidate) {
  const before = decodePng(original)
  const after = decodePng(candidate)
  const differing = differingPixels(before, after)
  if (differing) throw new Error(`refused: ${differing} of ${before.header.width * before.header.height} pixels differ from the original's`)
  return candidate.length < original.length ? candidate : original
}

/**
 * `buf` recompressed: `png` is what to keep (`buf` itself when nothing
 * smaller was found), `how` the encoding that won, `colour` its colour type
 * before and after. Throws when the file cannot be read or the candidate's
 * pixels are not the original's.
 */
export function recompressPng(buf, { rgb = false } = {}) {
  const { png: candidate, how } = smallestEncoding(buf, { rgb })
  const png = keepSmaller(buf, candidate)
  const colour = [buf[25], png[25]] // IHDR's colour type
  return { png, how, colour, pixels: buf.readUInt32BE(16) * buf.readUInt32BE(20) }
}

// ---------------------------------------------------------------------- main
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const rgb = args.includes('--rgb')
  const unknown = args.filter((a) => a.startsWith('--') && a !== '--write' && a !== '--rgb')
  const files = args.filter((a) => !a.startsWith('--'))
  if (unknown.length || !files.length) {
    console.error('usage: node scripts/assets/recompress-png.mjs [--write] [--rgb] <file.png ...>')
    process.exit(2)
  }
  let failed = 0
  let total0 = 0
  let total1 = 0
  for (const file of files) {
    const original = readFileSync(file)
    let result
    try {
      result = recompressPng(original, { rgb })
    } catch (e) {
      failed++
      total0 += original.length
      total1 += original.length
      console.log(`${file}: left as it is — ${e.message}`)
      continue
    }
    const { png, how, colour, pixels } = result
    const smaller = png !== original
    total0 += original.length
    total1 += png.length
    const pct = (((png.length - original.length) / original.length) * 100).toFixed(1)
    console.log(
      `${file}: colour type ${colour[0]}${colour[1] !== colour[0] ? ` -> ${colour[1]}` : ''}; ${original.length} -> ${png.length} B` +
        (smaller ? ` (${pct}%, ${how}); ${pixels} pixels compared, 0 differing; ${write ? 'written' : 'would be written (--write)'}` : '; nothing smaller found, left as it is'),
    )
    if (smaller && write) writeFileSync(file, png)
  }
  if (files.length > 1) console.log(`together: ${total0} -> ${total1} B (${total0 - total1} B less)`)
  process.exit(failed ? 1 : 0)
}
