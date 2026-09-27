/**
 * The first-frame gate — the generation, latch and ladder logic of the native
 * surface as a pure reducer: `(state, event) → { state, actions }`.
 *
 * `PlayerSurface.native.tsx` owns the I/O (the player, the picture view, the
 * retry timer, the callbacks) and drives this with what it observes; every
 * decision about which generation a fact belongs to, whether it is latched or
 * replayed, and what an attempt does next is made here, where jest can replay
 * it (docs/native-witness.md §6, ff-spec §11.2).
 *
 * Generations are unique per launch, never per mount (a late row from a
 * previous mount can never wear the new mount's first generation): the state
 * carries `nextGeneration`, and the surface seeds it from, and writes it back
 * to, one module-global counter.
 *
 * What ends the static: exactly one action, `first-frame`, emitted only by
 * `native-first-frame` for the settled current generation, or by `settle`
 * replaying a fire latched for it. Errors, readiness, rebuilds and timers
 * never emit it (R1). The retry timer this reducer schedules starts a FETCH
 * (`schedule-retry` → `retry-fired` → `replace`); it never ends anything.
 */
import type { DSPStartResult } from '../../modules/dsp-picture';
import type { PlayerError } from './types';

/** The ladder, indexed by `failures - 1`; the last entry repeats (R1: X is the escape). */
export const RETRY_DELAYS_MS = [0, 2000, 4000, 8000, 15000, 30000] as const;
/** The plate relabels ("THE SIGNAL WILL NOT JOIN") after this many consecutive failures; attempts continue (R4). */
export const SURFACE_ERROR_AFTER = 3;

/** What `startPlayback(g)` returned: the module's word for it, spelled once (modules/dsp-picture/index.ts). */
export type StartResult = DSPStartResult;

export interface GateState {
  /** Mirror of the launch-wide counter; the surface writes it back after every dispatch. */
  nextGeneration: number;
  /** The generation every native and player fact is judged against. */
  sourceGeneration: number;
  /** 0 until the chain settled `sourceGeneration` (replaceAsync resolved in the same continuation). */
  settledGeneration: number;
  /** Allocated by `invalidate` (tuneTo, synchronous); the next `take` uses it instead of allocating. */
  pendingTuneGeneration: number | null;
  /** FF-03: a native fire for the current generation that arrived before settle. */
  pendingFirstFrame: number | null;
  /** The error twin of the fire latch. */
  pendingError: { g: number; error: PlayerError } | null;
  readyReported: boolean;
  firstFrameReported: boolean;
  /** Consecutive failed attempts on this source; health resets it. */
  failures: number;
  /** Attempts made on this source (the source effect is #1; every rebuild adds one). */
  attempts: number;
  /** A retry timer is armed for `retry.g`. */
  retry: { g: number; reason: string } | null;
  /** The source effect saw a URL (a cleared source settles at once and replaces nothing). */
  hasSource: boolean;
}

export type GateEvent =
  /** `tuneTo`, before its first setState (race-2 R1). */
  | { type: 'invalidate' }
  /** The source effect (`reason: 'source'`), a rebuild (retry, FF-14) or `rejoin(reason)`. */
  | { type: 'take'; reason: 'source' | 'rebuild' | 'rejoin'; detail?: string; hasSource?: boolean }
  /** replaceAsync resolved for `g`, in the same continuation. */
  | { type: 'settle'; g: number }
  /** The chain rejected (replaceAsync threw) for `g`. */
  | { type: 'chain-rejected'; g: number; message: string }
  /** What `startPlayback(g)` returned. */
  | { type: 'start-result'; g: number; result: StartResult }
  | { type: 'native-first-frame'; g: number; item: string; via: string }
  | { type: 'native-item-failed'; g: number; item: string; error: PlayerError }
  | { type: 'native-item-lost'; g: number; item: string }
  /** expo's `statusChange error`, stamped with the generation current at arrival (its payload names no item). */
  | { type: 'status-error'; g: number; error: PlayerError }
  /** Buffer health: `readyToPlay`, `playingChange true`, an advancing `timeUpdate`. */
  | { type: 'ready' }
  /** The retry timer for `g` fired. */
  | { type: 'retry-fired'; g: number }
  /** The layout cleanup: every later fact is stale. */
  | { type: 'unmount' };

export type GateAction =
  | { type: 'trace'; name: string; detail?: string; g: number }
  /** `traceBindGeneration(g)` — the row router learns which tune owns `g`. */
  | { type: 'bind-generation'; g: number }
  | { type: 'buffering'; on: boolean }
  /** `onReady()` — once per generation. */
  | { type: 'ready' }
  /** `onFirstFrame(g)` — the only writer of `sourceReady` upstream. */
  | { type: 'first-frame'; g: number }
  /** `onError(error)` — the plate relabels ("THE SIGNAL WILL NOT JOIN"); the static stays (R4); never an ending. */
  | { type: 'error'; error: PlayerError }
  /** Run the replace chain for `g`. */
  | { type: 'replace'; g: number }
  | { type: 'schedule-retry'; g: number; delayMs: number; reason: string }
  | { type: 'cancel-retry' };

export interface GateResult { state: GateState; actions: GateAction[] }

export function createGateState(nextGeneration: number): GateState {
  return {
    nextGeneration,
    sourceGeneration: 0,
    settledGeneration: 0,
    pendingTuneGeneration: null,
    pendingFirstFrame: null,
    pendingError: null,
    readyReported: false,
    firstFrameReported: false,
    failures: 0,
    attempts: 0,
    retry: null,
    hasSource: false,
  };
}

/** The delay before attempt `failures + 1`, by the ladder (race-2 R8: the first retry is immediate). */
export function retryDelayMs(failures: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(failures, 1) - 1, RETRY_DELAYS_MS.length - 1)];
}

function trace(name: string, detail: string | undefined, g: number): GateAction {
  return { type: 'trace', name, detail, g };
}

/** Everything a generation owns, dropped when a new one takes over. */
function resetForGeneration(s: GateState, actions: GateAction[]): GateState {
  if (s.retry) actions.push({ type: 'cancel-retry' });
  return {
    ...s,
    settledGeneration: 0,
    pendingFirstFrame: null,
    pendingError: null,
    readyReported: false,
    firstFrameReported: false,
    retry: null,
  };
}

function reportFirstFrame(s: GateState, g: number, actions: GateAction[]): GateState {
  if (g !== s.sourceGeneration || s.firstFrameReported) return s;
  actions.push({ type: 'buffering', on: false });
  actions.push({ type: 'first-frame', g });
  return { ...s, firstFrameReported: true, pendingFirstFrame: null, failures: 0 };
}

function reportReady(s: GateState, actions: GateAction[]): GateState {
  if (s.settledGeneration !== s.sourceGeneration) return s;
  actions.push({ type: 'buffering', on: false });
  if (s.readyReported) return { ...s, failures: 0 };
  actions.push({ type: 'ready' });
  return { ...s, readyReported: true, failures: 0 };
}

/**
 * The ladder: schedules a FETCH; never ends anything. A retry is a new
 * generation (one attempt = one expect). `reason` rides the timer so the
 * attempt row says what asked for it.
 */
function fail(s: GateState, g: number, error: PlayerError, reason: string, actions: GateAction[]): GateState {
  if (g !== s.sourceGeneration) {
    actions.push(trace('playerError', `stale g=${g}: ${error.message}`, g));
    return s;
  }
  if (s.settledGeneration !== g) {
    actions.push(trace('playerError', `latched (settle pending): ${error.message}`, g));
    return { ...s, pendingError: { g, error } };
  }
  if (s.retry) return s;
  const failures = s.failures + 1;
  actions.push(trace('playerError', `${error.kind}: ${error.message} failures=${failures}`, g));
  // The plate relabels while attempts continue: `recovery-exhausted` is the
  // kind watch.tsx does not treat as an ending (its handlePlayerError closes
  // the tune record for every other kind), so a later frame still closes it.
  if (failures >= SURFACE_ERROR_AFTER) actions.push({ type: 'error', error: { kind: 'recovery-exhausted', message: error.message } });
  const delayMs = retryDelayMs(failures);
  actions.push({ type: 'buffering', on: true });
  actions.push(trace('retry scheduled', `in=${delayMs}ms`, g));
  actions.push({ type: 'schedule-retry', g, delayMs, reason });
  return { ...s, failures, retry: { g, reason } };
}

function take(s: GateState, event: Extract<GateEvent, { type: 'take' }>, actions: GateAction[]): GateState {
  let next = s;
  let g: number;
  if (next.pendingTuneGeneration !== null && next.pendingTuneGeneration === next.sourceGeneration) {
    g = next.pendingTuneGeneration;
  } else {
    g = next.nextGeneration + 1;
    next = { ...next, nextGeneration: g };
  }
  next = resetForGeneration({ ...next, sourceGeneration: g, pendingTuneGeneration: null }, actions);
  const hasSource = event.reason === 'source' ? event.hasSource !== false : next.hasSource;
  next = { ...next, hasSource };
  if (event.reason === 'source') {
    next = { ...next, failures: 0, attempts: 1 };
    if (!hasSource) {
      actions.push({ type: 'buffering', on: false });
      return { ...next, settledGeneration: g };
    }
    actions.push({ type: 'bind-generation', g });
    actions.push(trace('gen bound', `g=${g}`, g));
  } else {
    if (!hasSource) return next;
    next = { ...next, attempts: next.attempts + 1 };
    actions.push({ type: 'bind-generation', g });
    actions.push(trace('attempt', `#${next.attempts} reason=${event.detail ?? event.reason}`, g));
  }
  actions.push({ type: 'buffering', on: true });
  actions.push({ type: 'replace', g });
  return next;
}

export function reduceGate(state: GateState, event: GateEvent): GateResult {
  const actions: GateAction[] = [];
  let s = state;
  switch (event.type) {
    case 'invalidate': {
      const g = s.nextGeneration + 1;
      s = resetForGeneration({ ...s, nextGeneration: g, sourceGeneration: g, pendingTuneGeneration: g }, actions);
      // tuneTo opened the tune record the instant before this: the router
      // learns the owner now, so this row and everything stamped in the
      // invalidate→take window (the rejoin row, a listener row stamped at
      // arrival) file under that tune instead of lighting the dropped line
      // (H-L). The take's bind of the same number is idempotent.
      actions.push({ type: 'bind-generation', g });
      actions.push(trace('gen invalidated', `g=${g}`, g));
      return { state: s, actions };
    }
    case 'take':
      return { state: take(s, event, actions), actions };
    case 'settle': {
      const { g } = event;
      if (g !== s.sourceGeneration) return { state: s, actions };
      s = { ...s, settledGeneration: g };
      if (s.pendingFirstFrame === g) {
        actions.push(trace('firstFrame replay', 'latched fire delivered after settle', g));
        s = reportReady(s, actions);
        s = reportFirstFrame(s, g, actions);
      }
      if (s.pendingError?.g === g) {
        const { error } = s.pendingError;
        s = { ...s, pendingError: null };
        actions.push(trace('error replay', 'latched error delivered after settle', g));
        s = fail(s, g, error, 'retry', actions);
      }
      return { state: s, actions };
    }
    case 'chain-rejected': {
      const { g } = event;
      if (g !== s.sourceGeneration) return { state: s, actions };
      // The error path must be reachable: settle first (race-2 R6).
      s = { ...s, settledGeneration: g };
      actions.push(trace('replaceAsync reject', event.message, g));
      s = fail(s, g, { kind: 'media', message: event.message }, 'retry', actions);
      return { state: s, actions };
    }
    case 'start-result': {
      const { g, result } = event;
      if (g !== s.sourceGeneration) return { state: s, actions };
      actions.push(trace('startPlayback', result, g));
      if (result === 'unbound') {
        // FF-14(a): the load was cancelled and nothing is current. Index 0 of
        // the ladder (0 ms) — the same immediate rebuild, bounded if it repeats.
        s = fail(s, g, { kind: 'media', message: 'no item after resolve' }, 'no-item', actions);
      } else if (result === 'stale') {
        s = fail(s, g, { kind: 'media', message: 'picture bound to another generation' }, 'retry', actions);
      } else if (result === 'failed') {
        // The item was already .failed when asked to start. Bound to g,
        // `onItemFailed` said so first and the armed retry makes this a no-op;
        // adopted (bound g=-1 while it failed, so `onItemFailed` never fired
        // and expo's pre-settle error was dropped) this is the ladder's one word.
        s = fail(s, g, { kind: 'media', message: 'item failed before start' }, 'retry', actions);
      }
      return { state: s, actions };
    }
    case 'native-first-frame': {
      const { g, item, via } = event;
      if (g !== s.sourceGeneration) {
        actions.push(trace('firstFrame', `i=${item} via=${via} accepted=stale current=${s.sourceGeneration}`, g));
        return { state: s, actions };
      }
      if (s.settledGeneration !== g) {
        actions.push(trace('firstFrame', `i=${item} via=${via} accepted=latched`, g));
        return { state: { ...s, pendingFirstFrame: g }, actions };
      }
      actions.push(trace('firstFrame', `i=${item} via=${via} accepted=yes`, g));
      s = reportReady(s, actions);
      s = reportFirstFrame(s, g, actions);
      return { state: s, actions };
    }
    case 'native-item-failed':
      return { state: fail(s, event.g, event.error, 'retry', actions), actions };
    case 'native-item-lost': {
      const { g, item } = event;
      actions.push(trace('item lost', `i=${item}`, g));
      if (g !== s.sourceGeneration) return { state: s, actions };
      // FF-14(c): a started, unfired item was unbound by a nil edge.
      s = fail(s, g, { kind: 'media', message: 'item lost before its first frame' }, 'item-lost', actions);
      return { state: s, actions };
    }
    case 'status-error': {
      const { g, error } = event;
      if (g === s.sourceGeneration && s.settledGeneration !== g) {
        // expo's payload names no item, and the stamp is the generation at
        // arrival: before settle this may be the OLD item's error wearing
        // the new number, and a latch would replay it as the new attempt's
        // failure (a spurious failures=2, a 2 s retry on a healthy item).
        // Only stamped facts latch: the module's `onItemFailed` and a chain
        // rejection cover every load failure of the new item, so nothing is
        // lost by dropping this one.
        actions.push(trace('playerError', `dropped (settle pending): ${error.message}`, g));
        return { state: s, actions };
      }
      return { state: fail(s, g, error, 'retry', actions), actions };
    }
    case 'ready':
      return { state: reportReady(s, actions), actions };
    case 'retry-fired': {
      if (!s.retry || s.retry.g !== event.g) return { state: s, actions };
      const { reason } = s.retry;
      s = { ...s, retry: null };
      if (event.g !== s.sourceGeneration) return { state: s, actions };
      return { state: take(s, { type: 'take', reason: 'rebuild', detail: reason }, actions), actions };
    }
    case 'unmount': {
      const g = s.nextGeneration + 1;
      s = resetForGeneration({ ...s, nextGeneration: g, sourceGeneration: g, pendingTuneGeneration: null }, actions);
      return { state: s, actions };
    }
  }
}
