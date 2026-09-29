/**
 * The pill at the top left while nothing is open: how many routes and
 * hotspots are saved, and the account — who is signed in, with Password and
 * Sign out, or Sign in.
 */
export function AccountPill({
  routes,
  hotspots,
  email,
  onSignIn,
  onPassword,
  onSignOut,
}: {
  routes: number
  hotspots: number
  /** Signed in as; null when signed out. */
  email: string | null
  onSignIn: () => void
  onPassword: () => void
  onSignOut: () => void
}) {
  return (
    <div
      className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90
                 px-3 py-1.5 text-xs text-neutral-600 shadow ring-1 ring-black/5 backdrop-blur"
    >
      {routes > 0 && (
        <span className="text-neutral-500">
          {routes} {routes === 1 ? 'route' : 'routes'}
          {hotspots > 0 && <> · {hotspots} {hotspots === 1 ? 'hotspot' : 'hotspots'}</>}{' '}
          ·
        </span>
      )}
      {email !== null ? (
        <>
          <span className="max-w-[16ch] truncate">{email}</span>
          <button
            type="button"
            onClick={onPassword}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            Password
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onSignIn}
          className="font-medium text-neutral-900 underline underline-offset-2"
        >
          Sign in
        </button>
      )}
    </div>
  )
}
