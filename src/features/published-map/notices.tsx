import { Button } from '@/design-system/primitives/button';
import { MAP_FILE_TOO_NEW } from './map-file';
import { shortDate } from './status';

/**
 * What the public map says about itself, over the map: a load that failed
 * (or a map published for a newer app), how old the map is when it came
 * from the phone's store, and a new version waiting. Split from
 * CommuterApp.tsx, 2026-09-29.
 */
export function Notices({
  loadFailed,
  tooNew,
  onTryAgain,
  onReloadNewer,
  offline,
  age,
  needRefresh,
  onUpdate,
}: {
  loadFailed: boolean;
  tooNew: boolean;
  onTryAgain: () => void;
  /** The too-new map's Reload: the newer app, through the worker (pwa.ts). */
  onReloadNewer: () => void;
  offline: boolean;
  age: { publishedAt: string | null; stale: boolean };
  needRefresh: boolean;
  /** The new version's "Update Para Po!". */
  onUpdate: () => void;
}) {
  return (
    <>
      {loadFailed && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow ring-1 ring-amber-200 @wide:top-[calc(1rem+env(safe-area-inset-top))] @wide:bottom-auto @wide:max-w-xl">
          {tooNew ? (
            // The file is a shape this installed app does not know. Loading
            // it again cannot help; the newer app can, fetched through the
            // worker (pwa.ts, reloadForNewerApp).
            <>
              <span>{MAP_FILE_TOO_NEW} Reload to update.</span>
              <button
                type="button"
                onClick={onReloadNewer}
                className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-content-inverse"
              >
                Reload
              </button>
            </>
          ) : (
            <>
              <span>The routes could not be loaded. Check your connection and try again.</span>
              <button
                type="button"
                onClick={onTryAgain}
                className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-content-inverse"
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {/*
        Honesty about age. With no signal, or a network too slow to answer in
        time, the map is whatever the phone kept, and the date comes from inside
        the file itself, so it is exact. Where the count pill was until the
        owner took it off (2026-09-29): bottom left above the scale on a phone
        (the credit line opens across the top there), top left on a wide map.
      */}
      {(offline || age.stale) && (
        <div
          data-testid="offline"
          className="absolute bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-10 rounded-full bg-neutral-800/90 px-3 py-1.5 text-xs text-content-inverse shadow backdrop-blur @wide:top-[calc(1rem+env(safe-area-inset-top))] @wide:bottom-auto"
        >
          {offline ? 'Offline' : 'Not refreshed'}
          {age.publishedAt && <> · map as of {shortDate(age.publishedAt)}</>}
        </div>
      )}

      {/*
        A new version never applies itself: a reload mid-ride would drop the
        selected route. The owner's Primary button, 24 below the top, centred
        (3732:2512, 2026-09-30), in place of the old black pill.
      */}
      {needRefresh && (
        <div className="pointer-events-none absolute top-[calc(1.5rem+env(safe-area-inset-top))] left-1/2 z-20 -translate-x-1/2 *:pointer-events-auto">
          <Button
            variant="primary"
            label="Update Para Po!"
            data-testid="update"
            onClick={onUpdate}
          />
        </div>
      )}
    </>
  );
}
