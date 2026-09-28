/**
 * The native join controller — the surface's whole policy as one pure
 * reducer: `(state, event, now) → { state, actions }`.
 *
 * It composes the first-frame gate (`firstFrameGate.ts`: generations, the
 * latch, the ladder) with what the gate does not know: whether the set is
 * joining, live or paused, who paused it, whether the item died while it was
 * paused, and whether progress has been sustained long enough to call the
 * signal healthy. There is one ladder — the gate's; this file decides when
 * the ladder may run (never while paused: a paused set stays paused,
 * decision 17) and when its budget replenishes (`healthy`, after
 * `HEALTHY_AFTER_MS` of progress, PW-10).
 *
 * The clock is an argument. Nothing here schedules anything; the surface
 * stamps every event with `Date.now()` at arrival and the reducer compares
 * stamps: the pause edge against the resume edge (`decideResume`), an
 * interruption against a pause (`PAUSE_ATTRIBUTION_MS`), the first progress
 * against the latest (`HEALTHY_AFTER_MS`). Timers decide nothing; the one
 * timer in the surface is the ladder's, and it starts a fetch.
 *
 * The pause edge is AVPlayer's own `timeControlStatus == .paused`, delivered
 * by the module's `onTimeControl` (`src=tcs`), never expo's `playingChange
 * false`, which is also what a stall looks like. A pause the app asked for
 * (`playing` false, a cleared source, the unmount, the `expect()` across a
 * swap) never reaches `paused`: the event carries what the surface wanted
 * and the gate says whether the generation was settled.
 */
import {
  createGateState,
  reduceGate,
  type GateAction,
  type GateEvent,
  type GateState,
} from './firstFrameGate';
import {
  HEALTHY_AFTER_MS,
  PAUSE_ATTRIBUTION_MS,
  decideResume,
  type PauseCause,
  type ResumeReason,
} from './pipelinePolicy';

export type JoinPhase = 'idle' | 'joining' | 'live' | 'paused';

export interface JoinState {
  gate: GateState;
  phase: JoinPhase;
  /** The stamp of the first progress since the last join, resume or stall; null until progress. */
  progressSince: number | null;
  /** The last `currentTime` a `timeUpdate` carried; progress is a larger one. Forgotten at every edge — join, pause, resume — so the first sample after one only records. */
  lastTime: number | null;
  pausedAt: number | null;
  pauseCause: PauseCause | null;
  /** The item failed, or an armed retry was cancelled, while paused: only a fresh item can play. */
  failedWhilePaused: boolean;
  /** The last `interruption-began`, for attributing a pause edge either side of it. */
  interruptionAt: number | null;
  /**
   * The last failure of the current generation while not paused, for
   * attributing a pause edge either side of it: AVPlayer pauses a failed
   * item, and which KVO runs first — the item's `.failed` or the player's
   * `.paused` — is not documented. The payload's `itemStatus` names the
   * first order; this stamp and `pausedAt` name the second.
   */
  failedAt: number | null;
}

export type JoinEvent =
  | GateEvent
  /**
   * `playingChange true` (no time) or a `timeUpdate` (its `currentTime`).
   * While paused only the former is a resume. AVFoundation's periodic time
   * observer is "also invoked whenever time jumps and whenever playback
   * starts or stops" (expo-video emits every invocation as a `timeUpdate`,
   * VideoPlayerObserver.swift:329-343), so the sample that follows the pause
   * edge — or a pre-pause tick the bridge delivered after it — would read as
   * the timebase running again and un-pause the set within one event turn.
   */
  | { type: 'progress'; currentTime?: number }
  /** `playingChange false`: the timebase stopped — a stall or a pause; progress is no longer sustained. */
  | { type: 'stalled' }
  /**
   * The module's `onTimeControl status=paused` for the item bound to `g`.
   * `playing` is the prop at arrival; `itemFailed` is the item's status in the
   * same payload (AVPlayer pauses a failed item — that is the error path's).
   * The cause is decided here, from `interruptionAt` and `failedAt`.
   */
  | { type: 'paused-unrequested'; g: number; playing: boolean; itemFailed: boolean }
  /** AVAudioSession's interruption began. */
  | { type: 'interruption-began' }
  /** A reason to play again; ignored unless the set is paused. */
  | { type: 'resume-edge'; reason: ResumeReason; shouldResume?: boolean };

export type JoinAction =
  | GateAction
  /** `player.play()` on the settled generation. */
  | { type: 'play' }
  /** `seekToLiveEdge()` then `player.play()`: the playhead left the window, the session is presumed alive. */
  | { type: 'seek-live-then-play' }
  /** `onPlaybackPaused(at, cause)`. */
  | { type: 'paused'; at: number; cause: PauseCause }
  /** `onProgress(g)`: the clock advanced. */
  | { type: 'progress'; g: number };

export interface JoinResult { state: JoinState; actions: JoinAction[] }

export function createJoinState(nextGeneration: number): JoinState {
  return {
    gate: createGateState(nextGeneration),
    phase: 'idle',
    progressSince: null,
    lastTime: null,
    pausedAt: null,
    pauseCause: null,
    failedWhilePaused: false,
    interruptionAt: null,
    failedAt: null,
  };
}

const ERROR_EVENTS = new Set<GateEvent['type']>(['native-item-failed', 'native-item-lost', 'status-error', 'chain-rejected', 'start-result']);

function trace(name: string, detail: string, g: number): GateAction {
  return { type: 'trace', name, detail, g };
}

function isError(event: GateEvent): event is Extract<GateEvent, { g: number }> {
  if (!ERROR_EVENTS.has(event.type)) return false;
  return event.type !== 'start-result' || (event.result !== 'ok' && event.result !== 'adopted');
}

function errorMessage(event: Extract<GateEvent, { g: number }>): string {
  switch (event.type) {
    case 'native-item-failed':
    case 'status-error':
      return event.error.message;
    case 'chain-rejected':
      return event.message;
    case 'start-result':
      return `startPlayback ${event.result}`;
    case 'native-item-lost':
      return 'item lost';
    default:
      return event.type;
  }
}

/** What leaving the paused phase, or starting a fresh join, forgets. */
function clearPause(s: JoinState): JoinState {
  return { ...s, pausedAt: null, pauseCause: null, failedWhilePaused: false, progressSince: null, lastTime: null, failedAt: null };
}

function gateEvent(s: JoinState, event: GateEvent, actions: JoinAction[]): JoinState {
  const result = reduceGate(s.gate, event);
  actions.push(...result.actions);
  let next: JoinState = { ...s, gate: result.state };
  switch (event.type) {
    case 'invalidate':
      next = { ...clearPause(next), phase: 'joining' };
      break;
    case 'take':
      next = { ...clearPause(next), phase: result.state.hasSource ? 'joining' : 'idle' };
      break;
    case 'unmount':
      next = { ...clearPause(next), phase: 'idle' };
      break;
    case 'retry-fired':
      // The gate's rebuild is a take under a new generation: nothing of the old one's rides along.
      if (result.state.sourceGeneration !== s.gate.sourceGeneration) next = { ...clearPause(next), phase: 'joining' };
      break;
    default:
      if (result.actions.some((a) => a.type === 'first-frame')) next = { ...next, phase: 'live' };
  }
  return next;
}

/** The phase a resume returns to: the picture was up, or the join was still in progress. */
function phaseAfterResume(s: JoinState): JoinPhase {
  return s.gate.firstFrameReported ? 'live' : 'joining';
}

export function reduceJoin(state: JoinState, event: JoinEvent, now: number): JoinResult {
  const actions: JoinAction[] = [];
  let s = state;
  const g = s.gate.sourceGeneration;
  switch (event.type) {
    case 'progress': {
      if (s.gate.settledGeneration === 0 || s.gate.settledGeneration !== g) return { state: s, actions };
      if (event.currentTime != null) {
        const advanced = s.lastTime != null && event.currentTime > s.lastTime;
        s = { ...s, lastTime: event.currentTime };
        // A sample while paused is the stop sample, a seek, or a tick the
        // bridge delivered late: it records the clock and decides nothing.
        if (!advanced || s.phase === 'paused') return { state: s, actions };
      }
      if (s.phase === 'paused') {
        // `timeControlStatus == .playing` on a paused set: an outside play()
        // the module could not attribute. The tiers still apply.
        return reduceJoin(s, { type: 'resume-edge', reason: 'remote-play' }, now);
      }
      s = gateEvent(s, { type: 'ready' }, actions);
      if (s.phase !== 'live' && s.phase !== 'joining') return { state: s, actions };
      actions.push({ type: 'progress', g });
      const since = s.progressSince ?? now;
      s = { ...s, progressSince: since };
      if (now - since >= HEALTHY_AFTER_MS && s.gate.failures > 0) s = gateEvent(s, { type: 'healthy' }, actions);
      return { state: s, actions };
    }
    case 'stalled':
      return { state: { ...s, progressSince: null }, actions };
    case 'paused-unrequested': {
      if (event.g !== g || s.gate.settledGeneration !== g || !s.gate.hasSource) return { state: s, actions };
      if (!event.playing || event.itemFailed || s.phase === 'paused') return { state: s, actions };
      if (s.failedAt != null && now - s.failedAt <= PAUSE_ATTRIBUTION_MS) {
        // The player's `.paused` behind a failure it has already reported:
        // the failure's own pause, whatever `itemStatus` read at the edge.
        // Not a pause — the ladder is running and stays armed.
        actions.push(trace('paused', `cause=failure (failed ${now - s.failedAt}ms before the edge)`, g));
        return { state: s, actions };
      }
      const nearInterruption = s.interruptionAt != null && now - s.interruptionAt <= PAUSE_ATTRIBUTION_MS;
      const cause: PauseCause = nearInterruption ? 'interruption' : 'user';
      s = { ...s, phase: 'paused', pausedAt: now, pauseCause: cause, failedWhilePaused: false, progressSince: null, lastTime: null };
      actions.push(trace('paused', `cause=${cause}`, g));
      actions.push({ type: 'paused', at: now, cause });
      if (s.gate.retry) {
        // A rung was armed for this generation: it would start an attempt
        // under a pause nobody lifted. The resume rejoins instead.
        s = gateEvent(s, { type: 'cancel-retry' }, actions);
        actions.push(trace('retry cancelled', 'paused', g));
        s = { ...s, failedWhilePaused: true };
      }
      return { state: s, actions };
    }
    case 'interruption-began': {
      s = { ...s, interruptionAt: now };
      if (s.phase === 'paused' && s.pausedAt != null && s.pauseCause === 'user' && now - s.pausedAt <= PAUSE_ATTRIBUTION_MS) {
        actions.push(trace('paused', 'cause=interruption (re-attributed)', g));
        s = { ...s, pauseCause: 'interruption' };
      }
      return { state: s, actions };
    }
    case 'resume-edge': {
      if (s.phase !== 'paused') return { state: s, actions };
      const decision = decideResume({
        pausedAt: s.pausedAt,
        now,
        cause: s.pauseCause,
        reason: event.reason,
        shouldResume: event.shouldResume,
        failedWhilePaused: s.failedWhilePaused,
      });
      const elapsed = s.pausedAt == null ? '?' : String(now - s.pausedAt);
      actions.push(trace('resume', `reason=${event.reason} cause=${s.pauseCause ?? '-'} elapsed=${elapsed}ms failed=${s.failedWhilePaused} → ${decision}`, g));
      switch (decision) {
        case 'stay-paused':
          return { state: s, actions };
        case 'play':
          actions.push({ type: 'play' });
          return { state: { ...clearPause(s), phase: phaseAfterResume(s) }, actions };
        case 'seek-live-then-play':
          actions.push({ type: 'seek-live-then-play' });
          return { state: { ...clearPause(s), phase: phaseAfterResume(s) }, actions };
        case 'rejoin':
          // A fresh generation from the channel URL: the item is dead, or old enough to be.
          s = gateEvent(clearPause(s), { type: 'take', reason: 'rejoin', detail: `rejoin:resume:${event.reason}` }, actions);
          return { state: s, actions };
      }
      return { state: s, actions };
    }
    default: {
      if (isError(event) && event.g === g) {
        if (s.phase === 'paused') {
          const sincePause = s.pausedAt == null ? Infinity : now - s.pausedAt;
          if (s.pauseCause === 'user' && sincePause <= PAUSE_ATTRIBUTION_MS) {
            // The player's `.paused` KVO ran before the item's `.failed`: the
            // edge read itemStatus=ready and was taken for a person's pause.
            // This failure is what paused it. The pause is withdrawn and the
            // ladder runs — otherwise a mid-programme cut (decision 6(c))
            // would sit as `paused cause=user` until a Now Playing press.
            actions.push(trace('paused', `cause=failure (re-attributed, failed ${sincePause}ms after the edge)`, g));
            s = { ...clearPause(s), phase: phaseAfterResume(s), failedAt: now };
            return { state: gateEvent(s, event, actions), actions };
          }
          // A paused set stays paused (decision 17): the ladder does not run,
          // the plate does not relabel; the resume edge rejoins.
          actions.push(trace('playerError', `held while paused: ${errorMessage(event)}`, g));
          return { state: { ...s, failedWhilePaused: true }, actions };
        }
        s = { ...s, failedAt: now };
      }
      if (s.phase === 'paused' && event.type === 'retry-fired') return { state: s, actions };
      return { state: gateEvent(s, event, actions), actions };
    }
  }
}
