import { Button } from '@/design-system/primitives/button';

import type { HistoryLoad } from './use-history-items';

interface HistoryLoadLineProps {
  load: HistoryLoad;
}

/** What History says while the account's uploads have not arrived: Loading, or why not and Try again. */
export function HistoryLoadLine({ load }: HistoryLoadLineProps) {
  if (load.state === 'loading') {
    return (
      <p role="status" className="text-base/6 text-content-quaternary">
        Loading…
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <p role="alert" className="text-base/6 text-content-quaternary">
        {load.message}
      </p>
      <Button variant="secondary" size="small" label="Try again" onClick={load.onRetry} />
    </div>
  );
}
