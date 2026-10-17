import type { ComponentProps } from 'react';

/** A plain button for this page: a border, and an outline when focused. */
export function PageButton({ className = '', ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`rounded border-2 border-current px-4 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      {...rest}
    />
  );
}
