import { PageButton } from './page-button';
import type { Recording } from './recording-schema';
import { SavedList } from './saved-list';

interface ReadyScreenProps {
  saved: readonly Recording[];
  onStart: () => void;
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Before a recording: Start, and the recordings kept on the phone. */
export function ReadyScreen({ saved, onStart, onDownload, onRemove }: ReadyScreenProps) {
  return (
    <section aria-label="Ready" className="flex flex-col gap-4">
      <p>
        This records where your ride goes, on this phone only. Nothing is sent anywhere. Tap Start
        when you board, and Stop when you get off.
      </p>
      <PageButton onClick={onStart}>Start</PageButton>
      <SavedList recordings={saved} onDownload={onDownload} onRemove={onRemove} />
    </section>
  );
}
