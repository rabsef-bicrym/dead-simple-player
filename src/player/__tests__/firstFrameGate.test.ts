import {
  createGateState,
  reduceGate,
  type GateAction,
  type GateEvent,
  type GateState,
} from '../firstFrameGate';
import { JOIN_BACKOFF_MS, JOIN_SURFACE_AFTER, nextRetry } from '../pipelinePolicy';
import {
  __resetTuneTraceForTests,
  getTuneTraceDroppedCount,
  getTuneTraceSnapshot,
  traceBindGeneration,
  traceEvent,
  traceTuneStart,
} from '../../services/tuneTrace';

/** A surface stand-in: dispatches, keeps the state, collects every action. */
function harness(start = 0) {
  let state: GateState = createGateState(start);
  const actions: GateAction[] = [];
  const dispatch = (event: GateEvent) => {
    const result = reduceGate(state, event);
    state = result.state;
    actions.push(...result.actions);
    return result.actions;
  };
  return {
    dispatch,
    get state() { return state; },
    get actions() { return actions; },
    drain: () => actions.splice(0, actions.length),
    names: () => actions.map((a) => (a.type === 'trace' ? `${a.name}${a.detail ? ' ' + a.detail : ''}` : a.type)),
    of: <T extends GateAction['type']>(type: T) => actions.filter((a): a is Extract<GateAction, { type: T }> => a.type === type),
  };
}

const media = (message: string) => ({ kind: 'media' as const, message });

describe('generations', () => {
  it('the source effect allocates a generation, binds it and runs the chain', () => {
    const h = harness(10);
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.state.sourceGeneration).toBe(11);
    expect(h.state.nextGeneration).toBe(11);
    expect(h.state.settledGeneration).toBe(0);
    expect(h.names()).toEqual(['bind-generation', 'gen bound g=11', 'buffering', 'replace']);
    expect(h.of('replace')[0].g).toBe(11);
  });

  it('a cleared source settles at once and replaces nothing (R7)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source', hasSource: false });
    expect(h.state.settledGeneration).toBe(h.state.sourceGeneration);
    expect(h.of('replace')).toHaveLength(0);
    expect(h.of('buffering')).toEqual([{ type: 'buffering', on: false }]);
  });

  it('invalidate() allocates synchronously and the source effect takes that number instead of a new one', () => {
    const h = harness(6);
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'invalidate' });
    expect(h.state.sourceGeneration).toBe(8);
    expect(h.state.pendingTuneGeneration).toBe(8);
    expect(h.names()).toEqual(['bind-generation', 'gen invalidated g=8']);
    h.drain();
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.state.sourceGeneration).toBe(8);
    expect(h.state.pendingTuneGeneration).toBeNull();
    expect(h.names()).toEqual(['bind-generation', 'gen bound g=8', 'buffering', 'replace']);
  });

  it('race-2 R1: a fire carrying the previous generation, after invalidate() and before the source effect, is stale', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });          // g=1
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'invalidate' });                       // g=2, effect not yet flushed
    h.drain();
    h.dispatch({ type: 'native-first-frame', g: 1, item: '9c02', via: 'rfdKvo' });
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.names()).toEqual(['firstFrame i=9c02 via=rfdKvo accepted=stale current=2']);
  });

  it('every attempt is a new generation and every generation is bound', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    h.dispatch({ type: 'retry-fired', g: 1 });
    h.dispatch({ type: 'settle', g: 2 });
    h.dispatch({ type: 'status-error', g: 2, error: media('b') });
    h.dispatch({ type: 'retry-fired', g: 2 });
    expect(h.of('bind-generation').map((a) => a.g)).toEqual([1, 2, 3]);
    expect(h.of('replace').map((a) => a.g)).toEqual([1, 2, 3]);
    expect(h.state.attempts).toBe(3);
  });

  it('unmount bumps the generation so any later fact is stale', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'unmount' });
    h.drain();
    h.dispatch({ type: 'native-first-frame', g: 1, item: 'x', via: 'rfdKvo' });
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.state.sourceGeneration).toBe(2);
    expect(h.state.settledGeneration).toBe(0);
  });
});

describe('the first frame — latch and replay (FF-03)', () => {
  it('a native fire for the settled current generation reports once', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'native-first-frame', g: 1, item: '3f1a', via: 'rfdKvo' });
    expect(h.names()).toEqual(['firstFrame i=3f1a via=rfdKvo accepted=yes', 'buffering', 'ready', 'buffering', 'first-frame']);
    expect(h.of('first-frame')).toEqual([{ type: 'first-frame', g: 1 }]);
  });

  it('a fire before settle is latched and replayed exactly once by the settle', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'native-first-frame', g: 1, item: '3f1a', via: 'advanced' });
    expect(h.state.pendingFirstFrame).toBe(1);
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.names()).toEqual(['firstFrame i=3f1a via=advanced accepted=latched']);
    h.drain();
    h.dispatch({ type: 'settle', g: 1 });
    expect(h.of('first-frame')).toEqual([{ type: 'first-frame', g: 1 }]);
    expect(h.names()[0]).toBe('firstFrame replay latched fire delivered after settle');
    expect(h.state.pendingFirstFrame).toBeNull();
    // a second settle (impossible, but cheap to pin) replays nothing
    h.drain();
    h.dispatch({ type: 'settle', g: 1 });
    expect(h.of('first-frame')).toHaveLength(0);
  });

  it('onFirstFrame at most once per generation', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'native-first-frame', g: 1, item: 'a', via: 'rfdKvo' });
    h.dispatch({ type: 'native-first-frame', g: 1, item: 'a', via: 'rfdKvo' });
    expect(h.of('first-frame')).toHaveLength(1);
  });

  it('the latch is cleared by invalidate, the source effect, rejoin and rebuild', () => {
    for (const clear of ['invalidate', 'source', 'rejoin'] as const) {
      const h = harness();
      h.dispatch({ type: 'take', reason: 'source' });
      h.dispatch({ type: 'native-first-frame', g: 1, item: 'a', via: 'rfdKvo' });
      expect(h.state.pendingFirstFrame).toBe(1);
      if (clear === 'invalidate') h.dispatch({ type: 'invalidate' });
      else h.dispatch({ type: 'take', reason: clear });
      expect(h.state.pendingFirstFrame).toBeNull();
      h.drain();
      h.dispatch({ type: 'settle', g: h.state.sourceGeneration });
      expect(h.of('first-frame')).toHaveLength(0);
    }
  });

  it('progress (playingChange true / an advancing timeUpdate) never emits first-frame and never touches the ladder', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('x') });
    expect(h.state.failures).toBe(1);
    h.dispatch({ type: 'retry-fired', g: 1 });
    h.dispatch({ type: 'settle', g: 2 });
    h.drain();
    h.dispatch({ type: 'ready' });
    h.dispatch({ type: 'ready' });
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.of('ready')).toHaveLength(1);
    expect(h.of('buffering')).toEqual([{ type: 'buffering', on: false }, { type: 'buffering', on: false }]);
    // PW-10: a rung is climbed back only by sustained progress, which the join controller judges.
    expect(h.state.failures).toBe(1);
    h.dispatch({ type: 'native-first-frame', g: 2, item: 'a', via: 'rfdKvo' });
    expect(h.state.failures).toBe(1);
  });

  it('healthy resets the ladder once, with a row, and is silent when there is nothing to reset', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'healthy' });
    expect(h.actions).toEqual([]);
    h.dispatch({ type: 'status-error', g: 1, error: media('x') });
    h.dispatch({ type: 'retry-fired', g: 1 });
    h.dispatch({ type: 'settle', g: 2 });
    h.dispatch({ type: 'status-error', g: 2, error: media('y') });
    expect(h.state.failures).toBe(2);
    h.drain();
    h.dispatch({ type: 'healthy' });
    expect(h.names()).toEqual(['healthy failures reset from 2']);
    expect(h.state.failures).toBe(0);
  });

  it('ready before settle reports nothing (the old item is still current)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'ready' });
    expect(h.actions).toEqual([]);
  });
});

describe('errors — latch, ladder, health', () => {
  it('a native item failure before settle is latched and replayed at settle', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'native-item-failed', g: 1, item: 'a', error: media('early') });
    expect(h.state.pendingError).toEqual({ g: 1, error: media('early') });
    expect(h.names()).toEqual(['playerError latched (settle pending): early']);
    h.drain();
    h.dispatch({ type: 'settle', g: 1 });
    expect(h.names()).toEqual([
      'error replay latched error delivered after settle',
      'playerError media: early failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
    expect(h.state.pendingError).toBeNull();
  });

  it('expo\'s statusChange error before settle is dropped, never latched: its payload names no item', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });          // g=1
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'invalidate' });                       // g=2; the old item is still current natively
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    // The old item's error, stamped at arrival with the new generation.
    h.dispatch({ type: 'status-error', g: 2, error: media('old item died') });
    expect(h.names()).toEqual(['playerError dropped (settle pending): old item died']);
    expect(h.state.pendingError).toBeNull();
    h.drain();
    h.dispatch({ type: 'settle', g: 2 });
    expect(h.actions).toEqual([]);                            // nothing replays; attempt #1 stands
    expect(h.state.failures).toBe(0);
    // After settle the same row is a failure on the ladder.
    h.dispatch({ type: 'status-error', g: 2, error: media('real') });
    expect(h.state.failures).toBe(1);
    expect(h.of('schedule-retry')).toHaveLength(1);
  });

  it('a chain rejection settles then reaches the ladder (race-2 R6)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'chain-rejected', g: 1, message: 'load failed' });
    expect(h.state.settledGeneration).toBe(1);
    expect(h.names()).toEqual([
      'replaceAsync reject load failed',
      'playerError media: load failed failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
  });

  it('the delay table is the policy\'s [0, 2000, 4000, 8000, 15000, 30000] by failures-1, the last repeating (race-2 R8)', () => {
    expect(JOIN_BACKOFF_MS).toEqual([0, 2000, 4000, 8000, 15000, 30000]);
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => nextRetry(n).delayMs)).toEqual([0, 2000, 4000, 8000, 15000, 30000, 30000, 30000]);
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    const seen: number[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const g = h.state.sourceGeneration;
      h.dispatch({ type: 'settle', g });
      h.drain();
      h.dispatch({ type: 'status-error', g, error: media(`e${i}`) });
      seen.push(h.of('schedule-retry')[0].delayMs);
      h.dispatch({ type: 'retry-fired', g });
    }
    expect(seen).toEqual([0, 2000, 4000, 8000, 15000, 30000, 30000, 30000]);
  });

  it(`the plate relabels after ${JOIN_SURFACE_AFTER} consecutive failures and attempts continue (R1, R4)`, () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    for (let i = 1; i <= 4; i += 1) {
      const g = h.state.sourceGeneration;
      h.dispatch({ type: 'settle', g });
      h.drain();
      h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media(`e${i}`) });
      const errors = h.of('error');
      if (i < JOIN_SURFACE_AFTER) expect(errors).toHaveLength(0);
      else expect(errors).toEqual([{ type: 'error', error: { kind: 'recovery-exhausted', message: `e${i}`, terminal: false } }]);
      expect(h.of('schedule-retry')).toHaveLength(1);
      h.dispatch({ type: 'retry-fired', g });
    }
    expect(h.state.attempts).toBe(5);
  });

  it('a second error while a retry is armed changes nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    h.drain();
    h.dispatch({ type: 'status-error', g: 1, error: media('b') });
    expect(h.actions).toEqual([]);
    expect(h.state.failures).toBe(1);
  });

  it('an error for another generation is traced stale and does nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'status-error', g: 7, error: media('old') });
    expect(h.names()).toEqual(['playerError stale g=7: old']);
    expect(h.state.failures).toBe(0);
  });

  it('cancel-retry drops the armed rung with the action that clears its timer, and is a no-op with none armed', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    expect(h.state.retry).toEqual({ g: 1, reason: 'retry' });
    h.drain();
    h.dispatch({ type: 'cancel-retry' });
    expect(h.names()).toEqual(['cancel-retry']);
    expect(h.state.retry).toBeNull();
    expect(h.state.failures).toBe(1);                    // the failure stays counted
    h.drain();
    h.dispatch({ type: 'cancel-retry' });
    expect(h.actions).toEqual([]);
    h.dispatch({ type: 'retry-fired', g: 1 });           // a timer that beat the clear starts nothing
    expect(h.of('replace')).toHaveLength(0);
  });

  it('a retry timer that fires for a superseded generation starts nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    h.dispatch({ type: 'invalidate' });                 // cancels the retry (cancel-retry action)
    expect(h.of('cancel-retry')).toHaveLength(1);
    h.drain();
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.actions).toEqual([]);
  });
});

describe('FF-14 — attempts that end without a frame', () => {
  it('startPlayback → unbound rebuilds at 0 ms as attempt #2 reason=no-item', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'start-result', g: 1, result: 'unbound' });
    expect(h.names()).toEqual([
      'startPlayback unbound',
      'playerError media: no item after resolve failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
    expect(h.of('schedule-retry')[0]).toEqual({ type: 'schedule-retry', g: 1, delayMs: 0, reason: 'no-item' });
    h.drain();
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.names()).toEqual(['bind-generation', 'attempt #2 reason=no-item', 'buffering', 'replace']);
    expect(h.state.sourceGeneration).toBe(2);
  });

  it('startPlayback → ok / adopted starts nothing new', () => {
    for (const result of ['ok', 'adopted'] as const) {
      const h = harness();
      h.dispatch({ type: 'take', reason: 'source' });
      h.dispatch({ type: 'settle', g: 1 });
      h.drain();
      h.dispatch({ type: 'start-result', g: 1, result });
      expect(h.names()).toEqual([`startPlayback ${result}`]);
    }
  });

  it('startPlayback → stale is a failure on the ladder', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'start-result', g: 1, result: 'stale' });
    expect(h.of('schedule-retry')).toHaveLength(1);
  });

  it('startPlayback → failed is a failure on the ladder: an adopted item that died before settle has no other word', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'start-result', g: 1, result: 'failed' });
    expect(h.names()).toEqual([
      'startPlayback failed',
      'playerError media: item failed before start failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
  });

  it('startPlayback → failed after onItemFailed already armed the retry changes nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'native-item-failed', g: 1, item: 'a', error: media('died') });   // latched
    h.dispatch({ type: 'settle', g: 1 });                                                 // replayed: the retry is armed
    h.drain();
    h.dispatch({ type: 'start-result', g: 1, result: 'failed' });
    expect(h.names()).toEqual(['startPlayback failed']);
    expect(h.state.failures).toBe(1);
    expect(h.of('schedule-retry')).toHaveLength(0);
  });

  it('an item lost before its first frame rebuilds as reason=item-lost', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'native-item-lost', g: 1, item: '3f1a' });
    expect(h.names()[0]).toBe('item lost i=3f1a');
    expect(h.of('schedule-retry')[0].reason).toBe('item-lost');
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.names()).toContain('attempt #2 reason=item-lost');
  });

  it('an item lost for a stale generation is only a row', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'native-item-lost', g: 9, item: 'old' });
    expect(h.names()).toEqual(['item lost i=old']);
  });
});

describe('rejoin', () => {
  it('rejoin is a new generation under the same source and cancels a pending retry (race-2 R5)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    h.drain();
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:retune' });
    expect(h.names()).toEqual(['cancel-retry', 'bind-generation', 'attempt #2 reason=rejoin:retune', 'buffering', 'replace']);
    expect(h.state.sourceGeneration).toBe(2);
    expect(h.state.retry).toBeNull();
  });

  it('invalidate then rejoin (decision 16) runs one attempt under the invalidated generation', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.dispatch({ type: 'invalidate' });
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:retune' });
    expect(h.of('replace').map((a) => a.g)).toEqual([2]);
    expect(h.state.sourceGeneration).toBe(2);
    expect(h.state.pendingTuneGeneration).toBeNull();
  });

  it('rejoin with no source replaces nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source', hasSource: false });
    h.drain();
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:resume' });
    expect(h.of('replace')).toHaveLength(0);
  });
});

// ── The ring, fed as the surface feeds it (no mocks): every row of a tune files under it ──

describe('the rows a tune writes all find it (ff-spec §10 checks 4 and 11)', () => {
  /** The surface's `perform`, reduced to what routes rows; every other action is a no-op here. */
  function surface(start = 0) {
    const h = harness(start);
    const dispatch = (event: GateEvent) => {
      for (const a of h.dispatch(event)) {
        if (a.type === 'trace') traceEvent(a.name, a.detail, { g: a.g });
        else if (a.type === 'bind-generation') traceBindGeneration(a.g);
      }
    };
    /** A listener row, stamped with the generation current at arrival (`arrivalGeneration()`). */
    const listenerRow = (name: string, detail: string) => traceEvent(name, detail, { g: h.state.sourceGeneration });
    return { dispatch, listenerRow, get state() { return h.state; } };
  }
  const rows = (index: number) => getTuneTraceSnapshot()[index].events.map((e) => e.name);
  const gens = (index: number) => getTuneTraceSnapshot()[index].gens;

  beforeEach(() => {
    let t = Date.parse('2026-09-27T04:27:15.472Z');
    __resetTuneTraceForTests(() => (t += 1));
  });

  it('a second tune from a mounted surface: gen invalidated, a listener row in the window and gen bound all file under it, dropped=0', () => {
    const s = surface();
    // tune 1: mount, settle, fire
    traceTuneStart('A', { origin: 'power', opening: true });
    s.dispatch({ type: 'take', reason: 'source' });
    s.dispatch({ type: 'settle', g: 1 });
    s.dispatch({ type: 'native-first-frame', g: 1, item: 'a1', via: 'rfdKvo' });
    // tune 2, as tuneTo does it: the record first, then invalidate, then React's effect
    traceTuneStart('B', { origin: 'remote', opening: false });
    s.dispatch({ type: 'invalidate' });
    s.listenerRow('statusChange', 'loading');
    s.dispatch({ type: 'take', reason: 'source' });
    expect(rows(0)).toEqual(['TUNE START', 'gen invalidated', 'statusChange', 'gen bound']);
    expect(gens(0)).toEqual([2]);
    expect(rows(1)).toEqual(['TUNE START', 'gen bound', 'firstFrame']);
    expect(getTuneTraceDroppedCount()).toBe(0);
  });

  it('the same-channel rejoin (decision 16): TUNE START → gen invalidated → rejoin retune → attempt, under one tune, dropped=0', () => {
    const s = surface();
    traceTuneStart('A', { origin: 'remote', opening: true });
    s.dispatch({ type: 'take', reason: 'source' });
    s.dispatch({ type: 'settle', g: 1 });
    s.dispatch({ type: 'native-item-failed', g: 1, item: 'a1', error: media('404') });
    // the arrival on the channel in error
    traceTuneStart('A', { origin: 'remote', opening: false });
    s.dispatch({ type: 'invalidate' });
    traceEvent('rejoin', 'retune', { g: s.state.sourceGeneration });   // the surface's rejoin(), before its take
    s.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:retune' });
    expect(rows(0)).toEqual(['TUNE START', 'gen invalidated', 'rejoin', 'attempt']);
    expect(getTuneTraceSnapshot()[0].events.map((e) => e.detail)).toEqual(['A', 'g=2', 'retune', '#2 reason=rejoin:retune']);
    expect(gens(0)).toEqual([2]);
    expect(getTuneTraceDroppedCount()).toBe(0);
  });

  it('a fire for the old item arriving between invalidate and the take is the old tune\'s row, marked stale', () => {
    const s = surface();
    traceTuneStart('A');
    s.dispatch({ type: 'take', reason: 'source' });
    s.dispatch({ type: 'settle', g: 1 });
    traceTuneStart('B');
    s.dispatch({ type: 'invalidate' });
    s.dispatch({ type: 'native-first-frame', g: 1, item: 'a1', via: 'rfdKvo' });
    s.dispatch({ type: 'take', reason: 'source' });
    expect(rows(0)).toEqual(['TUNE START', 'gen invalidated', 'gen bound']);
    const old = getTuneTraceSnapshot()[1];
    expect(old.after.map((e) => `${e.name} ${e.detail}`)).toEqual(['firstFrame i=a1 via=rfdKvo accepted=stale current=2']);
    expect(getTuneTraceDroppedCount()).toBe(0);
  });
});
