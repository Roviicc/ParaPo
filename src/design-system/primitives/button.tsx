import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * PalimosPoDesignSystem's Button, from the owner's Figma set of 2026-09-28
 * (node 3668:2812): a pill in three voices. Special is the jeepney one —
 * SN Pro Bold on the quiet surface with an edge and a soft shadow (Cubao
 * Free in the set, all capitals; SN Pro since the owner's "Papunta at
 * Pabalik", 2026-10-01, so its word reads as written); Primary
 * speaks brand blue and Error the destructive red, both in SN Pro Medium.
 * Each state wears the set's effect style of the same name (tokens.css):
 * Rest, Hover (drawn 2026-09-28 — until then it matched Default), Pressed
 * (which also darkens the fill, and Special loses its edge). Error borrows
 * Primary's shadows, as the set does. Hover and press are `enabled:` only,
 * so a disabled button keeps its Rest look at the design's opacity/60.
 * Tailwind puts hover behind `(hover: hover)`, so phones never stick on it.
 * No focus state is designed yet, so the browser's own focus ring stands
 * until the owner draws one.
 */

type Size = 'base' | 'small';

/**
 * Small exists only for Special in the set — the types keep code from
 * getting ahead of the design: `size="small"` on primary or error is a
 * compile error until the owner designs it.
 */
type VariantAndSize =
  { variant: 'special'; size?: Size } | { variant: 'primary' | 'error'; size?: 'base' };

type Props = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'style' | 'dangerouslySetInnerHTML'
> &
  VariantAndSize & {
    /** Figma's ✏️ Label: the button is its text; icons decorate it. */
    label: string;
    /** Figma's 🎈 First/Last Icon slots: a square SVG drawing in currentColor. */
    firstIcon?: ReactNode;
    lastIcon?: ReactNode;
  };

const VARIANT = {
  special:
    'bg-surface-tertiary font-sn-pro font-bold text-content-primary shadow-special-button-rest ' +
    'enabled:hover:shadow-special-button-hover ' +
    'enabled:active:bg-surface-quaternary enabled:active:shadow-special-button-pressed',
  primary:
    'bg-brand-surface font-sn-pro font-medium text-content-inverse shadow-primary-button-rest ' +
    'enabled:hover:shadow-primary-button-hover ' +
    'enabled:active:bg-brand-surface-secondary enabled:active:shadow-primary-button-pressed',
  error:
    'bg-error-surface font-sn-pro font-medium text-content-inverse shadow-primary-button-rest ' +
    'enabled:hover:shadow-primary-button-hover ' +
    'enabled:active:bg-error-surface-secondary enabled:active:shadow-primary-button-pressed',
} satisfies Record<Props['variant'], string>;

// The weight is each voice's own (VARIANT): Small is only Special's, bold.
const SIZE = {
  base: 'gap-1 px-4 py-2 text-base/6',
  small: 'gap-1 px-3 py-1.5 text-sm/5',
} satisfies Record<Size, string>;

const ICON = {
  base: 'size-5',
  small: 'size-4',
} satisfies Record<Size, string>;

export function Button({
  variant,
  size = 'base',
  label,
  firstIcon,
  lastIcon,
  type = 'button',
  ...rest
}: Props) {
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
  );
}
