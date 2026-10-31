import { useId, type Ref } from 'react';

import { FIELD_CONTROL, FIELD_TRAILING, FieldFrame } from '@/design-system/primitives/field-frame';
import { ChevronDownIcon } from '@/design-system/primitives/field-icons';
import { cn } from '@/shared/utils/cn';

import { RIDE_LABEL } from './ride-choices';
import type { RideKind } from '../storage/recording-schema';

interface RideFieldProps {
  rideKind: RideKind | null;
  isSheetOpen: boolean;
  /** Opens the "What did you ride?" sheet. */
  onOpen: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Figma's "What did you ride?" InputField (4521:3740): "Pick one" in Content/disabled until a ride
 * is picked, the chevron at its end, the whole box a button that opens the sheet (ride-sheet.tsx).
 * Its name is the label; what it holds is read after it.
 */
export function RideField({ rideKind, isSheetOpen, onOpen, ref }: RideFieldProps) {
  const id = useId();
  const valueId = `${id}-value`;
  return (
    <FieldFrame
      id={id}
      label="What did you ride?"
      errorId={`${id}-error`}
      isDisabled={false}
      trailing={
        <span
          aria-hidden
          className={cn(FIELD_TRAILING, 'pointer-events-none absolute inset-y-0 right-0')}
        >
          <span className="size-6 *:size-full">
            <ChevronDownIcon />
          </span>
        </span>
      }
    >
      <button
        ref={ref}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isSheetOpen}
        aria-describedby={valueId}
        onClick={onOpen}
        className={cn(FIELD_CONTROL, 'w-full cursor-pointer truncate pr-11 text-left')}
      >
        <span
          id={valueId}
          className={rideKind === null ? 'text-content-disabled' : 'text-content-primary'}
        >
          {rideKind === null ? 'Pick one' : RIDE_LABEL[rideKind]}
        </span>
      </button>
    </FieldFrame>
  );
}
