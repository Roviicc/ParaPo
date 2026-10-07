import type { ComponentPropsWithoutRef } from 'react'

/**
 * Figma's "Property 1" on LocatorButton (3870:5437), its values verbatim:
 * no location yet (LocationOff, the owner's of 2026-10-01: a tap asks for
 * it), the camera somewhere else, the camera on the visitor, and the camera
 * on the visitor turned the way the phone faces.
 */
export type LocatorMode = 'LocationOff' | 'TrackOwnLocation' | 'TrackedLocation' | 'TracksTheMapBasedOnCompassFacing'

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
 * a 48 px Special pill (40 until the owner's change later that day) showing
 * where the camera is with the visitor —
 * a struck-through compass while there is no location (LocationOff),
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
        'group relative grid size-12 shrink-0 place-items-center rounded-full bg-surface-tertiary ' +
        'outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [-webkit-tap-highlight-color:transparent]'
      }
    >
      {mode === 'LocationOff' ? (
        <NavigationOffIcon />
      ) : mode === 'TrackedLocation' ? (
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

/** Figma's `navigation-off` (3872:6014), 28 px in 6 around, in Content/tertiary (the owner's new colour, 2026-10-01, 3870:5437; Content/disabled before). */
function NavigationOffIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="currentColor" aria-hidden className="size-7 text-content-tertiary">
      <path d="M10.0592 25.0378C10.2038 24.4763 10.7771 24.1379 11.3386 24.2824C12.1861 24.5004 13.0753 24.6173 13.9932 24.6173C14.9113 24.6173 15.8005 24.5004 16.6479 24.2824C17.2093 24.1379 17.7815 24.4765 17.9262 25.0378C18.0707 25.5993 17.7334 26.1726 17.172 26.3172C16.1551 26.5789 15.0895 26.7171 13.9932 26.7171C12.8971 26.7171 11.8315 26.5789 10.8145 26.3172C10.2531 26.1726 9.91469 25.5993 10.0592 25.0378Z" />
      <path d="M13.9933 1.28288C15.0894 1.28288 16.155 1.42216 17.172 1.68392C17.7333 1.82858 18.0706 2.40082 17.9262 2.96224C17.7816 3.52383 17.2095 3.86216 16.6479 3.71761C15.8006 3.49955 14.9113 3.38379 13.9933 3.38379C13.0753 3.38379 12.186 3.49955 11.3386 3.71761C10.777 3.86215 10.2037 3.52384 10.0592 2.96224C9.91496 2.40089 10.2533 1.82854 10.8145 1.68392C11.8316 1.42216 12.8972 1.28288 13.9933 1.28288Z" />
      <path d="M2.47355 16.1123C3.03207 15.9569 3.61111 16.2841 3.76668 16.8426C4.00151 17.6855 4.34561 18.5142 4.80461 19.3092C5.26358 20.1041 5.80882 20.8161 6.42131 21.4409C6.82726 21.855 6.82056 22.5194 6.40649 22.9254C5.9924 23.3314 5.32792 23.3247 4.92196 22.9106C4.18682 22.1607 3.53315 21.3078 2.98511 20.3585C2.43714 19.4093 2.02503 18.417 1.74325 17.4054C1.58789 16.8469 1.91504 16.2678 2.47355 16.1123Z" />
      <path d="M21.5891 5.07454C22.0032 4.66865 22.6677 4.67533 23.0737 5.08936C23.717 5.74545 24.2976 6.48012 24.7997 7.28939L25.0105 7.64144L25.2087 7.99919C25.6587 8.83893 26.0058 9.70928 26.2524 10.5946C26.4078 11.1531 26.0806 11.7321 25.5221 11.8877C24.9635 12.0431 24.3845 11.7159 24.2289 11.1574C23.9941 10.3146 23.6499 9.48572 23.191 8.69075C22.7318 7.89557 22.1869 7.18387 21.5743 6.55908C21.1684 6.14501 21.1751 5.48051 21.5891 5.07454Z" />
      <path d="M24.2289 16.8426C24.3845 16.2841 24.9636 15.957 25.5221 16.1123C26.0805 16.2679 26.4077 16.847 26.2524 17.4054C25.9705 18.4171 25.5574 19.4093 25.0094 20.3586C24.4613 21.3078 23.8087 22.1608 23.0737 22.9106C22.6677 23.3248 22.0032 23.3314 21.5891 22.9255C21.1751 22.5195 21.1684 21.855 21.5743 21.4409C22.1868 20.8161 22.7321 20.1041 23.191 19.3092C23.6499 18.5143 23.994 17.6856 24.2289 16.8426Z" />
      <path d="M4.92196 5.08936C5.32792 4.6753 5.99241 4.66864 6.4065 5.07454C6.82056 5.4805 6.82722 6.14499 6.42131 6.55908C5.80869 7.18393 5.26365 7.89681 4.80461 8.69189C4.34572 9.48678 4.00147 10.3147 3.76669 11.1574C3.61111 11.7159 3.03207 12.0431 2.47356 11.8877C1.91504 11.7321 1.58786 11.1531 1.74325 10.5946C2.02503 9.58302 2.43713 8.59064 2.98511 7.64144C3.53317 6.69218 4.18679 5.83922 4.92196 5.08936Z" />
      <path d="M8.76732 9.82444C8.95424 9.63751 9.25722 9.63751 9.44414 9.82444L17.8203 18.2006C18.0072 18.3875 18.0072 18.6905 17.8203 18.8774C17.6334 19.0643 17.3304 19.0643 17.1435 18.8774L8.76732 10.5013C8.5804 10.3143 8.5804 10.0114 8.76732 9.82444Z" />
      <path d="M15.5028 16.5595L14.6671 18.5904C14.5608 18.8486 14.3092 19.0172 14.03 19.0172C13.714 19.0171 13.4383 18.8021 13.3616 18.4956L12.5189 15.125L9.14923 14.2827C8.84251 14.2061 8.62713 13.9305 8.62713 13.6143C8.62716 13.3352 8.79576 13.0835 9.05388 12.9772L11.0843 12.141L15.5028 16.5595Z" />
      <path d="M17.2014 9.68424C17.6204 9.68424 17.9601 10.0239 17.9601 10.4429C17.9601 10.5419 17.9408 10.6401 17.9031 10.7317L15.996 15.3615L12.2823 11.6479L16.9126 9.74127C17.0042 9.70355 17.1024 9.68425 17.2014 9.68424Z" />
    </svg>
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
