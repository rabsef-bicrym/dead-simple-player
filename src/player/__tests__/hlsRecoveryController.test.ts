import {
  decideHlsRecovery,
  initialHlsRecoveryState,
  markHlsPlaybackHealthy,
} from '../hlsRecoveryController';

describe('HLS recovery controller', () => {
  it('ignores non-fatal errors', () => {
    const decision = decideHlsRecovery(initialHlsRecoveryState, { fatal: false, type: 'media' }, 0);
    expect(decision.action).toEqual({ type: 'ignore' });
    expect(decision.state).toBe(initialHlsRecoveryState);
  });

  it('restarts loading for a fatal network error', () => {
    const decision = decideHlsRecovery(initialHlsRecoveryState, { fatal: true, type: 'network' }, 0);
    expect(decision.action).toEqual({ type: 'start-load' });
  });

  it('bounds media recovery to three attempts in sixty seconds', () => {
    let state = initialHlsRecoveryState;
    for (const now of [0, 10_000, 20_000]) {
      const decision = decideHlsRecovery(state, { fatal: true, type: 'media' }, now);
      expect(decision.action).toEqual({ type: 'recover-media', rejoinLiveEdge: true });
      state = decision.state;
    }

    const bounded = decideHlsRecovery(state, { fatal: true, type: 'media' }, 30_000);
    expect(bounded.action).toEqual({
      type: 'rebuild',
      delayMs: 4_000,
      surfaceError: false,
      rejoinLiveEdge: true,
    });
  });

  it('allows media recovery again after the rolling window', () => {
    const state = {
      mediaRecoveryTimes: [0, 10_000, 20_000],
      rebuildAttempts: 0,
    };
    const decision = decideHlsRecovery(state, { fatal: true, type: 'media' }, 60_001);
    expect(decision.action.type).toBe('recover-media');
    expect(decision.state.mediaRecoveryTimes).toEqual([10_000, 20_000, 60_001]);
  });

  it('backs full rebuilds off, surfaces an error, and keeps polling', () => {
    let state = initialHlsRecoveryState;
    const expectedDelays = [4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000];

    expectedDelays.forEach((delayMs, index) => {
      const decision = decideHlsRecovery(state, { fatal: true, type: 'other' }, index * 1_000);
      expect(decision.action).toEqual({
        type: 'rebuild',
        delayMs,
        surfaceError: index >= 5,
        rejoinLiveEdge: true,
      });
      state = decision.state;
    });
  });

  it('resets rebuild bounds but keeps recent media recoveries', () => {
    expect(markHlsPlaybackHealthy({
      mediaRecoveryTimes: [0, 50_000],
      rebuildAttempts: 4,
    }, 60_001)).toEqual({
      mediaRecoveryTimes: [50_000],
      rebuildAttempts: 0,
    });
  });
});
