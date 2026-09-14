/**
 * `?e2e=1` lets the headless checks reach the drawing tools on /studio/
 * without an account.
 *
 * Development builds only. In a production build `import.meta.env.DEV` is the
 * constant `false`, so the whole branch — the word `e2e` with it — is dropped;
 * scripts/check-build.mjs fails the build if it ever is not.
 *
 * A convenience, not a hole: the database's editor rules refuse every write
 * from a session that is not signed in, so a bypassed page can draw but never
 * save.
 */
export function skipSignInForTests(): boolean {
  if (import.meta.env.DEV) {
    return new URLSearchParams(window.location.search).has('e2e')
  }
  return false
}
