export const MEDIA_RECOVERY_LIMIT = 3;
export const MEDIA_RECOVERY_WINDOW_MS = 60_000;
export const REBUILD_LIMIT_BEFORE_ERROR = 5;
export const REBUILD_BASE_DELAY_MS = 4_000;
export const REBUILD_MAX_DELAY_MS = 30_000;

export interface HlsRecoveryState {
  mediaRecoveryTimes: number[];
  rebuildAttempts: number;
}

export type HlsFailureType = 'network' | 'media' | 'other';

export type HlsRecoveryAction =
  | { type: 'ignore' }
  | { type: 'start-load' }
  | { type: 'recover-media'; rejoinLiveEdge: true }
  | {
      type: 'rebuild';
      delayMs: number;
      surfaceError: boolean;
      rejoinLiveEdge: true;
    };

export interface HlsRecoveryDecision {
  state: HlsRecoveryState;
  action: HlsRecoveryAction;
}

export const initialHlsRecoveryState: HlsRecoveryState = {
  mediaRecoveryTimes: [],
  rebuildAttempts: 0,
};

/**
 * Pure HLS recovery reducer. The first rebuild retains the receiver's
 * established four-second cold-start retry; later rebuilds back off to 30s.
 * Once the visible-error threshold is crossed, rebuild polling continues at
 * the cap so a rebooted home server can return without intervention.
 */
export function decideHlsRecovery(
  state: HlsRecoveryState,
  failure: { fatal: boolean; type: HlsFailureType },
  nowMs: number,
): HlsRecoveryDecision {
  if (!failure.fatal) return { state, action: { type: 'ignore' } };
  if (failure.type === 'network') return { state, action: { type: 'start-load' } };

  const recentMediaRecoveries = state.mediaRecoveryTimes.filter(
    (time) => nowMs - time < MEDIA_RECOVERY_WINDOW_MS,
  );

  if (failure.type === 'media' && recentMediaRecoveries.length < MEDIA_RECOVERY_LIMIT) {
    return {
      state: {
        ...state,
        mediaRecoveryTimes: [...recentMediaRecoveries, nowMs],
      },
      action: { type: 'recover-media', rejoinLiveEdge: true },
    };
  }

  const rebuildAttempts = state.rebuildAttempts + 1;
  return {
    state: {
      mediaRecoveryTimes: recentMediaRecoveries,
      rebuildAttempts,
    },
    action: {
      type: 'rebuild',
      delayMs: Math.min(
        REBUILD_BASE_DELAY_MS * (2 ** (rebuildAttempts - 1)),
        REBUILD_MAX_DELAY_MS,
      ),
      surfaceError: rebuildAttempts > REBUILD_LIMIT_BEFORE_ERROR,
      rejoinLiveEdge: true,
    },
  };
}

export function markHlsPlaybackHealthy(
  state: HlsRecoveryState,
  nowMs: number,
): HlsRecoveryState {
  return {
    mediaRecoveryTimes: state.mediaRecoveryTimes.filter(
      (time) => nowMs - time < MEDIA_RECOVERY_WINDOW_MS,
    ),
    rebuildAttempts: 0,
  };
}
