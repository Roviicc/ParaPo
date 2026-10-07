/**
 * The pill at the top left while nothing is open: how many routes and
 * hotspots are saved, and the account — who is signed in, with Password and
 * Sign out, or Sign in. Split from StudioApp.tsx, 2026-09-29. On a phone it
 * keeps only its buttons, finger-sized, below the notch.
 */
export function AccountPill({
  routes,
  hotspots,
  email,
  onSignIn,
  onPassword,
  onSignOut,
}: {
  routes: number;
  hotspots: number;
  /** Signed in as; null when signed out. */
  email: string | null;
  onSignIn: () => void;
  onPassword: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-[calc(1rem+env(safe-area-inset-left))] z-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs text-neutral-600 shadow ring-1 ring-black/5 backdrop-blur pointer-coarse:gap-1 pointer-coarse:py-0">
      {routes > 0 && (
        <span className="text-neutral-500 max-sm:hidden">
          {routes} {routes === 1 ? 'route' : 'routes'}
          {hotspots > 0 && (
            <>
              {' '}
              · {hotspots} {hotspots === 1 ? 'hotspot' : 'hotspots'}
            </>
          )}{' '}
          ·
        </span>
      )}
      {email !== null ? (
        <>
          <span className="max-w-[16ch] truncate max-sm:hidden">{email}</span>
          <button
            type="button"
            onClick={onPassword}
            className="font-medium text-neutral-900 underline underline-offset-2 pointer-coarse:min-h-11 pointer-coarse:px-2"
          >
            Password
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="font-medium text-neutral-900 underline underline-offset-2 pointer-coarse:min-h-11 pointer-coarse:px-2"
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onSignIn}
          className="font-medium text-neutral-900 underline underline-offset-2 pointer-coarse:min-h-11 pointer-coarse:px-2"
        >
          Sign in
        </button>
      )}
    </div>
  );
}
