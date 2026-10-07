/**
 * The basemap tiles the public map asked for, noted so that the service
 * worker can keep them after a first visit (src/commuter/pwa.ts, warmCaches).
 *
 * On a first visit the page asks for everything before the new worker takes
 * control, so none of it reaches the worker's caches. Until the cheap-phone
 * plan's Q1 (2026-10-04) the map opened on a default view and moved to its
 * routes after 'load', and the tiles of that second view usually came after
 * the worker had taken over and so were kept; since the map opens on its
 * routes, every tile of the first screen comes before it, and a visitor who
 * installed and went offline found the routes on a bare map (pwa-test's
 * "basemap-tiles holds tiles", on GitHub's runner, 2026-10-06). Once the
 * worker controls the page, warmCaches asks for these again, from the
 * browser's own cache, and this time the worker keeps them.
 *
 * `note` is the map's transformRequest: it changes no request (MapLibre
 * keeps the URL as it was when it returns nothing, request_manager.ts) and
 * notes each tile's address, once, up to `kept`. `take` hands them over once
 * and stops the noting: from then on the page's own requests go through the
 * worker.
 */
export const TILES_KEPT = 64;

export function tileNotes(kept = TILES_KEPT) {
  const asked: string[] = [];
  let noting = true;
  return {
    note(url: string, type?: string): undefined {
      if (noting && type === 'Tile' && asked.length < kept && !asked.includes(url)) asked.push(url);
      return undefined;
    },
    take(): string[] {
      noting = false;
      return asked.splice(0);
    },
  };
}

const notes = tileNotes();
export const noteTile = notes.note;
export const takeTilesAsked = notes.take;
