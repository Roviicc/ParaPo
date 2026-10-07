/**
 * PalimosPoDesignSystem's Tooltip, from the owner's Figma set of 2026-09-28
 * (node 3745:1213): a dark pill of SN Pro Regular 14/20 in Content/inverse on
 * Components/Tooltip/surface, with an arrow. Figma's Position names the side
 * the arrow is on — Bottom points down at a control below, so the bubble
 * sits above it.
 *
 * This is the bubble only. Whoever owns the control places it and decides
 * when it shows; the owner's rules (2026-09-28): on hover only, never on
 * phones, after delay/tooltip.
 */

type Position = 'bottom' | 'top' | 'left' | 'right';

interface Props {
  position?: Position;
  /** Figma's text layer, "Tooltip": one line, never wraps. */
  label: string;
}

// The arrow is Figma's own path, 14.7×13, pointing up as drawn. It sticks
// out 7px and tucks the other 6px under the pill (Figma: -8px on a 14px
// frame, 1px of it empty). Sideways it turns, so its 13px depth lies along
// x: -ml-1.75 is that 7px out, give or take the 0.15px Tailwind's scale
// rounds away.
const ARROW = {
  bottom: 'top-full -mt-1.5 left-1/2 -translate-x-1/2 rotate-180',
  top: 'bottom-full -mb-1.5 left-1/2 -translate-x-1/2',
  left: 'right-full -mr-1.75 top-1/2 -translate-y-1/2 -rotate-90',
  right: 'left-full -ml-1.75 top-1/2 -translate-y-1/2 rotate-90',
} satisfies Record<Position, string>;

export function Tooltip({ position = 'bottom', label }: Props) {
  return (
    <span
      role="tooltip"
      className="relative inline-flex rounded-md bg-components-tooltip-surface px-2 py-0.5 font-sn-pro text-sm/5 font-normal whitespace-nowrap text-content-inverse"
    >
      <svg
        aria-hidden
        viewBox="0 0 14.7047 13"
        className={
          'absolute h-[13px] w-[14.7047px] text-components-tooltip-surface ' + ARROW[position]
        }
      >
        <path
          fill="currentColor"
          d="M6.48632 0.5C6.87122 -0.166666 7.83347 -0.166667 8.21837 0.499999L14.5692 11.5C14.9541 12.1667 14.473 13 13.7032 13H1.00149C0.231692 13 -0.249434 12.1667 0.135466 11.5L6.48632 0.5Z"
        />
      </svg>
      {label}
    </span>
  );
}
