import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { Button } from '@/design-system/primitives/button';
import { FieldError } from '@/design-system/primitives/field-error';
import { TextAreaField } from '@/design-system/primitives/text-area-field';
import { TextField } from '@/design-system/primitives/text-field';

import { fareFromText } from './fare-text';
import { RideField } from './ride-field';
import { RideSheet } from './ride-sheet';
import { StopRecordingScreen } from './stop-recording-screen';
import { useSaveCountdown } from './use-save-countdown';
import { countdownText } from '../common/format';
import { useFocusHeading } from '../common/use-focus-heading';
import type { RecordingFigures } from '../recorder/recording-figures';
import type { RecordingDetails } from '../recorder/recording-state';
import type { RideKind } from '../storage/recording-schema';

interface SaveFormProps {
  /** The recording's time and distance, for Discard's question. */
  figures: RecordingFigures;
  /** Fixes the phone could not keep; above zero, the recording is missing part of its trail. */
  failedFixWrites: number;
  /** Resume: back to recording, for a stop that was a mistake. */
  onKeepRecording: () => void;
  /** Save recording, and the form's two minutes running out: saves with what was said. */
  onSave: (details: RecordingDetails) => void;
  /** Discard's question answered Stop without saving: the recording is thrown away. */
  onDiscard: () => void;
}

/**
 * Figma's Save Recording (4521:3679): the title, how long until it saves itself, the fields —
 * Start point name, End point name, Fare, What did you ride? (a sheet, 4525:15313) and
 * Description — and Discard recording, over a bottom bar with Save recording and Resume.
 *
 * Every field is optional. Left alone for two minutes it saves with what was typed, so a phone
 * put away after a ride does not keep a recording open; a fare it cannot read is left out then,
 * and Save recording asks for it to be put right first. Discard asks over the whole screen, as ✕
 * does while recording, and never throws a recording away in one tap.
 */
export function SaveForm({
  figures,
  failedFixWrites,
  onKeepRecording,
  onSave,
  onDiscard,
}: SaveFormProps) {
  const ids = useId();
  const headingRef = useFocusHeading();
  const fareRef = useRef<HTMLInputElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const rideFieldRef = useRef<HTMLButtonElement>(null);
  const [startPointName, setStartPointName] = useState('');
  const [endPointName, setEndPointName] = useState('');
  const [fareText, setFareText] = useState('');
  const [isFareChecked, setIsFareChecked] = useState(false);
  const [rideKind, setRideKind] = useState<RideKind | null>(null);
  const [description, setDescription] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isDiscardAsked, setIsDiscardAsked] = useState(false);

  const fare = fareFromText(fareText);
  const fareError = isFareChecked ? fare.error : undefined;
  // What is said, the fare only when it reads: a bad one is never kept, nor sent.
  const details: RecordingDetails = {
    startPointName,
    endPointName,
    description,
    rideKind,
    ...(fare.farePhp === undefined ? {} : { farePhp: fare.farePhp }),
  };
  const { secondsLeft, touch } = useSaveCountdown(
    () => onSave(details),
    isSheetOpen || isDiscardAsked,
  );

  // Focus back on the field, by hand: the form went inert as the sheet opened, so the field had
  // already lost focus and the sheet has nothing to give back.
  const closeSheet = () => {
    flushSync(() => setIsSheetOpen(false));
    touch();
    rideFieldRef.current?.focus();
  };
  const keepIt = () => {
    flushSync(() => setIsDiscardAsked(false));
    touch();
    discardRef.current?.focus();
  };

  return (
    <>
      <form
        aria-labelledby={`${ids}-heading`}
        inert={isSheetOpen || isDiscardAsked}
        noValidate
        onPointerDownCapture={touch}
        onKeyDownCapture={touch}
        onChangeCapture={touch}
        onSubmit={(event) => {
          event.preventDefault();
          if (fare.error) {
            setIsFareChecked(true);
            fareRef.current?.focus();
            return;
          }
          onSave(details);
        }}
        className="absolute inset-0 z-20 flex flex-col bg-surface font-sn-pro text-content-primary"
      >
        <header className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-3">
          <h1
            id={`${ids}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl/9 font-extrabold focus:outline-none"
          >
            Save Recording
          </h1>
          <p className="text-sm/5 text-content-disabled">
            Saves by itself in {countdownText(secondsLeft)}
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
          <div className="flex flex-col gap-5">
            {failedFixWrites > 0 && (
              <div role="alert">
                <FieldError
                  id={`${ids}-room`}
                  message="Your phone ran out of room for part of this recording. Free up some space to keep the next one whole."
                />
              </div>
            )}
            <TextField
              id={`${ids}-start`}
              label="Start point name"
              maxLength={80}
              value={startPointName}
              onChange={(event) => setStartPointName(event.target.value)}
              onClear={() => setStartPointName('')}
            />
            <TextField
              id={`${ids}-end`}
              label="End point name"
              maxLength={80}
              value={endPointName}
              onChange={(event) => setEndPointName(event.target.value)}
              onClear={() => setEndPointName('')}
            />
            <TextField
              ref={fareRef}
              id={`${ids}-fare`}
              label="Fare"
              inputMode="decimal"
              autoComplete="off"
              maxLength={9}
              value={fareText}
              error={fareError}
              onChange={(event) => setFareText(event.target.value)}
              onBlur={() => setIsFareChecked(true)}
              onClear={() => {
                setFareText('');
                setIsFareChecked(false);
              }}
            />
            <RideField
              ref={rideFieldRef}
              rideKind={rideKind}
              isSheetOpen={isSheetOpen}
              onOpen={() => setIsSheetOpen(true)}
            />
            <TextAreaField
              id={`${ids}-description`}
              label="Description"
              placeholder="Signboard, landmarks, anything that helps"
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            {/* Figma's Button in its plain voice, its words in Content/error: the design system's
                Button has no plain red, so the same box and type, in tokens. */}
            <button
              ref={discardRef}
              type="button"
              onClick={() => setIsDiscardAsked(true)}
              className="flex items-center justify-center rounded-full px-4 py-2 text-base/6 font-medium text-content-error outline-none focus-visible:ring-2 focus-visible:ring-content-error"
            >
              Discard recording
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 rounded-t-4xl bg-surface px-5 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-bottom-sheet-top-shadow">
          <Button variant="primary" type="submit" label="Save recording" />
          <Button variant="plain" label="Resume" onClick={onKeepRecording} />
        </div>
      </form>
      {isSheetOpen && (
        <RideSheet
          rideKind={rideKind}
          onPick={(picked) => {
            setRideKind(picked);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
      {isDiscardAsked && (
        <StopRecordingScreen
          figures={figures}
          keepLabel="Keep it"
          onKeep={keepIt}
          onStop={onDiscard}
        />
      )}
    </>
  );
}
