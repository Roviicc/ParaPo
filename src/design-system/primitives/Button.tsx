import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * PalimosPoDesignSystem's Button, from the owner's Figma set of 2026-09-28
 * (node 3668:2812): a pill in three voices. Special is the jeepney one —
 * Cubao Free on the quiet surface with an edge and a soft shadow; Primary
 * speaks brand blue and Error the destructive red, both in SN Pro Medium.
 * Hover is drawn identical to Default in the set, so no hover style here;
 * Pressed darkens (and Special loses its edge); Disabled is the design's
 * opacity/60. No focus state is designed yet, so the browser's own focus
 * ring stands until the owner draws one.
 */

type Size = 'base' | 'small'

/**
 * Small exists only for Special in the set — the types keep code from
 * getting ahead of the design: `size="small"` on primary or error is a
 * compile error until the owner designs it.
 */
type VariantAndSize =
  | { variant: 'special'; size?: Size }
  | { variant: 'primary' | 'error'; size?: 'base' }

type Props = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'style' | 'dangerouslySetInnerHTML'
> &
  VariantAndSize & {
    /** Figma's ✏️ Label: the button is its text; icons decorate it. */
    label: string
    /** Figma's 🎈 First/Last Icon slots: a square SVG drawing in currentColor. */
    firstIcon?: ReactNode
    lastIcon?: ReactNode
  }

const VARIANT = {
  special:
    'border border-border-secondary bg-surface-tertiary font-cubao text-content-primary shadow-sm ' +
    'active:border-transparent active:bg-surface-quaternary active:shadow-none',
  primary: 'bg-brand-surface font-sn-pro font-medium text-content-inverse active:bg-brand-surface-secondary',
  error: 'bg-error-surface font-sn-pro font-medium text-content-inverse active:bg-error-surface-secondary',
} satisfies Record<Props['variant'], string>

// Small carries the set's font/weight/medium; Cubao has one cut, so on
// Special that renders as its regular rather than a faked bold.
const SIZE = {
  base: 'gap-1 px-4 py-2 text-base/6',
  small: 'gap-1 px-3 py-1.5 text-sm/5 font-medium',
} satisfies Record<Size, string>

const ICON = {
  base: 'size-5',
  small: 'size-4',
} satisfies Record<Size, string>

export function Button({ variant, size = 'base', label, firstIcon, lastIcon, type = 'button', ...rest }: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={
        'inline-flex items-center justify-center rounded-full disabled:opacity-60 ' +
        VARIANT[variant] +
        ' ' +
        SIZE[size]
      }
    >
      {/* The label is the accessible name; icons only decorate it. */}
      {firstIcon && (
        <span aria-hidden className={ICON[size] + ' *:size-full'}>
          {firstIcon}
        </span>
      )}
      {label}
      {lastIcon && (
        <span aria-hidden className={ICON[size] + ' *:size-full'}>
          {lastIcon}
        </span>
      )}
    </button>
  )
}
