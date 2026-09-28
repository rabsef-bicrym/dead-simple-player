import { createJoinState, reduceJoin, type JoinAction, type JoinEvent, type JoinState } from '../nativeJoinController';
import { HEALTHY_AFTER_MS, PAUSE_ATTRIBUTION_MS, RESUME_PLAY_MAX_MS, RESUME_SEEK_MAX_MS } from '../pipelinePolicy';

/** A surface stand-in with a clock the test moves. */
function harness(start = 0) {
  let state: JoinState = createJoinState(start);
  let clock = 1_000_000;
  const actions: JoinAction[] = [];
  const dispatch = (event: JoinEvent) => {
    const result = reduceJoin(state, event, clock);
    state = result.state;
    actions.push(...result.actions);
    return result.actions;
  };
  const h = {
    dispatch,
    get state() { return state; },
    get now() { return clock; },
    get actions() { return actions; },
    at: (t: number) => { clock = t; },
    advance: (ms: number) => { clock += ms; },
    drain: () => actions.splice(0, actions.length),
    names: () => actions.map((a) => (a.type === 'trace' ? `${a.name}${a.detail ? ' ' + a.detail : ''}` : a.type)),
    of: <T extends JoinAction['type']>(type: T) => actions.filter((a): a is Extract<JoinAction, { type: T }> => a.type === type),
    /** The source effect, settle and a witnessed first frame: a live picture on generation `g`. */
    live: () => {
      dispatch({ type: 'take', reason: 'source' });
      const g = state.gate.sourceGeneration;
      dispatch({ type: 'settle', g });
      dispatch({ type: 'native-first-frame', g, item: 'i', via: 'rfdKvo' });
      dispatch({ type: 'progress' });
      actions.splice(0, actions.length);
      return g;
    },
    /** Half a second of expo's clock: one advancing timeUpdate. */
    tick: (t: number) => dispatch({ type: 'progress', currentTime: t }),
    pause: (over: Partial<Extract<JoinEvent, { type: 'paused-unrequested' }>> = {}) => dispatch({
      type: 'paused-unrequested', g: state.gate.sourceGeneration, playing: true, itemFailed: false, ...over,
    }),
  };
  return h;
}

const media = (message: string) => ({ kind: 'media' as const, message });

describe('phase', () => {
  it('idle → joining on take, live on the first frame, idle on unmount or a cleared source', () => {
    const h = harness();
    expect(h.state.phase).toBe('idle');
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.state.phase).toBe('joining');
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'native-first-frame', g: 1, item: 'a', via: 'rfdKvo' });
    expect(h.state.phase).toBe('live');
    h.dispatch({ type: 'invalidate' });
    expect(h.state.phase).toBe('joining');
    h.dispatch({ type: 'take', reason: 'source', hasSource: false });
    expect(h.state.phase).toBe('idle');
    h.dispatch({ type: 'unmount' });
    expect(h.state.phase).toBe('idle');
  });

  it('every gate event passes through and its actions come back unchanged', () => {
    const h = harness(4);
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.names()).toEqual(['bind-generation', 'gen bound g=5', 'buffering', 'replace']);
    expect(h.state.gate.sourceGeneration).toBe(5);
  });
});

describe('progress and health (NP-02, PW-10)', () => {
  it('playingChange true is progress; a timeUpdate is progress only when the clock advanced', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.drain();
    h.tick(3.0);                                             // first sample: recorded, not yet advancing
    expect(h.of('progress')).toHaveLength(0);
    expect(h.of('buffering')).toHaveLength(0);
    h.tick(3.0);
    expect(h.of('progress')).toHaveLength(0);
    h.tick(3.5);
    expect(h.of('progress')).toEqual([{ type: 'progress', g: 1 }]);
    expect(h.of('buffering')).toEqual([{ type: 'buffering', on: false }]);
    expect(h.of('ready')).toHaveLength(1);                   // onReady once per generation
    h.drain();
    h.dispatch({ type: 'progress' });
    expect(h.of('progress')).toHaveLength(1);
    expect(h.of('ready')).toHaveLength(0);
  });

  it('progress before settle is the old item\'s and reports nothing', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.drain();
    h.dispatch({ type: 'progress' });
    h.tick(1); h.tick(2);
    expect(h.actions).toEqual([]);
  });

  it(`the ladder replenishes after ${HEALTHY_AFTER_MS} ms of sustained progress, not on the first frame, and a stall restarts the clock`, () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.dispatch({ type: 'native-item-failed', g: 1, item: 'a', error: media('cold') });
    h.dispatch({ type: 'retry-fired', g: 1 });
    h.dispatch({ type: 'settle', g: 2 });
    h.dispatch({ type: 'native-first-frame', g: 2, item: 'b', via: 'rfdKvo' });
    expect(h.state.gate.failures).toBe(1);
    h.drain();
    let t = 0;
    for (let i = 0; i < 6; i += 1) { h.advance(500); h.tick(t += 0.5); }   // 3 s of progress
    expect(h.state.gate.failures).toBe(1);
    h.dispatch({ type: 'stalled' });                          // buffering: progress is no longer sustained
    for (let i = 0; i < 8; i += 1) { h.advance(500); h.tick(t += 0.5); }   // 4 s more
    expect(h.state.gate.failures).toBe(1);
    for (let i = 0; i < 3; i += 1) { h.advance(500); h.tick(t += 0.5); }   // crosses 5 s since the stall
    expect(h.state.gate.failures).toBe(0);
    expect(h.names().filter((n) => n.startsWith('healthy'))).toEqual(['healthy failures reset from 1']);
  });
});

describe('the pause edge', () => {
  it('a tcs pause of the settled generation while playing is wanted is an unrequested pause, reported once', () => {
    const h = harness();
    const g = h.live();
    h.at(2_000_000);
    h.pause();
    expect(h.state.phase).toBe('paused');
    expect(h.state.pausedAt).toBe(2_000_000);
    expect(h.state.pauseCause).toBe('user');
    expect(h.names()).toEqual(['paused cause=user', 'paused']);
    expect(h.of('paused')).toEqual([{ type: 'paused', at: 2_000_000, cause: 'user' }]);
    h.drain();
    h.pause();
    expect(h.actions).toEqual([]);
    expect(h.state.gate.sourceGeneration).toBe(g);
  });

  it('a pause the app asked for, a pause of a failed item, a pause before settle, and a stale item\'s pause are not pauses', () => {
    const h = harness();
    h.live();
    h.pause({ playing: false });
    expect(h.state.phase).toBe('live');
    h.pause({ itemFailed: true });
    expect(h.state.phase).toBe('live');
    h.pause({ g: 99 });
    expect(h.state.phase).toBe('live');
    h.dispatch({ type: 'invalidate' });
    h.dispatch({ type: 'take', reason: 'source' });           // g=2, not yet settled: the expect() pause lands here
    h.pause();
    expect(h.state.phase).toBe('joining');
    h.dispatch({ type: 'take', reason: 'source', hasSource: false });
    h.pause();
    expect(h.state.phase).toBe('idle');
    expect(h.of('paused')).toHaveLength(0);
  });

  it('a stall is not a pause: playingChange false alone changes no phase', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'stalled' });
    expect(h.state.phase).toBe('live');
    expect(h.of('paused')).toHaveLength(0);
  });

  it(`an interruption within ${PAUSE_ATTRIBUTION_MS} ms names the cause, in either order`, () => {
    const a = harness();
    a.live();
    a.dispatch({ type: 'interruption-began' });
    a.advance(300);
    a.pause();
    expect(a.state.pauseCause).toBe('interruption');

    const b = harness();
    b.live();
    b.pause();
    b.advance(300);
    b.dispatch({ type: 'interruption-began' });
    expect(b.state.pauseCause).toBe('interruption');
    expect(b.names()).toContain('paused cause=interruption (re-attributed)');

    // The window is for the KVO that lands after a brief interruption's
    // ended; while one is open the distance does not matter (SI-02, below).
    const c = harness();
    c.live();
    c.dispatch({ type: 'interruption-began' });
    c.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: false });
    c.advance(PAUSE_ATTRIBUTION_MS + 1);
    c.pause();
    expect(c.state.pauseCause).toBe('user');
  });

  it('a retry armed when the pause lands is cancelled; the resume rejoins', () => {
    const h = harness();
    const g = h.live();
    h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('blip') });
    expect(h.state.gate.retry).not.toBeNull();
    h.advance(PAUSE_ATTRIBUTION_MS + 1);                      // past the failure's own pause edge
    h.drain();
    h.pause();
    expect(h.of('cancel-retry')).toHaveLength(1);
    expect(h.state.gate.retry).toBeNull();
    expect(h.state.failedWhilePaused).toBe(true);
    h.dispatch({ type: 'retry-fired', g });                  // a timer that beat the cancel starts nothing
    expect(h.of('replace')).toHaveLength(0);
    h.drain();
    h.advance(1_000);
    h.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(h.of('replace')).toHaveLength(1);
    expect(h.state.phase).toBe('joining');
  });
});

describe('a failure beside the pause edge (either KVO order)', () => {
  it('pause then fail within 2 s: the pause is withdrawn and the ladder runs', () => {
    const h = harness();
    const g = h.live();
    h.pause();                                                 // the player's .paused KVO ran first: itemStatus read ready
    expect(h.state.phase).toBe('paused');
    h.advance(300);
    h.drain();
    h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('302 to master') });
    expect(h.names()).toEqual([
      'paused cause=failure (re-attributed, failed 300ms after the edge)',
      'playerError media: 302 to master failures=1',
      'buffering',
      'retry scheduled in=0ms',
      'schedule-retry',
    ]);
    expect(h.of('schedule-retry')).toEqual([{ type: 'schedule-retry', g, delayMs: 0, reason: 'retry' }]);
    expect(h.state.phase).toBe('live');
    expect(h.state.pausedAt).toBeNull();
    expect(h.state.failedWhilePaused).toBe(false);
    expect(h.state.gate.failures).toBe(1);
    h.drain();
    h.pause();                                                 // the same failure's edge, delivered again after the fail
    expect(h.names()).toEqual(['paused cause=failure (failed 0ms before the edge)']);
    expect(h.state.phase).toBe('live');
    h.dispatch({ type: 'retry-fired', g });
    expect(h.of('replace')).toHaveLength(1);
  });

  it('pause then fail within 2 s during the join returns to joining, not live', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.pause();
    h.advance(1_000);
    h.dispatch({ type: 'status-error', g: 1, error: media('expo') });
    expect(h.state.phase).toBe('joining');
    expect(h.of('schedule-retry')).toHaveLength(1);
  });

  it('fail then pause within 2 s: the edge is the failure\'s own pause; the armed rung stays armed', () => {
    const h = harness();
    const g = h.live();
    h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('blip') });
    expect(h.of('schedule-retry')).toHaveLength(1);
    h.advance(300);
    h.drain();
    h.pause();                                                 // itemStatus read ready at the tcs edge
    expect(h.names()).toEqual(['paused cause=failure (failed 300ms before the edge)']);
    expect(h.of('paused')).toHaveLength(0);
    expect(h.of('cancel-retry')).toHaveLength(0);
    expect(h.state.phase).toBe('live');
    expect(h.state.pausedAt).toBeNull();
    expect(h.state.gate.retry).not.toBeNull();
    h.drain();
    h.dispatch({ type: 'retry-fired', g });
    expect(h.of('replace')).toEqual([{ type: 'replace', g: g + 1 }]);
    expect(h.state.failedAt).toBeNull();                       // the new generation starts clean
  });

  it('pause then fail at +62 s is held (decision 17); an interruption\'s pause holds whatever the distance', () => {
    const late = harness();
    const g = late.live();
    late.pause();
    late.advance(62_000);
    late.drain();
    late.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('cut') });
    expect(late.names()).toEqual(['playerError held while paused: cut']);
    expect(late.state.phase).toBe('paused');
    expect(late.state.failedWhilePaused).toBe(true);

    const call = harness();
    const c = call.live();
    call.dispatch({ type: 'interruption-began' });
    call.pause();
    call.advance(300);
    call.drain();
    call.dispatch({ type: 'native-item-failed', g: c, item: 'i', error: media('cut') });
    expect(call.names()).toEqual(['playerError held while paused: cut']);
    expect(call.state.phase).toBe('paused');
  });
});

describe('errors while paused (decision 17)', () => {
  it('are held: no ladder, no plate, and the resume rejoins', () => {
    const h = harness();
    const g = h.live();
    h.pause();
    h.advance(PAUSE_ATTRIBUTION_MS + 1);
    h.drain();
    h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('302 to master') });
    expect(h.names()).toEqual(['playerError held while paused: 302 to master']);
    expect(h.of('schedule-retry')).toHaveLength(0);
    expect(h.of('error')).toHaveLength(0);
    expect(h.state.gate.failures).toBe(0);
    expect(h.state.failedWhilePaused).toBe(true);
    h.dispatch({ type: 'status-error', g, error: media('expo too') });
    h.dispatch({ type: 'native-item-lost', g, item: 'i' });
    expect(h.of('schedule-retry')).toHaveLength(0);
    h.drain();
    h.advance(1_000);
    h.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(h.names()[0]).toMatch(/^resume reason=remote-play cause=user elapsed=3001ms failed=true → rejoin$/);
    expect(h.of('replace')).toHaveLength(1);
    expect(h.names()).toContain('attempt #2 reason=rejoin:resume:remote-play');
  });

  it('a stale generation\'s error while paused still reaches the gate as stale', () => {
    const h = harness();
    h.live();
    h.pause();
    h.advance(PAUSE_ATTRIBUTION_MS + 1);
    h.drain();
    h.dispatch({ type: 'status-error', g: 42, error: media('old') });
    expect(h.names()).toEqual(['playerError stale g=42: old']);
    expect(h.state.failedWhilePaused).toBe(false);
  });
});

describe('the resume edge', () => {
  it('a same-channel select (`user`) is the person\'s play: it lifts a person\'s pause through the tiers; a playing set ignores it', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'resume-edge', reason: 'user' });
    expect(h.actions).toEqual([]);                            // nothing to lift
    expect(h.state.phase).toBe('live');
    h.pause();
    h.drain();
    h.advance(5_000);
    h.dispatch({ type: 'resume-edge', reason: 'user' });
    expect(h.names()).toEqual(['resume reason=user cause=user elapsed=5000ms failed=false → play', 'play']);
    expect(h.state.phase).toBe('live');
  });

  it('is ignored unless the set is paused', () => {
    const h = harness();
    h.live();
    for (const reason of ['foreground', 'remote-play', 'pip-stop', 'interruption-ended'] as const) {
      h.dispatch({ type: 'resume-edge', reason, shouldResume: true });
    }
    expect(h.actions).toEqual([]);
  });

  it('plays below 20 s, seeks then plays from 20 s, rejoins from 45 s — and returns to the phase the pause interrupted', () => {
    const play = harness();
    play.live();
    play.pause();
    play.advance(RESUME_PLAY_MAX_MS - 1);
    play.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(play.of('play')).toHaveLength(1);
    expect(play.state.phase).toBe('live');
    expect(play.state.pausedAt).toBeNull();

    const seek = harness();
    seek.live();
    seek.pause();
    seek.advance(RESUME_PLAY_MAX_MS);
    seek.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(seek.of('seek-live-then-play')).toHaveLength(1);
    expect(seek.of('play')).toHaveLength(0);
    expect(seek.state.phase).toBe('live');

    const rejoin = harness();
    rejoin.live();
    rejoin.pause();
    rejoin.advance(RESUME_SEEK_MAX_MS);
    rejoin.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(rejoin.of('replace')).toHaveLength(1);
    expect(rejoin.of('play')).toHaveLength(0);
    expect(rejoin.state.phase).toBe('joining');
    expect(rejoin.state.gate.sourceGeneration).toBe(2);

    // Paused during the join (before any frame): a resume returns to joining.
    const mid = harness();
    mid.dispatch({ type: 'take', reason: 'source' });
    mid.dispatch({ type: 'settle', g: 1 });
    mid.pause();
    expect(mid.state.phase).toBe('paused');
    mid.advance(1_000);
    mid.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(mid.of('play')).toHaveLength(1);
    expect(mid.state.phase).toBe('joining');
  });

  it('a user\'s pause stays paused on foreground, on a call ending, on the PiP window closing; an interruption\'s does not', () => {
    const user = harness();
    user.live();
    user.pause();
    user.advance(30_000);
    user.drain();
    user.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(user.state.phase).toBe('paused');
    expect(user.names()).toEqual(['resume reason=foreground cause=user elapsed=30000ms failed=false → stay-paused']);
    expect(user.of('play')).toHaveLength(0);
    user.dispatch({ type: 'interruption-began' });                 // a call, long after the person's pause
    user.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: true });
    user.dispatch({ type: 'resume-edge', reason: 'pip-stop' });
    expect(user.state.phase).toBe('paused');
    expect(user.state.pauseCause).toBe('user');
    expect(user.of('play')).toHaveLength(0);
    expect(user.of('seek-live-then-play')).toHaveLength(0);

    // An interruption's pause, once its ended has come and gone without
    // shouldResume (another app took the session), lifts on the foreground.
    const call = harness();
    call.live();
    call.dispatch({ type: 'interruption-began' });
    call.pause();
    call.advance(10_000);
    call.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: false });
    expect(call.state.phase).toBe('paused');
    call.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(call.of('play')).toHaveLength(1);
  });

  it('a same-channel select ignores an open interruption: the person pressed it', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'interruption-began' });
    h.pause();
    h.advance(3_000);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'user' });
    expect(h.names()).toEqual(['resume reason=user cause=interruption elapsed=3000ms failed=false interruption=open → play', 'play']);
  });

  it('interruption-ended resumes only with shouldResume', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'interruption-began' });
    h.pause();
    h.advance(3_000);
    h.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: false });
    expect(h.state.phase).toBe('paused');
    h.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: true });
    expect(h.of('play')).toHaveLength(1);
    expect(h.state.phase).toBe('live');
  });

  it('playingChange true while paused is a play nobody named (`rate`): the tiers still apply', () => {
    const h = harness();
    h.live();
    h.pause();
    h.advance(30_000);
    h.drain();
    h.dispatch({ type: 'progress' });
    expect(h.names()[0]).toBe('resume reason=rate cause=user elapsed=30000ms failed=false → seek-live-then-play');
    expect(h.of('seek-live-then-play')).toHaveLength(1);
    expect(h.state.phase).toBe('live');
  });

  it('a rate rising during a paused join (the module\'s nudge) is `rate`, not a press: the row says so', () => {
    const h = harness();
    h.dispatch({ type: 'take', reason: 'source' });
    h.dispatch({ type: 'settle', g: 1 });
    h.pause();
    h.advance(800);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'rate' });
    expect(h.names()).toEqual(['resume reason=rate cause=user elapsed=800ms failed=false → play', 'play']);
    expect(h.state.phase).toBe('joining');
  });

  it('a timeUpdate while paused never resumes: the stop sample, a tick reordered past the edge, a skip', () => {
    const h = harness();
    h.live();
    h.tick(10.0);
    h.pause();                                // the tcs KVO, inline in pause(); the clock is forgotten
    expect(h.state.lastTime).toBeNull();
    h.drain();
    h.tick(10.3);                             // the periodic observer's "playback stopped" sample
    expect(h.of('play')).toHaveLength(0);
    expect(h.state.phase).toBe('paused');
    h.tick(9.9);                              // a pre-pause tick the bridge delivered after the edge…
    h.tick(10.3);                             // …then the stop sample again: an advance, still not a resume
    expect(h.of('play')).toHaveLength(0);
    expect(h.state.phase).toBe('paused');
    h.tick(20.3);                             // a lock-screen skip while paused: a time jump
    expect(h.actions).toEqual([]);
    expect(h.state.lastTime).toBe(20.3);
    h.dispatch({ type: 'progress' });         // timeControlStatus == .playing: the outside play
    expect(h.of('play')).toHaveLength(1);
    expect(h.state.phase).toBe('live');
    expect(h.state.lastTime).toBeNull();      // the resume forgets the clock too: the next tick only records
    h.drain();
    h.tick(20.8);
    expect(h.of('progress')).toHaveLength(0);
    h.tick(21.3);
    expect(h.of('progress')).toEqual([{ type: 'progress', g: 1 }]);
  });

  it('a tune while paused starts clean: the next generation carries no pause', () => {
    const h = harness();
    h.live();
    h.pause();
    h.dispatch({ type: 'invalidate' });
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.state.phase).toBe('joining');
    expect(h.state.pausedAt).toBeNull();
    expect(h.state.failedWhilePaused).toBe(false);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(h.actions).toEqual([]);
  });
});

describe('an interruption still open (SI-02)', () => {
  it('the foreground under a call banner, and a PiP stop, wait for the call\'s ended; the ended resumes', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'interruption-began' });
    h.pause();
    expect(h.state.pauseCause).toBe('interruption');
    expect(h.state.interruptionOpen).toBe(true);
    h.advance(1_500);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'foreground' });        // AppState active: the person came back to the app mid-call
    expect(h.names()).toEqual(['resume reason=foreground cause=interruption elapsed=1500ms failed=false interruption=open → stay-paused']);
    expect(h.of('play')).toHaveLength(0);
    expect(h.state.phase).toBe('paused');
    h.advance(8_500);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'pip-stop' });
    expect(h.names()).toEqual(['resume reason=pip-stop cause=interruption elapsed=10000ms failed=false interruption=open → stay-paused']);
    expect(h.state.phase).toBe('paused');
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: true });
    expect(h.names()).toEqual(['resume reason=interruption-ended cause=interruption elapsed=10000ms failed=false → play', 'play']);
    expect(h.state.phase).toBe('live');
    expect(h.state.interruptionOpen).toBe(false);
  });

  it(`a pause edge while the interruption is open is the interruption's, past ${PAUSE_ATTRIBUTION_MS} ms too`, () => {
    const late = harness();
    late.live();
    late.dispatch({ type: 'interruption-began' });
    late.advance(PAUSE_ATTRIBUTION_MS + 5_000);
    late.pause();
    expect(late.state.pauseCause).toBe('interruption');

    // A press during the call plays (the person's word); the session pauses
    // it again 4 s after the call began: still the call's, so its ended lifts it.
    const twice = harness();
    twice.live();
    twice.dispatch({ type: 'interruption-began' });
    twice.pause();
    twice.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(twice.state.phase).toBe('paused');
    twice.advance(3_000);
    twice.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(twice.of('play')).toHaveLength(1);
    expect(twice.state.phase).toBe('live');
    twice.advance(1_000);
    twice.drain();
    twice.pause();
    expect(twice.names()).toEqual(['paused cause=interruption', 'paused']);
    twice.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(twice.of('play')).toHaveLength(0);
    twice.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: true });
    expect(twice.of('play')).toHaveLength(1);
    expect(twice.state.phase).toBe('live');
  });

  it('the ended closes the interruption whether or not the set is paused; the next pause is the person\'s', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'interruption-began' });                     // Siri, over a set it did not pause
    h.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: false });
    expect(h.actions).toEqual([]);
    expect(h.state.interruptionOpen).toBe(false);
    h.advance(5_000);
    h.pause();
    expect(h.state.pauseCause).toBe('user');
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(h.names()).toEqual(['resume reason=foreground cause=user elapsed=0ms failed=false → stay-paused']);
  });

  it('a tune during a call keeps the interruption open: the session is not the generation\'s', () => {
    const h = harness();
    h.live();
    h.dispatch({ type: 'interruption-began' });
    h.pause();
    h.dispatch({ type: 'invalidate' });
    h.dispatch({ type: 'take', reason: 'source' });
    expect(h.state.phase).toBe('joining');
    expect(h.state.interruptionOpen).toBe(true);
    h.dispatch({ type: 'settle', g: h.state.gate.sourceGeneration });
    h.advance(30_000);
    h.pause();
    expect(h.state.pauseCause).toBe('interruption');
    h.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(h.of('play')).toHaveLength(0);
    h.dispatch({ type: 'resume-edge', reason: 'interruption-ended', shouldResume: true });
    expect(h.of('play')).toHaveLength(1);
    expect(h.state.phase).toBe('joining');
  });
});

describe('the owner\'s scenarios, replayed', () => {
  it('(i) build-19 cold channel 5: error at +1.3 s → rejoin 0 → error → rejoin 2 s → progress ×N → attempts reset', () => {
    const h = harness();
    h.at(0);
    h.dispatch({ type: 'take', reason: 'source' });            // g=1, attempt #1
    h.dispatch({ type: 'settle', g: 1 });
    h.at(1_300);
    h.dispatch({ type: 'native-item-failed', g: 1, item: 'a', error: media('AVFoundation -12888') });
    expect(h.of('schedule-retry')).toEqual([{ type: 'schedule-retry', g: 1, delayMs: 0, reason: 'retry' }]);
    h.dispatch({ type: 'retry-fired', g: 1 });                 // +0 ms
    expect(h.names()).toContain('attempt #2 reason=retry');
    h.dispatch({ type: 'settle', g: 2 });
    h.at(2_400);
    h.drain();
    h.dispatch({ type: 'native-item-failed', g: 2, item: 'b', error: media('thin playlist') });
    expect(h.of('schedule-retry')).toEqual([{ type: 'schedule-retry', g: 2, delayMs: 2000, reason: 'retry' }]);
    expect(h.of('error')).toHaveLength(0);                      // the plate is untouched below the third failure
    h.at(4_400);
    h.dispatch({ type: 'retry-fired', g: 2 });
    h.dispatch({ type: 'settle', g: 3 });
    h.at(5_600);
    h.dispatch({ type: 'native-first-frame', g: 3, item: 'c', via: 'rfdKvo' });
    expect(h.state.phase).toBe('live');
    expect(h.state.gate.failures).toBe(2);
    let t = 8.0;
    // The first timeUpdate only records the clock; sustained progress is measured from the second.
    for (let i = 0; i < 11; i += 1) { h.advance(500); h.tick(t += 0.5); }   // 4.5 s of it
    expect(h.state.gate.failures).toBe(2);
    h.advance(500); h.tick(t += 0.5);                                        // 5.0 s
    expect(h.state.gate.failures).toBe(0);
    expect(h.state.gate.attempts).toBe(3);
    // One static (attempt #1 → #3 under it), never a card: no `error` action was ever emitted.
    expect(h.of('error')).toHaveLength(0);
    expect(h.of('first-frame')).toEqual([{ type: 'first-frame', g: 3 }]);
  });

  it('(ii) the channel-9 log (04:14:48–04:15:52Z): pause at t0, error at t0+62 s → none, remote play at t0+70 s → rejoin 0', () => {
    const h = harness();
    const t0 = Date.UTC(2026, 8, 27, 4, 13, 50);
    h.at(t0 - 9_000);
    const g = h.live();
    h.at(t0);
    h.pause();                                                  // the lock-screen pause: tcs paused, item ready
    expect(h.state.phase).toBe('paused');
    h.at(t0 + 62_000);
    h.drain();
    h.dispatch({ type: 'native-item-failed', g, item: 'i', error: media('the media playlist 302d to the master') });
    expect(h.names()).toEqual(['playerError held while paused: the media playlist 302d to the master']);
    expect(h.of('schedule-retry')).toHaveLength(0);
    expect(h.of('play')).toHaveLength(0);                        // no self-un-pause at +65 s
    expect(h.state.phase).toBe('paused');
    h.at(t0 + 70_000);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(h.names()).toEqual([
      'resume reason=remote-play cause=user elapsed=70000ms failed=true → rejoin',
      'bind-generation',
      'attempt #2 reason=rejoin:resume:remote-play',
      'buffering',
      'replace',
    ]);
    expect(h.of('replace')).toEqual([{ type: 'replace', g: g + 1 }]);   // immediately: no rung, no timer
    expect(h.state.phase).toBe('joining');
  });

  it('(iii) a user pause with a foreground edge at +30 s stays paused', () => {
    const h = harness();
    h.live();
    h.pause();
    h.advance(30_000);
    h.drain();
    h.dispatch({ type: 'resume-edge', reason: 'foreground' });
    expect(h.state.phase).toBe('paused');
    expect(h.of('play')).toHaveLength(0);
    expect(h.of('replace')).toHaveLength(0);
    // The picture is still theirs to resume: the next Now Playing play rejoins (past the window's life).
    h.advance(30_000);
    h.dispatch({ type: 'resume-edge', reason: 'remote-play' });
    expect(h.of('replace')).toHaveLength(1);
  });
});
