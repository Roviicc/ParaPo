/**
 * A signboard as an SVG file (the owner's ask, 2026-10-01: "upload signboard
 * in svg format", per direction), made safe to keep and to serve.
 *
 * An SVG is a document, not only a picture: it can carry scripts, handlers
 * and links out. Shown as an <img> none of that runs, but a board is also a
 * file on the map's own domain (public/data/signboards/), where opened on
 * its own it would. So each is cleaned twice with this one function — in the
 * studio before it is sent, and by the publish before it is written — and
 * what comes out is drawing only: the elements below and their looks, links
 * only to its own parts (`#id`) and pictures only as data.
 *
 * Plain text in and out, no DOM: the publish runs in Node. SVG is XML, so a
 * tag is `<name attr="…">` and text can hold no `<`; whatever does not read
 * that way is refused rather than guessed at.
 */

/** Past this a file is not a signboard: a few shapes and words are a few kB. The bucket says the same (0010). */
export const SIGNBOARD_MAX_BYTES = 100 * 1024

/** What may draw. Anything else is dropped with all it holds: script, style, foreignObject, a, animate, … */
const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'image',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feDropShadow',
  'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset', 'feTile',
])

/** A picture held inside the file itself — what Figma writes for an image fill. */
const DATA_PICTURE = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i

/** Whether an attribute stays: no handlers, links only within, url() only to its own parts. */
export function keepsAttribute(element: string, name: string, value: string): boolean {
  const n = name.toLowerCase()
  if (!/^[a-z_][\w:.-]*$/i.test(name) || n.startsWith('on')) return false
  const v = value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
  if (/(javascript|vbscript|data):/.test(v) && !(element === 'image' && isHref(n) && DATA_PICTURE.test(value.trim()))) return false
  if (isHref(n)) return value.trim().startsWith('#') || (element === 'image' && DATA_PICTURE.test(value.trim()))
  // In a look (fill="url(#g)", style="…"): only its own gradients and clips, nothing fetched.
  for (const m of v.matchAll(/url\(([^)]*)\)/g)) if (!m[1].replace(/["']/g, '').startsWith('#')) return false
  if (/@import|expression\(/.test(v)) return false
  return true
}

const isHref = (n: string) => n === 'href' || n.endsWith(':href')

const escapeValue = (v: string) => v.replace(/&(?!(#\d+|#x[\da-f]+|[a-z]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const TAG = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/y
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g

/** The file as drawing only, or why it is not a signboard, in words for the editor. */
export function cleanSignboardSvg(text: string): { svg: string } | { error: string } {
  if (new TextEncoder().encode(text).length > SIGNBOARD_MAX_BYTES) return { error: 'Over 100 kB — a signboard is a few shapes and words.' }
  if (/<!(DOCTYPE|ENTITY)/i.test(text)) return { error: 'This SVG declares its own entities; export it again without them.' }
  // What carries nothing to draw: the XML line, comments, instructions, CDATA (only ever a script's or style's).
  const src = text
    .replace(/^﻿/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')

  const out: string[] = []
  const open: { name: string; kept: boolean }[] = []
  /** How deep inside a dropped element: its insides go with it. */
  let dropping = 0
  let sawRoot = false
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    const textEnd = lt === -1 ? src.length : lt
    if (textEnd > i) {
      const t = src.slice(i, textEnd)
      if (open.length === 0) {
        if (t.trim()) return { error: 'Not an SVG file: there is text outside the drawing.' }
      } else if (!dropping) out.push(t.replace(/>/g, '&gt;'))
      i = textEnd
      if (lt === -1) break
    }
    TAG.lastIndex = i
    const m = TAG.exec(src)
    if (!m) return { error: 'Not an SVG file this can read: a tag is broken.' }
    i = TAG.lastIndex
    const [, closing, name, attrs, selfClosing] = m
    if (closing) {
      const top = open.pop()
      if (!top || top.name !== name) return { error: 'Not an SVG file this can read: its tags do not match.' }
      if (!top.kept) dropping--
      else if (!dropping) out.push(`</${name}>`)
      continue
    }
    if (open.length === 0) {
      if (sawRoot || name !== 'svg') return { error: 'Not an SVG file: it must be one <svg>.' }
      sawRoot = true
    }
    const kept = !dropping && ELEMENTS.has(name)
    if (kept) {
      const keep: string[] = []
      for (const a of attrs.matchAll(ATTR)) {
        const value = a[2] ?? a[3] ?? ''
        if (keepsAttribute(name, a[1], value)) keep.push(` ${a[1]}="${escapeValue(value)}"`)
      }
      out.push(`<${name}${keep.join('')}${selfClosing ? '/' : ''}>`)
    }
    if (!selfClosing) {
      open.push({ name, kept })
      if (!kept) dropping++
    }
  }
  if (!sawRoot || open.length) return { error: 'Not an SVG file this can read: it does not close.' }
  return { svg: out.join('').trim() }
}
