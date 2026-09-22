/**
 * The jeepneys that drive the chosen direction, seen from above like the
 * cars in Grab or Angkas, front pointing east so a bearing turns them the
 * way the arrow was turned.
 *
 * From above most of what makes a jeepney — the paintings, the curtains —
 * is out of sight, so these lean on what still shows: a long body with a
 * hood that sits narrower than its front fenders, a chrome bumper, the
 * horse on the hood, mirrors standing out at the windshield, the route
 * board across the front of the roof, a painted roof, and the open back
 * with its step.
 *
 * Candidates for the owner to choose between (2026-09-23). `toy` and
 * `painted` follow the two jeepneys he sent that day — a model with a
 * yellow roof, red-and-white edge stripes, a red route board and a blue
 * hood; and a painted one with a canvas roof, painted bands and a bumper in
 * colour blocks. The colours are placeholders, his to set.
 */

export type JeepDesign = 'toy' | 'painted' | 'classic' | 'route'
export const JEEP_DESIGNS: JeepDesign[] = ['toy', 'painted', 'classic', 'route']

/** Drawn in a box this size, front at the right. */
export const JEEP_W = 64
export const JEEP_H = 28

type Paint = {
  /** The body's sides, showing as a rim round the roof. */
  body: string
  roof: string
  /** Bands down both long edges of the roof, from its edge inwards; several colours paint the band in blocks. */
  bands: { inset: number; w: number; fill: string | string[] }[]
  /** The route board across the front of the roof, and the line of lettering on it. */
  board: string
  lettering: string
  hood: string
  /** The pinstripe down each side of the hood, if any. */
  hoodTrim?: string
  fender: string
  grille: string
  /** One colour is a chrome bar; several paint it in blocks. */
  bumper: string | string[]
  outline: string
}

const CHROME = '#dfe4ea'

const PAINT: Record<JeepDesign, Paint> = {
  // The model he sent: yellow roof edged red and white, red route board, blue hood pinstriped orange.
  toy: {
    body: '#1f3f8f',
    roof: '#f6c915',
    bands: [
      { inset: 0, w: 1.8, fill: '#d62828' },
      { inset: 1.8, w: 0.9, fill: '#ffffff' },
    ],
    board: '#d62828',
    lettering: '#ffffff',
    hood: '#1f3f8f',
    hoodTrim: '#f08a24',
    fender: '#183273',
    grille: '#f6c915',
    bumper: CHROME,
    outline: '#14181d',
  },
  // The painted one he sent: canvas roof with a painted edge, blue hood, yellow fenders, bumper in blocks.
  painted: {
    body: '#2456c8',
    roof: '#f2eee3',
    bands: [
      { inset: 0, w: 2.2, fill: ['#d62828', '#f6c915', '#1f5fbf', '#2a9d4b'] },
      { inset: 2.2, w: 0.7, fill: '#d62828' },
    ],
    board: '#1f3f8f',
    lettering: '#f6c915',
    hood: '#2456c8',
    hoodTrim: '#e0412a',
    fender: '#f2a81d',
    grille: '#f6c915',
    bumper: ['#d62828', '#f6c915', '#1f5fbf'],
    outline: '#14181d',
  },
  // Chrome body, the flag's red, yellow and blue along the roof.
  classic: {
    body: '#aab4bf',
    roof: '#dfe4ea',
    bands: [
      { inset: 1.5, w: 2.2, fill: '#d62828' },
      { inset: 4.3, w: 1.4, fill: '#f7c948' },
      { inset: 6.3, w: 1.4, fill: '#1f5fbf' },
    ],
    board: '#ffffff',
    lettering: '#1b1f24',
    hood: '#c9d1d9',
    fender: '#aab4bf',
    grille: '#8a949e',
    bumper: CHROME,
    outline: '#1b1f24',
  },
  // The route's own blue, so the jeeps and their line read as one thing.
  route: {
    body: '#2f4fb8',
    roof: '#406AF5',
    bands: [
      { inset: 2, w: 1.2, fill: '#ffffff' },
      { inset: 4.1, w: 0.8, fill: '#ffffff' },
    ],
    board: '#ffffff',
    lettering: '#10205a',
    hood: '#c9d1d9',
    fender: '#2f4fb8',
    grille: '#8a949e',
    bumper: CHROME,
    outline: '#10205a',
  },
}

/** A strip from (x, y), `w` long and `h` deep, in one colour or in blocks of `step` cycling through several. */
function strip(x: number, y: number, w: number, h: number, fill: string | string[], step: number, vertical = false): string {
  if (typeof fill === 'string') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  const out: string[] = []
  const long = vertical ? h : w
  for (let at = 0, i = 0; at < long; at += step, i++) {
    const len = Math.min(step, long - at)
    const c = fill[i % fill.length]
    out.push(
      vertical
        ? `<rect x="${x}" y="${y + at}" width="${w}" height="${len}" fill="${c}"/>`
        : `<rect x="${x + at}" y="${y}" width="${len}" height="${h}" fill="${c}"/>`,
    )
  }
  return out.join('')
}

// The roof, inside the body's rim.
const ROOF = { x: 5, y: 3.5, w: 35, h: 21 }

/** The jeep as an SVG document, front pointing east. */
export function jeepSvg(design: JeepDesign): string {
  const p = PAINT[design]
  const bands = p.bands
    .map(
      (b) =>
        strip(ROOF.x, ROOF.y + b.inset, ROOF.w, b.w, b.fill, 3) +
        strip(ROOF.x, ROOF.y + ROOF.h - b.inset - b.w, ROOF.w, b.w, b.fill, 3),
    )
    .join('')
  const trim = p.hoodTrim
    ? `<rect x="44" y="9.6" width="12.5" height=".8" fill="${p.hoodTrim}"/><rect x="44" y="17.6" width="12.5" height=".8" fill="${p.hoodTrim}"/>`
    : ''
  const bumper =
    typeof p.bumper === 'string'
      ? `<rect x="58.8" y="2.5" width="2.8" height="23" rx="1.2" fill="${p.bumper}" stroke="${p.outline}" stroke-width=".8"/>`
      : `<clipPath id="bumper"><rect x="58.8" y="2.5" width="2.8" height="23" rx="1.2"/></clipPath>` +
        `<g clip-path="url(#bumper)">${strip(58.8, 2.5, 2.8, 23, p.bumper, 2.6, true)}</g>` +
        `<rect x="58.8" y="2.5" width="2.8" height="23" rx="1.2" fill="none" stroke="${p.outline}" stroke-width=".8"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${JEEP_W}" height="${JEEP_H}" viewBox="0 0 ${JEEP_W} ${JEEP_H}">
<rect x="3" y="5.5" width="57" height="21" rx="4" fill="#000" opacity=".22"/>
<rect x="1" y="8" width="4" height="12" rx="1" fill="#3a3f45" stroke="${p.outline}" stroke-width=".8"/>
<rect x="37.5" y="0.6" width="2.2" height="3.6" rx="1" fill="#3a3f45"/>
<rect x="37.5" y="23.8" width="2.2" height="3.6" rx="1" fill="#3a3f45"/>
<rect x="43" y="3" width="15" height="7.5" rx="3.6" fill="${p.fender}" stroke="${p.outline}" stroke-width="1"/>
<rect x="43" y="17.5" width="15" height="7.5" rx="3.6" fill="${p.fender}" stroke="${p.outline}" stroke-width="1"/>
<rect x="4" y="2.5" width="37" height="23" rx="3" fill="${p.body}" stroke="${p.outline}" stroke-width="1"/>
<clipPath id="roof"><rect x="${ROOF.x}" y="${ROOF.y}" width="${ROOF.w}" height="${ROOF.h}" rx="2.4"/></clipPath>
<g clip-path="url(#roof)"><rect x="${ROOF.x}" y="${ROOF.y}" width="${ROOF.w}" height="${ROOF.h}" fill="${p.roof}"/>${bands}</g>
<rect x="35.5" y="4.5" width="4.5" height="19" rx="1" fill="${p.board}" stroke="${p.outline}" stroke-width=".6"/>
<rect x="37.4" y="8" width=".8" height="12" fill="${p.lettering}"/>
<rect x="40.6" y="6" width="2.4" height="16" rx="1" fill="#1d2733"/>
<rect x="42.5" y="8.5" width="16" height="11" rx="2.5" fill="${p.hood}" stroke="${p.outline}" stroke-width="1"/>
${trim}
<path d="M51.5 12.2 L56.5 14 L51.5 15.8 L52.6 14 z" fill="#eef2f5" stroke="${p.outline}" stroke-width=".6" stroke-linejoin="round"/>
<rect x="57.3" y="9.8" width="1.5" height="8.4" fill="${p.grille}"/>
${bumper}
<circle cx="56" cy="6.7" r="1.5" fill="#ffe27a" stroke="${p.outline}" stroke-width=".4"/>
<circle cx="56" cy="21.3" r="1.5" fill="#ffe27a" stroke="${p.outline}" stroke-width=".4"/>
</svg>`
}
