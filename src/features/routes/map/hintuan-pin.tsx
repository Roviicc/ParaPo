import { Marker, type MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { LngLat } from '@/shared/utils/geo';

import { tapsOnItsButton } from './marker-tap';
import { CARD_SURFACE, CARD_TEXT, TIMELINE_SURFACE } from '../cards/livery-card';
import { TimelineDot } from '../cards/trip-timeline';
import type { Livery } from '../model/liveries';
import './hintuan-pin.css';

interface Props {
  map: MapLibreMap;
  /** Where the picked hintuan is (useRideTo's `pinAt`). */
  at: LngLat;
  /** The hintuan's name, written beside the circle; none, and the circle stands alone. */
  label?: string | null;
  /** The trip's colour: the circle is ringed in its rail's. */
  livery: Livery;
  /** Given, the name is a button: the public map's lets the pick go. */
  onPick?: () => void;
}

/**
 * The picked hintuan on the map: a circle that pops up where it is, the
 * route left whole — the owner's ask of 2026-09-30: "now I don't want to
 * cut the route, but we still select hintuan it is just the a circle will
 * pop up when that hintuan is selected". It is the timeline's own
 * TimelineDot, Selected, in the trip's livery, so the map and the card
 * point at the same place the same way.
 *
 * A DOM marker, like the visitor's own (LocatorIndicatorOverlay): the pop
 * is a CSS animation that costs the map nothing, and it takes no taps, so
 * a tap on it reaches the line or the box beneath. The caller keys it on the pick, so another hintuan pops a
 * fresh circle.
 *
 * Beside it, its name (the owner's SelectedHintuanRouteTitle, Figma
 * 3847:11777, 2026-09-30): a pill in the trip card's surface and words,
 * 10px right of the circle and centred on it, so the circle stays on the
 * point the marker is anchored to. Given `onPick`, the name is a button
 * (it opened the hintuan's place, the owner's ask of 2026-10-01, until his
 * of 2026-10-03: it lets the pick go, the camera back); the circle still
 * takes no taps.
 *
 * Over the name, End (the owner's SelectedHintuanRouteTitle, Figma
 * 3848:12135, 2026-10-02): picked, the hintuan is where the ride ends, so
 * the chevrons stop here (useLitRides) and the route's own tail keeps its
 * name without the word (EndTitles).
 */
export function HintuanPin({ map, at, label, livery, onPick }: Props) {
  const [el] = useState(() => {
    const div = document.createElement('div');
    div.className = 'hintuan-pin';
    div.dataset.testid = 'hintuan-pin';
    return div;
  });
  const marker = useRef<Marker | null>(null);

  useEffect(() => {
    const m = new Marker({ element: el, anchor: 'center' }).setLngLat(at).addTo(map);
    marker.current = m;
    return () => {
      m.remove();
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once per map; the effect below moves it
  }, [map, el]);

  // The line's point for a pick can land a moment after the pick itself.
  useEffect(() => {
    marker.current?.setLngLat(at);
  }, [at]);

  // Read as the tap comes: a fresh function each render binds nothing anew.
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => tapsOnItsButton(el, () => pick.current?.()), [el]);

  el.dataset.livery = livery;
  const Title = onPick ? 'button' : 'div';
  // Popped, and untucked from a rail it has none of, by hintuanPin.css.
  return createPortal(
    <>
      <TimelineDot rail={TIMELINE_SURFACE[livery]} selected />
      {label && (
        <Title
          // Says what the tap does since the owner's ask of 2026-10-03: it
          // lets the pick go, no longer opening the routes there.
          {...(onPick ? { type: 'button' as const, 'aria-label': `End, ${label}: let it go` } : {})}
          className="hintuan-pin-title absolute top-1/2 left-full ml-2.5 flex max-w-56 flex-col items-center"
        >
          {/* Over the name, as over a ride's own end (EndTitles): the ride now ends here. */}
          <span
            data-part="badge"
            className="absolute bottom-full mb-1 rounded-full bg-brand-surface-secondary px-2 py-1 text-sm/5 font-medium text-content-inverse"
          >
            End
          </span>
          <span
            data-testid="hintuan-pin-title"
            className={
              'max-w-full truncate rounded-full px-2 py-1 text-sm/5 font-medium shadow-selected-hintuan-route-title ' +
              CARD_SURFACE[livery] +
              ' ' +
              CARD_TEXT[livery]
            }
          >
            {label}
          </span>
        </Title>
      )}
    </>,
    el,
  );
}
