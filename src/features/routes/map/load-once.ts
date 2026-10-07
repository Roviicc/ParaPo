/**
 * Runs `load` for `key` unless it already ran for that very key: `loaded`
 * keeps the last. The routes' and hotspots' hooks load what they draw as
 * they mount (useSavedRoutes, useSavedHotspots), keyed on their loader, which
 * is one module-level function.
 *
 * Why (review of the sources group, 2026-10-05): React's StrictMode runs
 * every effect of a mount twice in development, keeping the component's
 * refs, and an effect that only called the loader read everything twice.
 * The studio's list of 5,000 directions (studio-scale-test) was read twice
 * in full, 10 pages of route_variant and 128 of route_stop for 5 and 64,
 * and laid out on the map twice: since MapLibre's worker starts early (the
 * cheap-phone plan, step 6) the map is up before either read is in, and
 * drew both, some 2.5 s of SwiftShader frames of the whole map more. A
 * production build runs the effect once, as this does in both; an explicit
 * reload (after a save) still reads afresh.
 */
export function loadOnce<K>(loaded: { current: K | null }, key: K, load: () => void): boolean {
  if (loaded.current === key) return false;
  loaded.current = key;
  load();
  return true;
}
