import { useState } from 'react'
import { MapView } from './components/MapView'
import { SignIn } from './components/SignIn'
import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'

export default function App() {
  const session = useSession()
  const [signingIn, setSigningIn] = useState(false)

  const loading = session === undefined
  const signedIn = !!session

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />

      {/* Only visible once signed in, and only so auth state is legible while
          building. Folds into the corner menu with Export at M5. */}
      {signedIn && (
        <div
          className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90
                     px-3 py-1.5 text-xs text-neutral-600 shadow ring-1 ring-black/5 backdrop-blur"
        >
          <span className="max-w-[16ch] truncate">{session.user.email}</span>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            Sign out
          </button>
        </div>
      )}

      {/*
        The only persistent chrome. Signed out, it asks you to sign in;
        signed in, it will start a route. Drawing lands in M2.
      */}
      <button
        type="button"
        disabled={loading || signedIn}
        onClick={() => !signedIn && setSigningIn(true)}
        title={signedIn ? 'Drawing lands in M2' : 'Sign in to draw'}
        className="absolute bottom-6 right-6 z-10 rounded-full bg-white px-5 py-3
                   text-sm font-medium text-neutral-800 shadow-lg ring-1 ring-black/10
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? '…' : '+ New Route'}
      </button>

      {signingIn && !signedIn && <SignIn onDismiss={() => setSigningIn(false)} />}
    </div>
  )
}
