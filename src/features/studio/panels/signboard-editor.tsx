import { useEffect, useId, useRef, useState } from 'react';
import type { VariantSummary } from '@/features/routes/model/routes';
import * as live from '../data/signboards';

/** What the editor does with the bucket and the row; the live ones unless a story passes its own. */
export type SignboardCalls = Pick<
  typeof live,
  'addSignboard' | 'removeSignboard' | 'moveSignboardEarlier' | 'signboardUrl'
>;

/**
 * The editor's Signboard for one direction (the owner's ask, 2026-10-01: "per
 * route, papunta and balikan … upload signboard in svg format"; the studio's
 * own, as he left its look to us). Under the trip card's facts, for the
 * direction on show — SWITCH brings up the other way's. Each board as the
 * public card shows it, 40 tall at its own width, with ‹ to move it earlier
 * and ✕ to take it off; "Add SVG" sends one or more, each cleaned first.
 * `onChanged` reloads the directions, so the card above shows the new list.
 */
export function SignboardEditor({
  variant,
  onChanged,
  calls = live,
}: {
  variant: VariantSummary;
  onChanged: () => void;
  calls?: SignboardCalls;
}) {
  const { addSignboard, removeSignboard, moveSignboardEarlier, signboardUrl } = calls;
  const [names, setNames] = useState<readonly string[]>(variant.signboards ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useId();
  const way = variant.reversed ? 'Pabalik' : 'Papunta';

  // Another direction, or the list read again: the boards as they stand.
  const listed = (variant.signboards ?? []).join('\n');
  useEffect(() => {
    setNames(listed ? listed.split('\n') : []);
  }, [variant.id, listed]);
  // A problem stays until the next change or another direction: the list read
  // again after an earlier change can land after it, and took it away unread
  // (save-test on a GitHub runner, 2026-10-01).
  useEffect(() => {
    setProblem(null);
  }, [variant.id]);

  // `step` takes a list already written, before the change is done: what a
  // later refusal must not take back (addSignboards).
  const run = async (
    change: (now: readonly string[], step: (list: string[]) => void) => Promise<string[]>,
  ) => {
    setBusy(true);
    setProblem(null);
    let changed = false;
    const step = (list: string[]) => {
      setNames(list);
      changed = true;
    };
    try {
      step(await change(names, step));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      if (changed) onChanged();
      setBusy(false);
    }
  };

  const add = (files: FileList | null) => {
    const picked = [...(files ?? [])];
    if (input.current) input.current.value = '';
    if (!picked.length) return;
    void run((now, step) => live.addSignboards(variant.id, now, picked, step, addSignboard));
  };

  return (
    <section
      data-testid="signboard-editor"
      aria-labelledby={heading}
      aria-busy={busy}
      className="flex w-full flex-col gap-2 px-3 pb-4 font-sn-pro"
    >
      <h3 id={heading} className="text-sm/5 font-medium text-content-tertiary">
        Signboard · {way}
      </h3>
      {names.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {names.map((n, i) => (
            <li
              key={n}
              data-testid="signboard-item"
              className="flex items-center gap-1 rounded-lg bg-surface-secondary p-1 pointer-coarse:gap-3"
            >
              <img
                src={signboardUrl(n)}
                alt={`Signboard ${i + 1}`}
                className="block h-10 w-auto max-w-full"
              />
              {i > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run((now) => moveSignboardEarlier(variant.id, now, n))}
                  aria-label={`Move signboard ${i + 1} earlier`}
                  className="rounded-md px-1.5 py-1 text-sm text-content-tertiary hover:bg-surface-tertiary disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  ‹
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void run((now) => removeSignboard(variant.id, now, n))}
                aria-label={`Remove signboard ${i + 1}`}
                className="rounded-md px-1.5 py-1 text-sm text-content-error hover:bg-surface-error disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-content-quaternary">No signboard yet for this way.</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-lg px-3 py-2 text-sm text-content-primary ring-1 ring-border-primary hover:bg-surface-secondary disabled:opacity-60 pointer-coarse:min-h-11"
        >
          {busy ? 'Saving…' : 'Add SVG'}
        </button>
        <span className="text-xs text-content-quaternary">
          SVG, up to 100 kB. Outline the text before exporting.
        </span>
      </div>
      <input
        ref={input}
        data-testid="signboard-file"
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        hidden
        onChange={(e) => add(e.currentTarget.files)}
      />
      {problem && (
        <p role="alert" className="text-sm text-content-error">
          {problem}
        </p>
      )}
    </section>
  );
}
