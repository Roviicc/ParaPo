import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { IconButton } from '@/design-system/primitives/icon-button';
import { useDialogFocus } from '@/shared/hooks/use-dialog-focus';
import { useEscape } from '@/shared/hooks/use-escape';
import {
  BusIcon,
  CloseIcon,
  EJeepIcon,
  FerryIcon,
  JeepneyIcon,
  TrainIcon,
  UvExpressIcon,
} from '@/shared/ui/route-icons';
import { cn } from '@/shared/utils/cn';

import { RIDE_CHOICES, RIDE_LABEL, type RideChoice } from './ride-choices';
import type { RideKind } from '../storage/recording-schema';

/**
 * Each choice's icon, from the vehicle sprite. Others has none: the frame shows the ferry's on it,
 * which reads as a slip, and the owner asked for no icon unless the frame draws one of its own.
 */
const RIDE_ICON: Record<RideChoice, ReactNode> = {
  Jeep: <JeepneyIcon />,
  'E-Jeep': <EJeepIcon />,
  'UV Express': <UvExpressIcon />,
  Bus: <BusIcon />,
  Train: <TrainIcon />,
  Ferry: <FerryIcon />,
  Other: null,
};

interface RideSheetProps {
  /** The ride picked so far, marked in the list; null for none. */
  rideKind: RideKind | null;
  /** A row picked: the sheet closes with it. */
  onPick: (rideKind: RideChoice) => void;
  /** ✕, Escape, or a tap on the dimmed form: the sheet closes with nothing changed. */
  onClose: () => void;
}

/**
 * Figma's "What did you ride?" sheet (4525:15313): a BottomSheetConfiguration over the form
 * dimmed in Background/surface-transparent, its title and ✕, and a ChoiceBar for each ride, an
 * icon, its name and a radio. A tap on a row picks it and closes the sheet.
 *
 * A dialog holding the keyboard: focus goes into it, Tab goes round inside it, and focus goes back
 * to the field when it closes (useDialogFocus). The rows are a radio group: the arrow keys move
 * between them, and Enter or Space picks one.
 */
export function RideSheet({ rideKind, onPick, onClose }: RideSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, false);
  useEscape(onClose);

  // A tap anywhere but the sheet, on the dimmed form, closes it: on the tap's click, so the same
  // tap presses nothing under it. Not the click that opened it, still on its way up.
  useEffect(() => {
    const listensFrom = performance.now();
    const handleClick = (e: MouseEvent) => {
      if (e.timeStamp < listensFrom) return;
      if (e.target instanceof Node && sheetRef.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  // Tab goes round inside the sheet: ✕, then the rows' one stop, and back to ✕ from any row.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const stops = [...sheet.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])')];
      const first = stops.at(0);
      const last = stops.at(-1);
      const isOnRow = document.activeElement?.getAttribute('role') === 'radio';
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (isOnRow || document.activeElement === last)) {
        e.preventDefault();
        first?.focus();
      }
    };
    sheet.addEventListener('keydown', handleKeyDown);
    return () => sheet.removeEventListener('keydown', handleKeyDown);
  }, []);

  // The arrow keys move along the rows, round from the last to the first, as a radio group's do.
  const handleRowKeyDown = (e: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const rows = sheetRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    rows?.[(at + step + RIDE_CHOICES.length) % RIDE_CHOICES.length]?.focus();
  };

  // The rows' one Tab stop (a roving tabindex): the picked ride, or the first, then wherever focus
  // has gone among them, so Tab and Shift+Tab come back to the row last on.
  const [tabRow, setTabRow] = useState<RideChoice>(
    () => RIDE_CHOICES.find((kind) => kind === rideKind) ?? 'Jeep',
  );

  return (
    <>
      <div aria-hidden className="absolute inset-0 z-40 bg-surface-transparent" />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto rounded-t-4xl bg-surface font-sn-pro shadow-bottom-sheet-top-shadow outline-none"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg/7 font-bold text-content-primary">
            What did you ride?
          </h2>
          <IconButton
            icon={<CloseIcon />}
            label="Close"
            size="small"
            tooltip="top"
            onClick={onClose}
          />
        </div>
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          className="flex flex-col px-5 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))]"
        >
          {RIDE_CHOICES.map((kind, at) => {
            const isPicked = kind === rideKind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={isPicked}
                tabIndex={kind === tabRow ? 0 : -1}
                onFocus={() => setTabRow(kind)}
                onClick={() => onPick(kind)}
                onKeyDown={(e) => handleRowKeyDown(e, at)}
                className="flex items-center gap-2 py-3 text-left text-content-primary outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-brand-surface active:bg-surface-secondary"
              >
                <span aria-hidden className="size-6 shrink-0 *:size-full">
                  {RIDE_ICON[kind]}
                </span>
                <span className="min-w-0 flex-1 text-base-lower/6">{RIDE_LABEL[kind]}</span>
                <RadioMark isPicked={isPicked} />
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

interface RadioMarkProps {
  isPicked: boolean;
}

/**
 * Figma's Radiobutton (set 4524:15178): at rest (4524:15177) a 24 ring, 1 wide, in
 * Border/secondary; picked (Variant2, 4524:15179) a 2-wide Brand/surface ring round a 14
 * Brand/surface dot.
 */
function RadioMark({ isPicked }: RadioMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full',
        isPicked ? 'border-2 border-brand-surface' : 'border border-border-secondary',
      )}
    >
      {isPicked && <span className="size-3.5 rounded-full bg-brand-surface" />}
    </span>
  );
}
