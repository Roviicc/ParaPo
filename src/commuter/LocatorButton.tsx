import type { ComponentPropsWithoutRef } from 'react'

/**
 * Figma's "Property 1" on LocatorButton (3870:5437), its values verbatim:
 * the camera somewhere else, the camera on the visitor, and the camera on
 * the visitor turned the way the phone faces.
 */
export type LocatorMode = 'TrackOwnLocation' | 'TrackedLocation' | 'TracksTheMapBasedOnCompassFacing'

type Props = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'style' | 'dangerouslySetInnerHTML' | 'type' | 'aria-label'
> & {
  mode: LocatorMode
  /**
   * TrackedLocation's arrow turns the way the phone faces, on the screen
   * (the owner's rule, 3870:5408): degrees clockwise from the screen's up.
   * Null, it points up.
   */
  heading?: number | null
  /** No words on it: what a screen reader says it does. */
  'aria-label': string
}

/**
 * The owner's LocatorButton (3870:5437, 2026-10-01), in WhereAmI's place:
 * a 40 px Special pill showing where the camera is with the visitor —
 * a blue dot when it is elsewhere (TrackOwnLocation), a black arrow when it
 * follows them (TrackedLocation), a blue arrow when it also turns with the
 * phone (TracksTheMapBasedOnCompassFacing). Pressed is
 * InnerShadow/SpecialButtonPressed while touched, nothing else changing,
 * as drawn; no hover is drawn, so none.
 */
export function LocatorButton({ mode, heading = null, 'aria-label': label, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      // No Tooltip here, as IconButton has: a mouse's hover hint is the browser's.
      title={label}
      data-mode={mode}
      className={
        'group relative grid size-10 shrink-0 place-items-center rounded-full bg-surface-tertiary ' +
        'outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [-webkit-tap-highlight-color:transparent]'
      }
    >
      {mode === 'TrackedLocation' ? (
        <NavigationIcon className="size-6 text-content-primary" heading={heading} />
      ) : (
        // The ring: Map/LocatorIndicatorOverlay/surface, 8 around what it holds.
        <span className="grid place-items-center rounded-full bg-map-locator-indicator-overlay-surface/15 p-2">
          {mode === 'TrackOwnLocation' ? (
            // The visitor's dot as the map draws it, small: white, 2 around a 12 px Brand/surface.
            <span className="rounded-full bg-surface p-0.5">
              <span className="block size-3 rounded-full bg-brand-surface" />
            </span>
          ) : (
            <NavigationIcon className="size-4 text-brand-surface" />
          )}
        </span>
      )}
      {/* Figma's shadow lies over what the button holds, so its ring does not hide the inner light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full shadow-special-button-rest group-active:shadow-special-button-pressed"
      />
    </button>
  )
}

/** Figma's `navigation` (3656:1687), its path filled with currentColor. */
function NavigationIcon({ className, heading = null }: { className: string; heading?: number | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className + ' transition-[rotate] duration-200 motion-reduce:transition-none'}
      style={heading === null ? undefined : { rotate: `${heading}deg` }}
    >
      <path d="M12.0001 1.53516C11.1042 1.53514 10.5331 2.19076 10.1081 2.89559C9.67761 3.60963 9.23548 4.65184 8.68897 5.94021L5.5662 13.2996C4.85417 14.9779 4.29402 16.2983 4.00081 17.2841C3.85276 17.7819 3.75435 18.2512 3.75791 18.6708C3.76165 19.1043 3.87589 19.5455 4.2121 19.8934C4.33984 20.0255 4.48387 20.1411 4.64066 20.2371C5.05328 20.4898 5.50977 20.5054 5.93385 20.4148C6.34389 20.327 6.77964 20.1297 7.23307 19.8772C8.12944 19.3781 9.29314 18.5469 10.7716 17.4908L10.8226 17.4543C11.2011 17.184 11.4411 17.0144 11.6361 16.9032C11.8168 16.8003 11.9012 16.7828 11.9563 16.7795C11.9853 16.7777 12.0149 16.7777 12.0438 16.7795C12.099 16.7828 12.1833 16.8003 12.3641 16.9033C12.5591 17.0144 12.7992 17.1841 13.1776 17.4543L13.2283 17.4906C14.7069 18.5467 15.8707 19.378 16.7671 19.8772C17.2206 20.1297 17.6563 20.327 18.0663 20.4148C18.4904 20.5054 18.9469 20.4898 19.3595 20.2371C19.5163 20.1411 19.6604 20.0255 19.7881 19.8934C20.1243 19.5455 20.2385 19.1043 20.2423 18.6709C20.2458 18.2513 20.1481 17.7824 20 17.2848C19.7078 16.3021 19.1498 14.9867 18.4409 13.3159L15.3164 5.95136C14.7677 4.65802 14.3238 3.61165 13.8921 2.89558C13.4671 2.19075 12.896 1.53511 12.0001 1.53516Z" />
    </svg>
  )
}
