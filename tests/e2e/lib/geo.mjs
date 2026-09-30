// Geometry on [lng, lat] rings, worked out in Node from what the map's
// sources hold rather than hard-coded, since the suites do not know the shape
// of today's hotspots ahead of time. Used by visitor-test and phone-test.

/** Whether a point is inside a ring: plain point-in-polygon, by ray casting. */
export const pointInPolygon = ([x, y], ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** The mean of a ring's points, its closing point counted too. */
export const centroidOf = (ring) => [
  ring.reduce((a, c) => a + c[0], 0) / ring.length,
  ring.reduce((a, c) => a + c[1], 0) / ring.length,
]
