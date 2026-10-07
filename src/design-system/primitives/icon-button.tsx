import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Tooltip } from './tooltip'

/**
 * PalimosPoDesignSystem's IconButton, from the owner's Figma set of
 * 2026-09-28 (node 3668:2815): Button's Special voice with the words taken
 * out — a round pill holding one icon, on the same surfaces and the same
 * InnerShadow/SpecialButton… effect styles, state for state (see Button).
 * Special is the only variant the set draws, so it is the only one here.
 *
 * With no words on it, its label shows as the owner's Tooltip on hover —
 * every IconButton, so none can forget it, a disabled one too (his yes of
 * the same day: it still says what the button is). His rules of that day: on
 * hover only, never on phones (Tailwind's hover waits for a pointer that
 * can hover), after delay/tooltip; it arrives over duration/base with
 * ease/enter, rising 4px off the button, and leaves over duration/quick
 * with ease/exit.
 */

type Size = 'base' | 'small'

/** Tooltip's Position: the side its arrow is on, so Bottom sits above the button. */
type TooltipPosition = 'bottom' | 'top' | 'left' | 'right'

// No `title` either: the owner's Tooltip replaces the browser's, and both
// at once would show two bubbles, perhaps saying different things.
type Props = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'style' | 'dangerouslySetInnerHTML' | 'aria-label' | 'aria-labelledby' | 'title'
> & {
  variant?: 'special'
  size?: Size
  /** Figma's 🙏 Icon Instance: a square SVG drawing in currentColor. */
  icon: ReactNode
  /**
   * Not in the Figma set — added with the owner's yes (2026-09-28): with no
   * words on it, this is what a screen reader says the button does, and
   * what its tooltip reads.
   */
  label: string
  /**
   * Where the tooltip points from, as the Tooltip set names it. The screen
   * picks (the owner's call): a control at the bottom of the map wants the
   * bubble above it, Bottom; one along a card's top edge wants it below, Top.
   */
  tooltip?: TooltipPosition
}

const VARIANT = {
  special:
    'bg-surface-tertiary text-content-primary shadow-special-button-rest ' +
    'enabled:hover:shadow-special-button-hover ' +
    'enabled:active:bg-surface-quaternary enabled:active:shadow-special-button-pressed',
} satisfies Record<NonNullable<Props['variant']>, string>

// Base is 40px round (8px around a 24px icon); Small 32px (6px around 20px).
// The size is pinned as well as padded: in a flex column (the map's stack of
// round controls) a padded-only Small stretched to its wider sibling and went
// oval — the specimen story caught it on 2026-09-28.
const SIZE = {
  base: 'size-10 p-2',
  small: 'size-8 p-1.5',
} satisfies Record<Size, string>

const ICON = {
  base: 'size-6',
  small: 'size-5',
} satisfies Record<Size, string>

// The bubble beside the button, its arrow's tip 4px off it (the arrow
// sticks out 7px, so 11px from the pill), and where it rises from: 4px
// nearer the button, settling away from it.
const TOOLTIP = {
  bottom: 'bottom-full mb-2.75 left-1/2 -translate-x-1/2 translate-y-1',
  top: 'top-full mt-2.75 left-1/2 -translate-x-1/2 -translate-y-1',
  left: 'left-full ml-2.75 top-1/2 -translate-y-1/2 -translate-x-1',
  right: 'right-full mr-2.75 top-1/2 -translate-y-1/2 translate-x-1',
} satisfies Record<TooltipPosition, string>

// Shown: settled, over the enter timing. Written out whole for Tailwind.
const SHOWN = {
  bottom: 'group-hover/icon:translate-y-0',
  top: 'group-hover/icon:translate-y-0',
  left: 'group-hover/icon:translate-x-0',
  right: 'group-hover/icon:translate-x-0',
} satisfies Record<TooltipPosition, string>

export function IconButton({
  variant = 'special',
  size = 'base',
  icon,
  label,
  tooltip = 'bottom',
  type = 'button',
  ...rest
}: Props) {
  return (
    // size-fit: a stretching parent widens nothing, so the bubble stays
    // centred on the button.
    <span className="group/icon relative inline-flex size-fit shrink-0">
      <button
        {...rest}
        type={type}
        aria-label={label}
        className={
          'inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-60 ' +
          VARIANT[variant] +
          ' ' +
          SIZE[size]
        }
      >
        <span aria-hidden className={ICON[size] + ' *:size-full'}>
          {icon}
        </span>
      </button>
      {/* The label again, for eyes: the button already says it to a screen reader. */}
      <span
        aria-hidden
        className={
          'pointer-events-none absolute z-20 opacity-0 transition-[opacity,translate] duration-quick ease-exit ' +
          'group-hover/icon:opacity-100 group-hover/icon:delay-tooltip group-hover/icon:duration-base group-hover/icon:ease-enter ' +
          TOOLTIP[tooltip] +
          ' ' +
          SHOWN[tooltip]
        }
      >
        <Tooltip position={tooltip} label={label} />
      </span>
    </span>
  )
}
