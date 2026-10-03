// The published map read whole, and the grid the scale suites copy it across
// to make a map of 1,000 directions. COPIES and shift: scale-test and
// studio-scale-test. readPublished: studio-scale-test and save-test.
import { readFileSync } from 'node:fs'

/** How many copies of today's map a scale suite makes: PARAPO_SCALE_COPIES, or 250. */
export const COPIES = Number(process.env.PARAPO_SCALE_COPIES ?? 250)

/** Where copy `k` goes, in degrees east and north: 25 copies to a row, 0.03° apart. */
export const shift = (k) => [(k % 25) * 0.03, Math.floor(k / 25) * 0.03]

/** The published map with every line in full: the index, each line from lines/<id>.json beside it. */
export const readPublished = () => {
  const at = (name) => JSON.parse(readFileSync(new URL(`../../../public/data/${name}`, import.meta.url), 'utf8'))
  const index = at('index.v3.json')
  return { ...index, variants: index.variants.map(({ overview, ...v }) => ({ ...v, shape: overview ? at(`lines/${v.id}.json`).shape : null })) }
}
