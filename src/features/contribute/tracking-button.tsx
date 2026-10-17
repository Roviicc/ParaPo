import type { ComponentPropsWithoutRef } from 'react';

import {
  BLOB_PLACE,
  CARD_BLOB,
  CARD_SHADOW,
  CARD_SHADOW_SELECTED,
  CARD_SURFACE,
} from '@/features/routes/cards/livery-card';
import { cn } from '@/shared/utils/cn';

import { PauseIcon, PlayIcon } from './tracking-icons';

/**
 * Which bar. Papunta and Pabalik are the way button, named for the way a tap
 * switches TO: Pabalik (orange) while the ride is on papunta, Papunta (blue)
 * while it is on pabalik.
 */
export type TrackingVariant =
  'start' | 'resume' | 'stop' | 'save' | 'cancel' | 'papunta' | 'pabalik';

interface Look {
  text: string;
  /** What a screen reader says; it always contains the words on the bar. */
  name: string;
  surface: string;
  icon: 'play' | 'pause' | null;
  /** A full-width bar, or one of the row's buttons. */
  size: 'bar' | 'row';
  /** In the row, Pabalik and Save share the width and Cancel shrinks to its text. */
  width: 'w-full' | 'flex-1' | 'shrink-0';
}

// Figma names this green "card/green-(don't-add)": the owner does not want green
// added as a route livery, so the bars take Tailwind's green-700 and green-800
// directly and there is no card-green token.
const GREEN = 'bg-green-700 border-green-800';

const LOOK = {
  start: {
    text: 'Start',
    name: 'Start recording',
    surface: GREEN,
    icon: 'play',
    size: 'bar',
    width: 'w-full',
  },
  resume: {
    text: 'Resume',
    name: 'Resume',
    surface: GREEN,
    icon: 'play',
    size: 'bar',
    width: 'w-full',
  },
  stop: {
    text: 'Stop',
    name: 'Stop',
    surface: CARD_SURFACE.red,
    icon: 'pause',
    size: 'bar',
    width: 'w-full',
  },
  save: {
    text: 'Save',
    name: 'Save',
    surface: CARD_SURFACE.violet,
    icon: null,
    size: 'row',
    width: 'flex-1',
  },
  cancel: {
    text: 'Cancel',
    name: 'Cancel',
    surface: CARD_SURFACE.red,
    icon: null,
    size: 'row',
    width: 'shrink-0',
  },
  pabalik: {
    text: 'Pabalik',
    name: 'Switch to Pabalik',
    surface: CARD_SURFACE.orange,
    icon: null,
    size: 'row',
    width: 'flex-1',
  },
  papunta: {
    text: 'Papunta',
    name: 'Switch to Papunta',
    surface: 'bg-brand-surface border-brand-border',
    icon: null,
    size: 'row',
    width: 'flex-1',
  },
} satisfies Record<TrackingVariant, Look>;

const SIZE = {
  bar: 'gap-1.5 p-3.5',
  row: 'px-3.5 py-3',
} satisfies Record<Look['size'], string>;

interface TrackingButtonProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'style' | 'aria-label' | 'dangerouslySetInnerHTML'
> {
  variant: TrackingVariant;
  /** Pressed in, as Figma draws the Stop bar while the ride is being recorded. */
  isActive?: boolean;
}

/**
 * Figma's TrackingButtonPrimary: a square bar in a RouteCard's colours, its
 * Route/RouteCardPrimary effect and gloss Blob, which press in under
 * RouteCardPrimarySelected. Start, Resume and Stop are full-width bars; Save,
 * Cancel and the way button sit in a row under them.
 */
export function TrackingButton({
  variant,
  isActive = false,
  type = 'button',
  ...rest
}: TrackingButtonProps) {
  const look = LOOK[variant];
  const shadow = isActive
    ? CARD_SHADOW_SELECTED.red
    : cn(CARD_SHADOW.red, 'group-active:shadow-route-card-primary-selected');
  return (
    <button
      {...rest}
      type={type}
      aria-label={look.name}
      className={cn(
        // A white ring inside the bar: the browser's own is nearly invisible on orange and red.
        'group relative isolate flex items-center justify-center overflow-clip border-[0.6px] font-sn-pro text-lg/7 font-bold text-content-inverse focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-content-inverse',
        look.surface,
        look.width,
        SIZE[look.size],
      )}
    >
      <img src={CARD_BLOB.red.src} alt="" aria-hidden className={BLOB_PLACE} />
      {look.icon && (
        <span aria-hidden className="size-6 shrink-0 *:size-full">
          {look.icon === 'play' ? <PlayIcon /> : <PauseIcon />}
        </span>
      )}
      {look.text}
      <span aria-hidden className={cn('pointer-events-none absolute inset-0', shadow)} />
    </button>
  );
}
