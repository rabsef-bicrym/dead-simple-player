/**
 * The transitions that decide what a tune, a stop and a first frame do —
 * pinned as pure functions to what `app/watch.tsx` does today (bead381, plus
 * the same-channel rule WP-03 landed from ff-spec §6.2).
 *
 * Each function is an oracle: the station reducer (WP-07) and the rewire
 * (WP-09) must answer the same way for every `asis` row of `matrix.ts`,
 * and exactly the ruled way for every `ruled:` row. Nothing here runs in
 * the app yet.
 *
 * Line numbers are bead381's (`app/watch.tsx` before this package added
 * one import at :24; read +1 for anything after it).
 */

import type { Entrance, TuneOrigin } from './commands';

// ── The same-channel arrival (`watch.tsx:495-502`) ──

export interface ArrivalScene {
  /** `playbackActiveRef.current` — the set has a picture (or is tuning one). */
  playbackActive: boolean;
  /** `index === safeIndex` */
  sameIndex: boolean;
  /** `tuning` — the static is up. */
  tuning: boolean;
  /** `sourceReady` — a first frame has been witnessed for this source. */
  sourceReady: boolean;
  /** `playerError` */
  playerError: string | null;
  origin: TuneOrigin;
}

export type Arrival =
  /** Close home/board/notes and return; the picture, the static and any error are untouched. */
  | { kind: 'chrome-only'; flash: boolean }
  /** `traceTuneStart`, static up, new source. */
  | { kind: 'full-tune'; flash: boolean };

/**
 * The rule since WP-03 (ff-spec §6.2; `watch.tsx` tuneTo): the short-circuit
 * fires when the set is on, the index is the tuned one and the channel is
 * not in error — a healthy tune in progress is never restarted (a second
 * cold master GET can throttle the session), a channel in error is re-tuned
 * through `invalidate()` + `rejoin('retune')` (decision 16, WS-20). Flash
 * unless the tune came from a visible register tap (R24, the bloom is the
 * acknowledgment) and unless the static is up; the full branch flashes on
 * every origin but `register` and `power` (both in `watch.tsx` tuneTo, as
 * `matrix.ts` cites it — the bead381 line numbers no longer hold there).
 */
export function sameChannelArrival(scene: ArrivalScene): Arrival {
  if (scene.playbackActive && scene.sameIndex && scene.playerError === null) {
    return { kind: 'chrome-only', flash: scene.origin !== 'register' && !scene.tuning };
  }
  return { kind: 'full-tune', flash: scene.origin !== 'register' && scene.origin !== 'power' };
}

/**
 * The rule at bead381, kept as the `today:` oracle of the matrix's `ruled:16`
 * rows: the short-circuit fired whenever the set was on and the index was
 * the tuned one — regardless of an error or a static that never ended
 * (WS-20). Nothing in the app answers this way any more.
 */
export function sameChannelArrivalBead381(scene: ArrivalScene): Arrival {
  if (scene.playbackActive && scene.sameIndex) {
    return { kind: 'chrome-only', flash: scene.origin !== 'register' && !scene.tuning };
  }
  return { kind: 'full-tune', flash: scene.origin !== 'register' };
}

// ── What is on screen (`watch.tsx:147-148`) ──

/** `watching = playbackActive && !homeVisible && !signOff` — the board does not end watching (R19). */
export function watching(flags: { playbackActive: boolean; homeVisible: boolean; signOff: boolean }): boolean {
  return flags.playbackActive && !flags.homeVisible && !flags.signOff;
}

/** `portraitWatching = isPhone && !isLandscape && watching` */
export function portraitWatching(flags: { isPhone: boolean; landscape: boolean; watching: boolean }): boolean {
  return flags.isPhone && !flags.landscape && flags.watching;
}

// ── The static's only ending (`watch.tsx:686-691`; R1) ──

/**
 * The static ends iff a first frame has been witnessed AND the reveal has
 * settled. No timer, no readiness proxy, no elapsed time may stand in for
 * either conjunct (R1, "Do not retry").
 */
export function staticEnds(flags: { tuning: boolean; sourceReady: boolean; revealDone: boolean }): boolean {
  return flags.tuning && flags.sourceReady && flags.revealDone;
}

// ── The stop guard (`watch.tsx:842`) ──

/** `if (!playbackActiveRef.current || stopping) return;` — STOP is refused when there is nothing to stop. */
export function stopAccepted(flags: { playbackActive: boolean; stopping: boolean }): boolean {
  return flags.playbackActive && !flags.stopping;
}

// ── Pre-empted deferred writes (invariant 12; WS-01, WS-22) ──

/**
 * Every deferred write belongs to one generation, and a generation bump
 * must both cancel the write AND leave the state complete without it.
 * Today `beginTransition` (`:185-196`) does the first half only: a
 * pre-empted stop leaves `stopping` orphaned (WS-01) and a pre-empted
 * reveal leaves `watchRevealDone=false` so the static outlives the frame
 * (WS-22). These are the terminal states the pre-empting transition must
 * apply first.
 */
export type PreemptedKind = 'stopping' | 'reveal';

export type PreemptedTerminal =
  /** `showExpandedRegister` (`:866-871`): the receiver, expanded, dial on the stopped station. */
  | { kind: 'stopping'; base: 'home'; entrance: Entrance; dialFromIndex: true; stopping: false }
  /** The reveal's own timer would have written this (`:539-542`). */
  | { kind: 'reveal'; revealDone: true };

export function preemptedTerminal(kind: 'stopping'): Extract<PreemptedTerminal, { kind: 'stopping' }>;
export function preemptedTerminal(kind: 'reveal'): Extract<PreemptedTerminal, { kind: 'reveal' }>;
export function preemptedTerminal(kind: PreemptedKind): PreemptedTerminal {
  if (kind === 'stopping') {
    return { kind: 'stopping', base: 'home', entrance: 'expand', dialFromIndex: true, stopping: false };
  }
  return { kind: 'reveal', revealDone: true };
}
