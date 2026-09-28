/**
 * One request in flight, in order (R6). expo-video cancels its native loader
 * when `replaceAsync` calls overlap, so the surface serialises them: each
 * step waits for the previous one to settle, and every step re-checks the
 * current generation before it runs (and after every await inside it). A
 * burst of swipes therefore performs the replace already in flight and then
 * the newest one; every generation superseded in between is a no-op that
 * never touches the station (NP-05: each master GET starts a session that
 * lives 60 s, and with `work_ahead_limit=1` each throttles the next).
 *
 * Nothing here cancels the in-flight native load — nothing can — so
 * last-write-wins is decided at dequeue time, by the step's own guard. A
 * rejected step never poisons the chain: the next step runs regardless.
 */
export interface SerialChain {
  /** Runs `step` after every previously enqueued step has settled. Resolves or rejects as `step` does. */
  enqueue(step: () => Promise<void>): Promise<void>;
}

export function createSerialChain(): SerialChain {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(step) {
      const run = tail.catch(() => {}).then(step);
      tail = run.catch(() => {});
      return run;
    },
  };
}
