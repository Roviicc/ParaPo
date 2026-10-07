import { useEffect } from 'react';

/*
 * A child's effect run where a hook of its parent's stood in the commit.
 *
 * React runs a component's effects after every one of its children's. So a
 * hook moved out of a component into a child of it runs its effects earlier
 * in a commit than it did: before the parent's own, not among them. Where
 * that order shows — two camera moves in one commit, the later one taking
 * over — the parent keeps a turn where the hook stood (useTurn) and hands it
 * down, and the child's effect takes it: `turn(go)` runs `go` there when the
 * parent rendered in the same commit, its effects still to come, and at once
 * when only the child rendered, as nothing of the parent's runs then.
 * VisitorLocation's camera, the cheap-phone plan, step 15 (2026-10-05).
 */

/** Run `go` at the parent's turn in this commit, or now if that has passed. */
export type Turn = (go: () => void) => void;

/**
 * One render's turn: `run` holds what it is handed until `done`, then runs
 * it in the order it came; once done, it runs whatever comes at once.
 */
export function turnFor(): { run: Turn; done: () => void } {
  let waiting: (() => void)[] | null = [];
  return {
    run: (go) => {
      if (waiting) waiting.push(go);
      else go();
    },
    done: () => {
      const now = waiting ?? [];
      waiting = null;
      for (const go of now) go();
    },
  };
}

/**
 * The parent's turn, where this hook stands among its hooks: a new one each
 * render, done by an effect that runs after each, after every child's.
 */
export function useTurn(): Turn {
  const turn = turnFor();
  useEffect(() => {
    turn.done();
  });
  return turn.run;
}
