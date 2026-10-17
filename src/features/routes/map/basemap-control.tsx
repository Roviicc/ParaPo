import type { IControl, MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '@/design-system/primitives/icon-button';

import { applyBasemap, rememberBasemap, type Basemap } from './basemap';
import { MapStyle } from './map-style';

/** The public map's round 48 px button, or Figma's 40 px IconButton at 16 px from the corner. */
export type MapButtonStyle = 'round' | 'icon-button';

export const CORNER_MARGIN = {
  round: 'mt-2.5 mr-2.5',
  'icon-button': 'mt-4 mr-4',
} satisfies Record<MapButtonStyle, string>;

interface BasemapControlProps {
  map: MapLibreMap;
  /** The designs the card offers, in order. */
  basemaps: readonly Basemap[];
  /** Each design's picture on the card, by its id. */
  thumbnails: Readonly<Record<string, string>>;
  /** The design the map was built with. */
  initial: Basemap;
  /** Which button opens the card. */
  buttonStyle?: MapButtonStyle;
}

/** Between the button and the card (gap-2), and kept clear under the card, as the corner's margin. */
const CARD_GAP_PX = 8;
const CARD_FOOT_PX = 10;

/** Closing is the card on its way out, still drawn while its leaving plays. */
type CardState = 'closed' | 'open' | 'closing';

/**
 * Where a close goes: the card plays its leaving (map-style.css) before it
 * goes, unless the device asks for no motion; then at once, as there is no
 * animation to wait for.
 */
const afterClose = (): CardState =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'closed' : 'closing';

/**
 * The button as one of MapLibre's own top-right controls, so MapLibre stacks
 * it under whatever is above it there, at its real height: the credits on a
 * phone, three lines tall once ⓘ opens them, until a drag folds them,
 * MapLibre's +, − and compass for a mouse in the studio, or nothing on the
 * public map's desktop, where it takes the corner. The corner keeps inside
 * the safe area itself (global.css). React draws into it, as the hintuan pins
 * do into their markers.
 */
export function useTopRightControl(map: MapLibreMap, margin = CORNER_MARGIN.round): HTMLElement {
  const [element] = useState(() => {
    const div = document.createElement('div');
    // Placed as MapLibre places a .maplibregl-ctrl in the corner, without
    // the class: its button rules (a grey hover) would paint over ours.
    div.className = `pointer-events-auto float-right clear-both ${margin}`;
    return div;
  });
  useEffect(() => {
    const control: IControl = { onAdd: () => element, onRemove: () => element.remove() };
    map.addControl(control, 'top-right');
    return () => {
      // Gone with the map already, when the map goes first.
      if (map.hasControl(control)) map.removeControl(control);
    };
  }, [map, element]);
  return element;
}

/**
 * The "MayLayers or Theme" button (Figma 4176:10679) at the top right, and
 * under it the Map Style card (MapStyle) for the designs. It draws nothing on
 * the map itself — `applyBasemap` does the switch and carries the routes and
 * hotspots across — so both pages get it from MapView for free.
 */
export function BasemapControl({
  map,
  basemaps,
  thumbnails,
  initial,
  buttonStyle = 'round',
}: BasemapControlProps) {
  const corner = useTopRightControl(map, CORNER_MARGIN[buttonStyle]);
  const [current, setCurrent] = useState<Basemap>(initial);
  const [card, setCard] = useState<CardState>('closed');
  const [cardRoom, setCardRoom] = useState<number | undefined>(undefined);
  const isOpen = card === 'open';
  const rootRef = useRef<HTMLDivElement>(null);
  // The button that opens the card is the first in the root, whichever look it has.
  const toggleButton = () => rootRef.current?.querySelector('button') ?? null;

  // The keyboard goes back where it was: on the button that opened the card.
  const close = () => {
    setCard(afterClose());
    toggleButton()?.focus();
  };

  // The card may grow down to the map's foot and no further: the map clips
  // what is past it (MapLibre's overflow), and the button sits as low as the
  // corner stacks it, under the open credits on a phone. Read as it opens.
  const open = () => {
    const button = toggleButton()?.getBoundingClientRect();
    const mapFoot = map.getContainer().getBoundingClientRect().bottom;
    setCardRoom(button ? mapFoot - button.bottom - CARD_GAP_PX - CARD_FOOT_PX : undefined);
    setCard('open');
  };

  // A tap anywhere else closes the card, as a tap on the map closes a card.
  // Focus stays where the tap put it.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target)) return;
      setCard(afterClose());
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Escape closes the card, as it closes a card (useEscape), and only the
  // card: heard first, on the way down, so the card under it stays open.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setCard(afterClose());
      toggleButton()?.focus();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const handleSelect = (b: Basemap) => {
    if (b.id === current.id) return;
    setCurrent(b);
    rememberBasemap(b);
    applyBasemap(map, b);
  };

  return createPortal(
    <div ref={rootRef} className="flex flex-col items-end gap-2">
      {buttonStyle === 'icon-button' ? (
        <IconButton
          tooltip="left"
          label="Map design"
          icon={<MapTypeIcon />}
          onClick={() => (isOpen ? close() : open())}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          data-testid="basemap"
        />
      ) : (
        <button
          type="button"
          onClick={() => (isOpen ? close() : open())}
          aria-label="Map design"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          title={`Map design: ${current.label}`}
          data-testid="basemap"
          className={
            'group relative grid size-12 shrink-0 place-items-center rounded-full bg-surface-tertiary text-content-primary ' +
            'outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-brand-surface'
          }
        >
          <MapTypeIcon />
          {/* Figma's shadow lies over what the button holds, as on the LocatorButton. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-special-button-rest group-active:shadow-special-button-pressed"
          />
        </button>
      )}
      {card !== 'closed' && (
        <MapStyle
          basemaps={basemaps}
          selectedId={current.id}
          thumbnails={thumbnails}
          maxHeight={cardRoom}
          onSelect={handleSelect}
          isClosing={card === 'closing'}
          onClose={close}
          onClosed={() => setCard('closed')}
        />
      )}
    </div>,
    corner,
  );
}

/**
 * Figma's `map-type` (3751:1922), drawn a size smaller inside its 24 box: a
 * folded map, 28 px in 10 around, in currentColor.
 */
function MapTypeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-7">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.80233 4.08155C7.80233 3.7921 7.80233 3.64738 7.69995 3.56777C7.68815 3.5586 7.67226 3.54842 7.65898 3.54157C7.54378 3.482 7.42232 3.5381 7.17938 3.6503C6.77214 3.83838 6.30381 4.11006 5.73198 4.4418L4.59327 5.10237C4.17963 5.34231 3.82776 5.5464 3.55237 5.74527C3.25866 5.95735 3.00995 6.19199 2.82696 6.5132C2.6444 6.83365 2.56829 7.16826 2.5331 7.53085C2.49997 7.87229 2.49999 8.28441 2.5 8.77148V16.0525C2.49999 16.6968 2.49998 17.2296 2.541 17.6463C2.58242 18.067 2.67388 18.4897 2.94922 18.8313C3.24941 19.2038 3.67259 19.4569 4.14393 19.5411C4.5797 19.6188 4.99271 19.4881 5.37342 19.3162C5.74981 19.1463 6.2551 18.8532 6.80215 18.5358C7.05235 18.3907 7.27616 18.2608 7.48499 18.1529C7.64498 18.0702 7.72497 18.0289 7.76365 17.9654C7.80233 17.9019 7.80233 17.8183 7.80233 17.6512V4.08155ZM9.12791 17.5374C9.12791 17.7165 9.12791 17.806 9.17006 17.8716C9.21221 17.937 9.2998 17.977 9.47499 18.0568C9.67053 18.1459 9.91866 18.2678 10.2535 18.4343L13.6239 20.1102C13.7933 20.1945 13.9884 20.0713 13.9884 19.882V5.95717C13.9884 5.79735 13.9884 5.71745 13.9486 5.65329C13.9088 5.58913 13.8373 5.55355 13.6942 5.4824L11.2423 4.26322C10.6512 3.96925 10.1667 3.72842 9.74856 3.56707C9.49047 3.46749 9.36143 3.4177 9.2476 3.49239C9.24479 3.49424 9.2413 3.49663 9.23857 3.49858C9.12791 3.57791 9.12791 3.72725 9.12791 4.02593V17.5374ZM15.4654 6.03563C15.3818 6.03563 15.314 6.10327 15.314 6.18681V20.4467C15.314 20.5002 15.3573 20.5436 15.4107 20.5436H17.3491C18.1424 20.5436 18.8054 20.5436 19.3319 20.4712C19.8894 20.3947 20.3914 20.226 20.7933 19.8151C21.1932 19.4064 21.3556 18.8992 21.4297 18.3365C21.5001 17.8011 21.5 17.126 21.5 16.3131V10.2661C21.5 9.45308 21.5001 8.77803 21.4297 8.24272C21.3556 7.67991 21.1932 7.17275 20.7933 6.764C20.3914 6.35324 19.8894 6.18455 19.3319 6.10794C18.8054 6.03558 18.1424 6.0356 17.3491 6.03563H15.4654Z"
      />
    </svg>
  );
}
