/**
 * A button inside a DOM marker (a place's name over its circle, EndTitles,
 * HintuanPin) that answers a tap itself. MapLibre listens on its container,
 * which holds the markers, so a tap on one would otherwise also land on the
 * map: a line or a box beneath would open, or a press would start a pan.
 *
 * Bound natively on the marker's element, because React hears events at the
 * page's root, after the map has. Returns what unbinds it.
 */
const THE_MAP_HEARS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick'] as const

export function tapsOnItsButton(el: HTMLElement, onTap: () => void): () => void {
  const stop = (e: Event) => {
    if (!(e.target instanceof Element) || !e.target.closest('button')) return
    e.stopPropagation()
    // A key's Enter or Space on the button is a click too.
    if (e.type === 'click') onTap()
  }
  for (const type of THE_MAP_HEARS) el.addEventListener(type, stop)
  return () => {
    for (const type of THE_MAP_HEARS) el.removeEventListener(type, stop)
  }
}
