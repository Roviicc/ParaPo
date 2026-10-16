import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { BASEMAPS } from './basemap';
import { BasemapControl } from './basemap-control';
import { BASEMAP_THUMBNAILS } from './basemap-thumbnails';

import 'maplibre-gl/dist/maplibre-gl.css';

/** What MapLibre puts in the top-right corner before the button, as MapView does. */
type Above = 'nothing' | 'attribution' | 'attribution-folded' | 'zoom';

interface HostedProps extends Omit<ComponentProps<typeof BasemapControl>, 'map'> {
  above: Above;
}

/**
 * The control needs a map to switch, but opening its card draws nothing on
 * one: a real MapLibre map with an empty inline style stands in, so the story
 * fetches no tiles. Picking another design would fetch that design's style,
 * so the stories only open, close and keep the current one.
 */
function OnAnEmptyMap({ above, ...props }: HostedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const created = new MapLibreMap({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] },
      attributionControl: false,
    });
    // A phone's credits, open as MapView's are until the first drag; or a mouse's +, − and compass.
    if (above === 'attribution' || above === 'attribution-folded') {
      created.addControl(
        new AttributionControl({
          compact: true,
          customAttribution:
            'OpenFreeMap © OpenMapTiles Data from OpenStreetMap · Route data © ParaPo contributors, ODbL · © OpenStreetMap contributors · OpenFreeMap · OSRM',
        }),
        'top-right',
      );
    }
    // Folded to its ⓘ, as MapLibre folds it at a first drag and the studio from the start (MapView).
    if (above === 'attribution-folded') {
      created
        .getContainer()
        .querySelector('.maplibregl-compact')
        ?.classList.remove('maplibregl-compact-show');
    }
    if (above === 'zoom') created.addControl(new NavigationControl(), 'top-right');
    setMap(created);
    return () => {
      setMap(null);
      created.remove();
    };
  }, [above]);

  return (
    <>
      {/* Sized as MapView sizes it: MapLibre makes the container `position: relative`. */}
      <div ref={containerRef} className="h-full w-full" />
      {map && <BasemapControl {...props} map={map} />}
    </>
  );
}

const meta = {
  title: 'Features/Routes/BasemapControl',
  component: OnAnEmptyMap,
  // A phone-sized map for the button to sit in the top-right corner of.
  decorators: [
    (Story) => (
      <div className="relative h-[480px] w-[390px] overflow-clip bg-surface-quaternary">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  args: {
    basemaps: BASEMAPS,
    thumbnails: BASEMAP_THUMBNAILS,
    initial: BASEMAPS[0],
    above: 'nothing',
  },
} satisfies Meta<typeof OnAnEmptyMap>;

export default meta;
type Story = StoryObj<typeof meta>;

const openCard = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Map design' }));
  return canvas.getByRole('dialog', { name: 'Map Style' });
};

/** A mouse on the public map: nothing above it, so it takes the corner. Closed. */
export const Closed: Story = {};

/** Open: the three designs, the current one ringed and holding the keyboard. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    const monochrome = within(card).getByRole('button', { name: 'Monochrome' });
    await expect(monochrome).toHaveAttribute('aria-pressed', 'true');
    await expect(monochrome).toHaveFocus();
    // The other two designs; ✕ is no toggle, so it has no pressed state at all.
    await expect(within(card).getAllByRole('button', { pressed: false })).toHaveLength(
      BASEMAPS.length - 1,
    );
  },
};

/** Remembered on the device as Fiord: Fiord is ringed, and the button's title says so. */
export const FiordChosen: Story = {
  args: { initial: BASEMAPS[2] },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: 'Map design' });
    await expect(button).toHaveAttribute('title', 'Map design: Fiord');
    const card = await openCard(canvasElement);
    await expect(within(card).getByRole('button', { name: 'Fiord' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

/** Tab goes round inside the card: ✕ is its first button and Fiord its last, so each wraps to the other. */
export const TabStaysInside: Story = {
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    const close = within(card).getByRole('button', { name: 'Close' });
    const fiord = within(card).getByRole('button', { name: 'Fiord' });
    await userEvent.tab({ shift: true });
    await expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(fiord).toHaveFocus();
    await userEvent.tab();
    await expect(close).toHaveFocus();
  },
};

/** ✕ closes the card, and the keyboard goes back to the button. */
export const CloseButtonCloses: Story = {
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    await userEvent.click(within(card).getByRole('button', { name: 'Close' }));
    const canvas = within(canvasElement);
    // Gone once its leaving has played (map-style.css).
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByRole('button', { name: 'Map design' })).toHaveFocus();
  },
};

/** ✕ starts its leaving: still drawn a moment, taking no taps, then gone. */
export const LeavesThenGoes: Story = {
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    await userEvent.click(within(card).getByRole('button', { name: 'Close' }));
    const leaving = canvasElement.querySelector('[data-testid="basemap-menu"]');
    await expect(leaving).toHaveAttribute('data-closing');
    await expect(leaving).toHaveAttribute('inert');
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-testid="basemap-menu"]')).toBeNull(),
    );
  },
};

/** The button tapped again while the card leaves: it comes back, open. */
export const ReopenWhileLeaving: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = await openCard(canvasElement);
    await userEvent.click(within(card).getByRole('button', { name: 'Close' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Map design' }));
    const again = canvas.getByRole('dialog', { name: 'Map Style' });
    await expect(again).not.toHaveAttribute('data-closing');
    // The keyboard back in the card, on the design shown, as at a first opening.
    await expect(within(again).getByRole('button', { name: 'Monochrome' })).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Map design' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  },
};

/**
 * Matches `(prefers-reduced-motion: reduce)` for one story, as
 * draw-toolbar.stories.tsx fakes a finger: BasemapControl's own question.
 * The stylesheet's `@media` still follows the real setting.
 */
const asStill = () => {
  const real = window.matchMedia;
  window.matchMedia = (query: string) => {
    // Each call answers a fresh list, so changing this one touches nothing else.
    const list = real.call(window, query);
    return query === '(prefers-reduced-motion: reduce)'
      ? Object.defineProperty(list, 'matches', { value: true })
      : list;
  };
  return () => {
    window.matchMedia = real;
  };
};

/** A device asking for no motion: ✕ and the card is gone at once, with no leaving to wait for. */
export const StillUnderReducedMotion: Story = {
  beforeEach: asStill,
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    await userEvent.click(within(card).getByRole('button', { name: 'Close' }));
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull();
  },
};

/** Escape closes the card, and only the card; the keyboard goes back to the button. */
export const EscapeCloses: Story = {
  play: async ({ canvasElement }) => {
    await openCard(canvasElement);
    await userEvent.keyboard('{Escape}');
    const canvas = within(canvasElement);
    // Gone once its leaving has played (map-style.css).
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
    const button = canvas.getByRole('button', { name: 'Map design' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveFocus();
  },
};

/** A tap anywhere else closes it, as a tap on the map closes a card. */
export const TapOutsideCloses: Story = {
  play: async ({ canvasElement }) => {
    await openCard(canvasElement);
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() => expect(within(canvasElement).queryByRole('dialog')).toBeNull());
  },
};

/** The current design picked again: nothing is fetched, and the card stays, still ringed. */
export const SameDesignAgain: Story = {
  play: async ({ canvasElement }) => {
    const card = await openCard(canvasElement);
    const monochrome = within(card).getByRole('button', { name: 'Monochrome' });
    await userEvent.click(monochrome);
    await expect(within(canvasElement).getByRole('dialog')).toBeInTheDocument();
    await expect(monochrome).toHaveAttribute('aria-pressed', 'true');
  },
};

/**
 * On a phone the credits move to the top, open three lines tall: the button
 * is stacked under them by MapLibre at their real height, never on them.
 */
export const UnderAttribution: Story = {
  args: { above: 'attribution' },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: 'Map design' });
    // Read once the map has made its controls, as it does after the first render.
    await waitFor(() => {
      const credits = canvasElement.querySelector('.maplibregl-ctrl-attrib');
      expect(credits).not.toBeNull();
      expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        credits?.getBoundingClientRect().bottom ?? Infinity,
      );
    });
  },
};

/** After a first drag, or in the studio: the credits folded to their ⓘ, the button under it. */
export const UnderFoldedAttribution: Story = {
  args: { above: 'attribution-folded' },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: 'Map design' });
    await waitFor(() => {
      const credits = canvasElement.querySelector('.maplibregl-ctrl-attrib');
      expect(credits).not.toHaveClass('maplibregl-compact-show');
      expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        credits?.getBoundingClientRect().bottom ?? Infinity,
      );
    });
  },
};

/**
 * Open under the open credits on a phone, the lowest the card starts: it
 * ends inside the map, its foot clear of the map's edge, which clips.
 */
export const OpenUnderAttribution: Story = {
  args: { above: 'attribution' },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector('.maplibregl-ctrl-attrib')).not.toBeNull(),
    );
    const card = await openCard(canvasElement);
    const mapFoot = canvasElement.querySelector('.maplibregl-map')?.getBoundingClientRect().bottom;
    await waitFor(() =>
      expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(mapFoot ?? -Infinity),
    );
  },
};

/** A mouse in the studio: MapLibre's +, − and compass above it. */
export const UnderZoom: Story = {
  args: { above: 'zoom' },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: 'Map design' });
    await waitFor(() => {
      const zoom = canvasElement.querySelector('.maplibregl-ctrl-group');
      expect(zoom).not.toBeNull();
      expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        zoom?.getBoundingClientRect().bottom ?? Infinity,
      );
    });
  },
};
