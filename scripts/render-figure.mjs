// Renders the walker's sprites from its 3D model (docs/figure/commuter-3d.html)
// into public/figure/: the 5 × 4 sheet and the flying frame, at 2× display
// size, the sizes src/shared/index.css expects. Both are written as
// 256-colour PNGs: the installed app stores them for offline use, so every
// visitor downloads them once.
//
//   node scripts/render-figure.mjs
//   THREE_JS=path/to/three.min.js node scripts/render-figure.mjs   where cdnjs is blocked
//   PW_CHROMIUM=/path/to/chrome node scripts/render-figure.mjs      a Chromium other than Playwright's
//
// The model loads three.js r128 from cdnjs; THREE_JS serves a local copy
// of that same build instead.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const model = pathToFileURL(join(root, 'docs/figure/commuter-3d.html')).href

/**
 * Median cut over RGBA: split the box with the widest channel at its median
 * until there are `colours` boxes; each box's mean is its palette entry.
 * Fully transparent pixels share entry 0.
 */
function quantize(rgba, colours = 256) {
  const n = rgba.length / 4
  const index = new Uint8Array(n)
  const opaque = []
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] > 0) opaque.push(i)
  const range = (box) => {
    let best = -1, channel = 0
    for (let c = 0; c < 4; c++) {
      let lo = 255, hi = 0
      for (const i of box) { const v = rgba[i * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v }
      if (hi - lo > best) { best = hi - lo; channel = c }
    }
    return { spread: best, channel }
  }
  const boxes = [{ px: opaque, ...range(opaque) }]
  while (boxes.length < colours - 1) {
    let pick = -1, score = 0
    boxes.forEach((b, k) => { const s = b.spread * Math.sqrt(b.px.length); if (b.px.length > 1 && s > score) { score = s; pick = k } })
    if (pick < 0) break
    const { px, channel } = boxes[pick]
    px.sort((a, b) => rgba[a * 4 + channel] - rgba[b * 4 + channel])
    const mid = px.length >> 1
    const a = px.slice(0, mid), b = px.slice(mid)
    boxes.splice(pick, 1, { px: a, ...range(a) }, { px: b, ...range(b) })
  }
  const palette = [[0, 0, 0, 0]]
  boxes.forEach((box, k) => {
    const sum = [0, 0, 0, 0]
    for (const i of box.px) for (let c = 0; c < 4; c++) sum[c] += rgba[i * 4 + c]
    palette.push(sum.map((v) => Math.round(v / box.px.length)))
    for (const i of box.px) index[i] = k + 1
  })
  return { palette, index }
}

/** An 8-bit indexed PNG, with the palette's alpha in tRNS. */
function palettePng(width, height, { palette, index }) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // indexed colour
  const rows = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    rows[y * (width + 1)] = 0 // no filter
    rows.set(index.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flatMap(([r, g, b]) => [r, g, b]))),
    chunk('tRNS', Buffer.from(palette.map((p) => p[3]))),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
if (process.env.THREE_JS) {
  await page.route('**/three.min.js', (r) => r.fulfill({ path: process.env.THREE_JS, contentType: 'text/javascript' }))
}
page.on('pageerror', (e) => console.error('[render-figure]', e.message))
await page.goto(model)
await page.waitForFunction(() => window.figurePixels !== undefined, null, { timeout: 60000 })

for (const [name, file] of [['sheet', 'walker@2x.png'], ['flying', 'flying@2x.png']]) {
  const { width, height, rgba } = await page.evaluate((n) => window.figurePixels(n), name)
  const png = palettePng(width, height, quantize(new Uint8Array(Buffer.from(rgba, 'base64'))))
  writeFileSync(join(root, 'public/figure', file), png)
  console.log(`[render-figure] public/figure/${file}  ${width} × ${height}  ${(png.length / 1024).toFixed(1)} kB`)
}
await browser.close()
