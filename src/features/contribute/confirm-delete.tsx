import { useEffect, useId, useRef } from 'react';

import { Button } from '@/design-system/primitives/button';

interface ConfirmDeleteProps {
  question: string;
  onConfirm: () => void;
  onKeep: () => void;
}

/** The question before a delete. Focus lands on Keep it, the safe answer, and the question names the group. */
export function ConfirmDelete({ question, onConfirm, onKeep }: ConfirmDeleteProps) {
  const questionId = useId();
  const groupRef = useRef<HTMLDivElement>(null);

  // Keep it is the group's last button; Button takes no ref.
  useEffect(() => {
    const keep = groupRef.current?.lastElementChild;
    if (keep instanceof HTMLElement) keep.focus();
  }, []);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby={questionId}
      className="flex flex-wrap items-center gap-2 bg-surface p-4 font-sn-pro text-content-primary"
    >
      <span id={questionId} className="w-full text-base/6 font-bold">
        {question}
      </span>
      <Button variant="error" label="Delete" onClick={onConfirm} />
      <Button variant="secondary" label="Keep it" onClick={onKeep} />
    </div>
  );
}
