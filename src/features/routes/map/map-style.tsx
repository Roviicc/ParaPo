import { useEffect, useId, useRef } from 'react';

import { IconButton } from '@/design-system/primitives/icon-button';
import { CloseIcon } from '@/shared/ui/route-icons';

import type { Basemap } from './basemap';

import './map-style.css';

interface MapStyleProps {
  /** The designs offered, in order: three on the public map, five in the studio. */
  basemaps: readonly Basemap[];
  /** The design the map shows now, ringed. */
  selectedId: string;
  /** Each design's picture, by its id; a design without one shows a plain tile. */
  thumbnails: Readonly<Record<string, string>>;
  /** How tall it may grow, in px: the room below the button, measured as it opens. Scrolls past it. */
  maxHeight?: number;
  /** Leaving: it shrinks back into the button, and takes no taps or keys meanwhile. */
  isClosing?: boolean;
  onSelect: (basemap: Basemap) => void;
  onClose: () => void;
  /** Its leaving is over, or was cut short: the control lets it go. */
  onClosed: () => void;
}

/**
 * The owner's MapStyle card (4179:10790, 2026-10-16): "Map Style" and ✕
 * over a picture of each design, its name under it, the one shown ringed
 * in Brand/surface (his screenshot of that day; the frame draws no ring).
 * Three a row, so the studio's five wrap onto a second (his answer that
 * day). A pick switches the map behind and moves the ring; the card stays
 * until ✕, Escape or a tap outside, so the viewer sees what they picked.
 *
 * It holds the keyboard while open, as a dialog does (CLAUDE.md): it opens
 * on the design shown, and Tab goes round inside it. It pops in and out
 * like the hintuan pins (map-style.css).
 */
export function MapStyle({
  basemaps,
  selectedId,
  thumbnails,
  maxHeight,
  isClosing = false,
  onSelect,
  onClose,
  onClosed,
}: MapStyleProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // An id of its own, so two cards on one page (a docs page of every story) name themselves.
  const titleId = useId();

  // Let go once its own leaving is over (map-style.css): not the pop, which
  // a close cuts short, nor a child's. Cut short itself (motion turned off
  // midway, the page hidden), it is as good as over, so the card cannot stay
  // stuck. React has no onAnimationCancel, so both are the DOM's.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !isClosing) return;
    const handleLeaveDone = (e: AnimationEvent) => {
      if (e.target === card && e.animationName === 'map-style-leave') onClosed();
    };
    card.addEventListener('animationend', handleLeaveDone);
    card.addEventListener('animationcancel', handleLeaveDone);
    return () => {
      card.removeEventListener('animationend', handleLeaveDone);
      card.removeEventListener('animationcancel', handleLeaveDone);
    };
  }, [isClosing, onClosed]);

  // On each opening, a reopening during the leave too: the keyboard to the
  // design shown, and held in the card. Not while it leaves.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || isClosing) return;
    card.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')];
      const first = buttons.at(0);
      const last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    card.addEventListener('keydown', handleKeyDown);
    return () => card.removeEventListener('keydown', handleKeyDown);
  }, [isClosing]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="basemap-menu"
      data-closing={isClosing || undefined}
      inert={isClosing}
      // Measured at runtime (CLAUDE.md's one use for `style`); the class is the cap without it.
      style={maxHeight === undefined ? undefined : { maxHeight }}
      className="map-style flex max-h-[calc(100dvh-8rem)] flex-col gap-4 overflow-y-auto rounded-2xl bg-surface p-4 font-sn-pro shadow-sm"
    >
      <div className="flex items-center">
        <h2
          id={titleId}
          className="min-w-0 flex-1 text-lg leading-7 font-extrabold text-content-primary"
        >
          Map Style
        </h2>
        {/* Figma's Small, 32 px: under CLAUDE.md's 44 px touch target, kept as drawn by the
            owner's choice (2026-10-16), the card's one exception; Escape and a tap outside
            close it too. */}
        <IconButton
          icon={<CloseIcon />}
          label="Close"
          size="small"
          tooltip="top"
          onClick={onClose}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {basemaps.map((basemap) => (
          <StyleTile
            key={basemap.id}
            basemap={basemap}
            thumbnail={thumbnails[basemap.id]}
            isSelected={basemap.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

interface StyleTileProps {
  basemap: Basemap;
  thumbnail: string | undefined;
  isSelected: boolean;
  onSelect: (basemap: Basemap) => void;
}

/** One design: its 88 px picture and its name, the whole of it one button. */
function StyleTile({ basemap, thumbnail, isSelected, onSelect }: StyleTileProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(basemap)}
      className="group flex flex-col items-center gap-1.5 rounded-2xl outline-none"
    >
      <span
        className={
          'block size-22 overflow-clip rounded-2xl bg-surface-secondary group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-brand-surface ' +
          (isSelected ? 'ring-3 ring-brand-surface' : '')
        }
      >
        {thumbnail && <img src={thumbnail} alt="" className="size-full object-cover" />}
      </span>
      <span className="text-sm leading-5 whitespace-nowrap text-content-primary">
        {basemap.label}
      </span>
    </button>
  );
}
