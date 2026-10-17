import { useEffect, useId, useRef } from 'react';

import { PageButton } from './page-button';

interface ConfirmDeleteProps {
  question: string;
  onConfirm: () => void;
  onKeep: () => void;
}

/** The question before a delete. Focus lands on Keep it, the safe answer, and the question names the group. */
export function ConfirmDelete({ question, onConfirm, onKeep }: ConfirmDeleteProps) {
  const questionId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => keepRef.current?.focus(), []);

  return (
    <div role="group" aria-labelledby={questionId} className="flex flex-wrap items-center gap-2">
      <span id={questionId}>{question}</span>
      <PageButton onClick={onConfirm}>Delete</PageButton>
      <PageButton ref={keepRef} onClick={onKeep}>
        Keep it
      </PageButton>
    </div>
  );
}
