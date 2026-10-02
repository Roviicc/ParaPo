// The drawing suites' helpers on the studio's page: where a [lng, lat] lands
// on the canvas, the wait for the router, and whether a layer draws at a
// pixel yet. Used by regression-gestures, snap-test and studio-phone-test, as
// `const { proj, idle, renderedAt } = drawing(page)`.
export const drawing = (page) => {
  /** Canvas pixels of a [lng, lat]. */
  const proj = async (c) => page.evaluate(c => { const q = window.__map.project(c); return [q.x, q.y] }, c)
  /** Until the page no longer says "snapping…", for up to 30 s. */
  const idle = async () => page.waitForFunction(() => !document.body.innerText.includes('snapping…'), null, { timeout: 30000 })
  /** Whether `layer` draws anything at canvas pixel `px` within 5 s. */
  const renderedAt = async (px, layer='draw-point-dots') => page.waitForFunction(([x, y, l]) => window.__map.queryRenderedFeatures([x, y], { layers: [l] }).length > 0, [px[0], px[1], layer], { timeout: 5000 }).then(() => true).catch(() => false)
  return { proj, idle, renderedAt }
}
