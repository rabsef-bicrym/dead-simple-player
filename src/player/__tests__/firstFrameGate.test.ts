import {
  RETRY_DELAYS_MS,
  SURFACE_ERROR_AFTER,
  createGateState,
  reduceGate,
  retryDelayMs,
  type GateAction,
  type GateEvent,
  type GateState,
} from '../firstFrameGate';

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
    take: () => actions.splice(0, actions.length),
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
    h.take();
    h.dispatch({ type: 'invalidate' });
    expect(h.state.sourceGeneration).toBe(8);
    expect(h.state.pendingTuneGeneration).toBe(8);
    expect(h.names()).toEqual(['gen invalidated g=8']);
    h.take();
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
    h.take();
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
    h.take();
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
    h.take();
    h.dispatch({ type: 'native-first-frame', g: 1, item: '3f1a', via: 'rfdKvo' });
    expect(h.names()).toEqual(['firstFrame i=3f1a via=rfdKvo accepted=yes', 'buffering', 'ready', 'buffering', 'first-frame']);
    expect(h.of('first-frame')).toEqual([{ type: 'first-frame', g: 1 }]);
  });

  it('a fire before settle is latched and replayed exactly once by the settle', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.take();
    h.dispatch({ type: 'native-first-frame', g: 1, item: '3f1a', via: 'advanced' });
    expect(h.state.pendingFirstFrame).toBe(1);
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.names()).toEqual(['firstFrame i=3f1a via=advanced accepted=latched']);
    h.take();
    h.dispatch({ type: 'settle', g: 1 });
    expect(h.of('first-frame')).toEqual([{ type: 'first-frame', g: 1 }]);
    expect(h.names()[0]).toBe('firstFrame replay latched fire delivered after settle');
    expect(h.state.pendingFirstFrame).toBeNull();
    // a second settle (impossible, but cheap to pin) replays nothing
    h.take();
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
      h.take();
      h.dispatch({ type: 'settle', g: h.state.sourceGeneration });
      expect(h.of('first-frame')).toHaveLength(0);
    }
  });

  it('health (readyToPlay / playingChange / timeUpdate) never emits first-frame and resets the ladder', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('x') });
    expect(h.state.failures).toBe(1);
    h.dispatch({ type: 'retry-fired', g: 1 });
    h.dispatch({ type: 'settle', g: 2 });
    h.take();
    h.dispatch({ type: 'ready' });
    h.dispatch({ type: 'ready' });
    expect(h.of('first-frame')).toHaveLength(0);
    expect(h.of('ready')).toHaveLength(1);
    expect(h.state.failures).toBe(0);
  });

  it('ready before settle reports nothing (the old item is still current)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.take();
    h.dispatch({ type: 'ready' });
    expect(h.actions).toEqual([]);
  });
});

describe('errors — latch, ladder, health', () => {
  it('an error before settle is latched and replayed at settle', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.take();
    h.dispatch({ type: 'status-error', g: 1, error: media('early') });
    expect(h.state.pendingError).toEqual({ g: 1, error: media('early') });
    expect(h.names()).toEqual(['playerError latched (settle pending): early']);
    h.take();
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

  it('a chain rejection settles then reaches the ladder (race-2 R6)', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.take();
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

  it('the delay table is [0, 2000, 4000, 8000, 15000, 30000] by failures-1, the last repeating (race-2 R8)', () => {
    expect(RETRY_DELAYS_MS).toEqual([0, 2000, 4000, 8000, 15000, 30000]);
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelayMs)).toEqual([0, 2000, 4000, 8000, 15000, 30000, 30000, 30000]);
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    const seen: number[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const g = h.state.sourceGeneration;
      h.dispatch({ type: 'settle', g });
      h.take();
      h.dispatch({ type: 'status-error', g, error: media(`e${i}`) });
      seen.push(h.of('schedule-retry')[0].delayMs);
      h.dispatch({ type: 'retry-fired', g });
    }
    expect(seen).toEqual([0, 2000, 4000, 8000, 15000, 30000, 30000, 30000]);
  });

  it(`the plate relabels after ${SURFACE_ERROR_AFTER} consecutive failures and attempts continue (R1, R4)`, () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    for (let i = 1; i <= 4; i += 1) {
      const g = h.state.sourceGeneration;
      h.dispatch({ type: 'settle', g });
      h.take();
      h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media(`e${i}`) });
      const errors = h.of('error');
      if (i < SURFACE_ERROR_AFTER) expect(errors).toHaveLength(0);
      else expect(errors).toEqual([{ type: 'error', error: { kind: 'recovery-exhausted', message: `e${i}` } }]);
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
    h.take();
    h.dispatch({ type: 'status-error', g: 1, error: media('b') });
    expect(h.actions).toEqual([]);
    expect(h.state.failures).toBe(1);
  });

  it('an error for another generation is traced stale and does nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.take();
    h.dispatch({ type: 'status-error', g: 7, error: media('old') });
    expect(h.names()).toEqual(['playerError stale g=7: old']);
    expect(h.state.failures).toBe(0);
  });

  it('a retry timer that fires for a superseded generation starts nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'status-error', g: 1, error: media('a') });
    h.dispatch({ type: 'invalidate' });                 // cancels the retry (cancel-retry action)
    expect(h.of('cancel-retry')).toHaveLength(1);
    h.take();
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.actions).toEqual([]);
  });
});

describe('FF-14 — attempts that end without a frame', () => {
  it('startPlayback → unbound rebuilds at 0 ms as attempt #2 reason=no-item', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.take();
    h.dispatch({ type: 'start-result', g: 1, result: 'unbound' });
    expect(h.names()).toEqual([
      'startPlayback unbound',
      'playerError media: no item after resolve failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
    expect(h.of('schedule-retry')[0]).toEqual({ type: 'schedule-retry', g: 1, delayMs: 0, reason: 'no-item' });
    h.take();
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.names()).toEqual(['bind-generation', 'attempt #2 reason=no-item', 'buffering', 'replace']);
    expect(h.state.sourceGeneration).toBe(2);
  });

  it('startPlayback → ok / adopted starts nothing new', () => {
    for (const result of ['ok', 'adopted'] as const) {
      const h = harness();
      h.dispatch({ type: 'take', reason: 'source' });
      h.dispatch({ type: 'settle', g: 1 });
      h.take();
      h.dispatch({ type: 'start-result', g: 1, result });
      expect(h.names()).toEqual([`startPlayback ${result}`]);
    }
  });

  it('startPlayback → stale is a failure on the ladder', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.take();
    h.dispatch({ type: 'start-result', g: 1, result: 'stale' });
    expect(h.of('schedule-retry')).toHaveLength(1);
  });

  it('an item lost before its first frame rebuilds as reason=item-lost', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.take();
    h.dispatch({ type: 'native-item-lost', g: 1, item: '3f1a' });
    expect(h.names()[0]).toBe('item lost i=3f1a');
    expect(h.of('schedule-retry')[0].reason).toBe('item-lost');
    h.dispatch({ type: 'retry-fired', g: 1 });
    expect(h.names()).toContain('attempt #2 reason=item-lost');
  });

  it('an item lost for a stale generation is only a row', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.take();
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
    h.take();
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:retune' });
    expect(h.names()).toEqual(['cancel-retry', 'bind-generation', 'attempt #2 reason=rejoin:retune', 'buffering', 'replace']);
    expect(h.state.sourceGeneration).toBe(2);
    expect(h.state.retry).toBeNull();
  });

  it('invalidate then rejoin (decision 16) runs one attempt under the invalidated generation', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.take();
    h.dispatch({ type: 'invalidate' });
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:retune' });
    expect(h.of('replace').map((a) => a.g)).toEqual([2]);
    expect(h.state.sourceGeneration).toBe(2);
    expect(h.state.pendingTuneGeneration).toBeNull();
  });

  it('rejoin with no source replaces nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source', hasSource: false });
    h.take();
    h.dispatch({ type: 'take', reason: 'rejoin', detail: 'rejoin:resume' });
    expect(h.of('replace')).toHaveLength(0);
  });
});
