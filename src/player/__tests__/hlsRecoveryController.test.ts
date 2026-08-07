import {
  decideHlsRecovery,
  initialHlsRecoveryState,
  markHlsPlaybackHealthy,
} from '../hlsRecoveryController';

describe('HLS recovery controller', () => {
  it('ignores non-fatal errors', () => {
    const decision = decideHlsRecovery(
      initialHlsRecoveryState,
      { fatal: false, type: 'media', manifestParsed: false },
      0,
    );
    expect(decision.action).toEqual({ type: 'ignore' });
    expect(decision.state).toBe(initialHlsRecoveryState);
  });

  it('rebuilds for a fatal network error before the manifest is parsed', () => {
    const decision = decideHlsRecovery(
      initialHlsRecoveryState,
      { fatal: true, type: 'network', manifestParsed: false },
      0,
    );
    expect(decision.action).toEqual({
      type: 'rebuild',
      delayMs: 4_000,
      surfaceError: false,
      rejoinLiveEdge: true,
    });
  });

  it('bounds post-manifest network restarts before escalating to rebuild', () => {
    let state = initialHlsRecoveryState;
    for (const now of [0, 1_000, 2_000]) {
      const decision = decideHlsRecovery(
        state,
        { fatal: true, type: 'network', manifestParsed: true },
        now,
      );
      expect(decision.action).toEqual({ type: 'start-load' });
      state = decision.state;
    }

    const bounded = decideHlsRecovery(
      state,
      { fatal: true, type: 'network', manifestParsed: true },
      3_000,
    );
    expect(bounded.action).toEqual({
      type: 'rebuild',
      delayMs: 4_000,
      surfaceError: false,
      rejoinLiveEdge: true,
    });
    expect(bounded.state.networkRestartAttempts).toBe(0);
  });

  it('bounds media recovery to three attempts in sixty seconds', () => {
    let state = initialHlsRecoveryState;
    for (const now of [0, 10_000, 20_000]) {
      const decision = decideHlsRecovery(
        state,
        { fatal: true, type: 'media', manifestParsed: true },
        now,
      );
      expect(decision.action).toEqual({ type: 'recover-media', rejoinLiveEdge: true });
      state = decision.state;
    }

    const bounded = decideHlsRecovery(
      state,
      { fatal: true, type: 'media', manifestParsed: true },
      30_000,
    );
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
      networkRestartAttempts: 0,
      rebuildAttempts: 0,
    };
    const decision = decideHlsRecovery(
      state,
      { fatal: true, type: 'media', manifestParsed: true },
      60_001,
    );
    expect(decision.action.type).toBe('recover-media');
    expect(decision.state.mediaRecoveryTimes).toEqual([10_000, 20_000, 60_001]);
  });

  it('backs full rebuilds off, surfaces an error, and keeps polling', () => {
    let state = initialHlsRecoveryState;
    const expectedDelays = [4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000];

    expectedDelays.forEach((delayMs, index) => {
      const decision = decideHlsRecovery(
        state,
        { fatal: true, type: 'other', manifestParsed: true },
        index * 1_000,
      );
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
      networkRestartAttempts: 2,
      rebuildAttempts: 4,
    }, 60_001)).toEqual({
      mediaRecoveryTimes: [50_000],
      networkRestartAttempts: 0,
      rebuildAttempts: 0,
    });
  });
});
