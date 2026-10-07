import { useMemo } from 'react';

import { RouteCard } from './route-card';
import { drawnDepartures } from '../model/departures';
import { liveriesFor, type Livery } from '../model/liveries';
import type { VariantSummary } from '../model/routes';

/** A card picked: the place it stands for, the directions its rows list, and its colour, for the map to light them in. */
export type PickedPlace = { from: string; ids: readonly string[]; livery: Livery };

type Props = {
  /** Every direction of every route to show, slots included, as the hooks hand them over. */
  routes: readonly VariantSummary[];
  /** Whether they are shown the way back rather than outbound. */
  back: boolean;
  /** The place whose card is Selected, by name; null when none is. */
  selected: string | null;
  /** A card was picked, or let go (null). */
  onSelect: (place: PickedPlace | null) => void;
  /** Called with the direction a row opens, and the colour its card wore: its trip wears the same. */
  onRoute: (v: VariantSummary, livery: Livery) => void;
  /** What the suites call each card and row (RouteCard). */
  testId: 'chooser' | 'card';
};

/**
 * Routes one way round as the owner's RouteCards (2026-09-28): a card per
 * place they leave from (departures), each in its livery — liveries.ts: at
 * random, kept for the visit, never two alike side by side — with a row per
 * drawn direction. One card at a time is Selected, and the map lights its
 * directions alone; a row opens its trip straight away, whether its card is
 * picked or not, and picks none — selecting it too was confusing — and the
 * trip's ‹ comes back to every card at rest (the owner's calls, 2026-09-29).
 * The route list stacks them under its header; the public map's
 * HintuanCard under its place's boxes, the routes stopping at the Selected
 * one; the studio's hotspot card under "Routes that pass through", or a
 * terminal's "Routes that stage here" — edge to edge in all three.
 */
export function RouteCardStack({ routes, back, selected, onSelect, onRoute, testId }: Props) {
  const places = drawnDepartures(routes, back);

  // Drawn once per stack, not per render: a place whose kept colour would
  // match its neighbour's wears a random other one, and must not flicker.
  const placeKey = places.map((p) => p.from).join('\n');
  const liveries = useMemo(() => (placeKey ? liveriesFor(placeKey.split('\n')) : []), [placeKey]);

  const byId = new Map(places.flatMap((p) => p.directions.map((d) => [d.v.id, d.v] as const)));

  return (
    <>
      {places.map((p, i) => (
        <RouteCard
          key={p.from}
          testId={testId}
          livery={liveries[i]}
          state={selected === p.from ? 'selected' : 'rest'}
          routeOrigin={p.from}
          endPoints={p.directions.map((d) => ({ id: d.v.id, routeDirection: d.to }))}
          onSelect={() =>
            onSelect(
              selected === p.from
                ? null
                : { from: p.from, ids: p.directions.map((d) => d.v.id), livery: liveries[i] },
            )
          }
          onPick={(id) => {
            const v = byId.get(id);
            if (v) onRoute(v, liveries[i]);
          }}
        />
      ))}
    </>
  );
}
