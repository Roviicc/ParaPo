import { Marker, type MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { haversine } from '@/shared/utils/geo';

import { tapsOnItsButton } from './marker-tap';
import { CARD_SURFACE, CARD_TEXT } from '../cards/livery-card';
import { TimelineDot } from '../cards/trip-timeline';
import { hotspotLabel, type Hotspot } from '../model/hotspots';
import type { Livery } from '../model/liveries';
import { isLineMode, servedBy, type VariantSummary } from '../model/routes';
import './hintuan-pin.css';

/** The scale bar's width (MapView's ScaleControl, MapLibre's default maxWidth). */
const SCALE_PX = 100;

/** How much ground the scale bar's width may span with the names still on: under 3 km. */
const NAMES_UNTIL_M = 3000;

/**
 * Whether the names show: until the scale bar reads 3 km — the owner's
 * asks of 2026-10-02, "as zoomed out to 1km it will be removed", then
 * 1.5 km, 2 km, then "try 3km". Measured the way the bar measures itself,
 * across its width at the map's middle height: it reads 2 km up to
 * 3,000 m, so the names stay through its 2 km and go at its 3 km.
 * Further out, the dots alone, so the pills never pile up.
 */
function namesShow(map: MapLibreMap): boolean {
  const y = map.getContainer().clientHeight / 2;
  return (
    haversine(map.unproject([0, y]).toArray(), map.unproject([SCALE_PX, y]).toArray()) <
    NAMES_UNTIL_M
  );
}

/**
 * The selected line's stations along it, a train's or the ferry's (the
 * ferry the same way, his ask of 2026-10-03) — the owner's asks of
 * 2026-10-02: a dot at each, its name beside it, for the selected line
 * only. The name is the owner's RouteLineLabel, SelectedHintuanRouteTitle's
 * Default (Figma 3846:11748): the picked hintuan's pill (HintuanPin), in
 * the trip card's surface and words, without its End. The dot is the
 * timeline's own TimelineDot at rest, its accent that same surface, so
 * the dot and its name are one colour, as the owner asked.
 *
 * The two ends are left to their end titles (EndTitles), and a picked
 * station to its HintuanPin. Once the scale bar reads 3 km only the
 * dots show, smaller. The names are 12px, the picked one's pill 14px (the
 * owner's ask, 2026-10-02). Given `onPick`, the dot and its name are one
 * button that hands it the station's id: the public map opens its place,
 * the studio picks it.
 */
export function StationLabels({
  map,
  selected,
  hotspots,
  livery,
  pickedId,
  onPick,
}: {
  map: MapLibreMap;
  selected: VariantSummary;
  hotspots: readonly Hotspot[];
  livery: Livery;
  /** The picked hintuan, which its HintuanPin names. */
  pickedId?: string | null;
  /** Called with the tapped station's id. */
  onPick?: (hotspotId: string) => void;
}) {
  const [named, setNamed] = useState(() => namesShow(map));
  useEffect(() => {
    const on = () => setNamed(namesShow(map));
    // On every move, as the bar itself: its metres change with the latitude too.
    map.on('move', on);
    return () => {
      map.off('move', on);
    };
  }, [map]);

  const route = selected.route;
  if (!isLineMode(route?.mode)) return null;
  // A line's stations, a train's or the ferry's (servedBy): both directions stop at each.
  const ends = new Set([route.head_stop_id, route.tail_stop_id, pickedId]);
  const stations = hotspots.filter((s) => servedBy(s, route) && !ends.has(s.id));
  return (
    <>
      {stations.map((s) => (
        <StationLabel
          key={s.id}
          map={map}
          hotspot={s}
          livery={livery}
          named={named}
          onPick={onPick}
        />
      ))}
    </>
  );
}

function StationLabel({
  map,
  hotspot,
  livery,
  named,
  onPick,
}: {
  map: MapLibreMap;
  hotspot: Hotspot;
  livery: Livery;
  named: boolean;
  onPick?: (hotspotId: string) => void;
}) {
  const [el] = useState(() => {
    const div = document.createElement('div');
    div.className = 'hintuan-pin station-label';
    div.dataset.testid = 'station-label';
    return div;
  });
  useEffect(() => {
    const m = new Marker({ element: el, anchor: 'center' })
      .setLngLat(hotspot.point.coordinates)
      .addTo(map);
    return () => {
      m.remove();
    };
  }, [map, el, hotspot.point.coordinates]);
  // Read as the tap comes: a fresh function each render binds nothing anew (HintuanPin).
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => tapsOnItsButton(el, () => pick.current?.(hotspot.id)), [el, hotspot.id]);

  // Further out, a smaller dot (hintuanPin.css), so the stations read as beads, not a wall.
  el.toggleAttribute('data-far', !named);
  const label = hotspotLabel(hotspot);
  // The dot and its name are one tap (the owner's ask, 2026-10-02): one button around both.
  const Tap = onPick ? 'button' : 'div';
  return createPortal(
    <Tap
      {...(onPick ? { type: 'button' as const, 'aria-label': label } : {})}
      className="station-label-tap relative flex rounded-full"
    >
      <TimelineDot rail={CARD_SURFACE[livery]} />
      {named && (
        <span className="hintuan-pin-title absolute top-1/2 left-full ml-2.5 flex max-w-56">
          <span
            data-testid="station-label-title"
            className={
              'max-w-full truncate rounded-full px-2 py-1 text-xs/4 font-medium shadow-selected-hintuan-route-title ' +
              CARD_SURFACE[livery] +
              ' ' +
              CARD_TEXT[livery]
            }
          >
            {label}
          </span>
        </span>
      )}
    </Tap>,
    el,
  );
}
