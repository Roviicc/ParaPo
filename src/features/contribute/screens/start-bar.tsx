import { PlayIcon } from './tracking-icons';

interface StartBarProps {
  onClick: () => void;
}

/**
 * Figma's "Start tracking" on Record (4520:3489): a Primary Button the frame's width less 32 each
 * side, its play icon and words in SN Pro Medium, over the tabs. The frame draws it 48 tall, 12
 * over and under, where the Button set's Base is 40: so the look is Button's Primary (its fill,
 * shadows and states, button-look.ts) in tokens, at the frame's height. The 32 each side is its
 * own, so what the app's gates put in its place (start-gate.tsx) keeps the full width.
 */
export function StartBar({ onClick }: StartBarProps) {
  return (
    <div className="px-8">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-center gap-1 rounded-full bg-brand-surface px-4 py-3 font-sn-pro text-base/6 font-medium text-content-inverse shadow-primary-button-rest outline-none hover:shadow-primary-button-hover focus-visible:ring-2 focus-visible:ring-brand-surface focus-visible:ring-offset-2 active:bg-brand-surface-secondary active:shadow-primary-button-pressed"
      >
        <span aria-hidden className="size-5 shrink-0 *:size-full">
          <PlayIcon />
        </span>
        Start tracking
      </button>
    </div>
  );
}
