/**
 * A button inside a DOM marker (a place's name over its circle, EndTitles,
 * HintuanPin) that answers a tap itself. MapLibre listens on its container,
 * which holds the markers, so a tap on one would otherwise also land on the
 * map: a line or a box beneath would open, or a press would start a pan.
 *
 * Bound natively on the marker's element, because React hears events at the
 * page's root, after the map has. Returns what unbinds it.
 */
const THE_MAP_HEARS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'click',
  'dblclick',
] as const;
/** The map's own taps — its `click`, which the app's taps hear (routeTaps, stopTaps) — and nothing else. */
const ITS_TAPS = ['click', 'dblclick'] as const;

/**
 * `dragsPass`: a press that moves still reaches the map and pans it; only
 * the tap is the button's. For a button where the visitor's finger often
 * lands to pan — the visitor's own dot, in the middle of the screen
 * (LocatorOnMap) — where a pan stopped dead would be the surprise.
 */
export function tapsOnItsButton(
  el: HTMLElement,
  onTap: () => void,
  { dragsPass = false } = {},
): () => void {
  const stop = (e: Event) => {
    if (!(e.target instanceof Element) || !e.target.closest('button')) return;
    e.stopPropagation();
    // A key's Enter or Space on the button is a click too.
    if (e.type === 'click') onTap();
  };
  const types = dragsPass ? ITS_TAPS : THE_MAP_HEARS;
  for (const type of types) el.addEventListener(type, stop);
  return () => {
    for (const type of types) el.removeEventListener(type, stop);
  };
}
