import {
  HEALTHY_AFTER_MS,
  JOIN_BACKOFF_MS,
  JOIN_SURFACE_AFTER,
  PAUSE_ATTRIBUTION_MS,
  RESUME_PLAY_MAX_MS,
  RESUME_SEEK_MAX_MS,
  decideResume,
  nextRetry,
  type ResumeQuery,
} from '../pipelinePolicy';
import { RETRY_DELAYS_MS, SURFACE_ERROR_AFTER } from '../firstFrameGate';

describe('the ladder', () => {
  it('is ff-spec §6.1\'s table, and the gate reads the same one (never two ladders)', () => {
    expect(JOIN_BACKOFF_MS).toEqual([0, 2000, 4000, 8000, 15000, 30000]);
    expect(RETRY_DELAYS_MS).toBe(JOIN_BACKOFF_MS);
    expect(SURFACE_ERROR_AFTER).toBe(JOIN_SURFACE_AFTER);
    expect(JOIN_SURFACE_AFTER).toBe(3);
  });

  it('nextRetry: the first retry is immediate (a retry joins a starting session\'s wait), the last delay repeats, the plate relabels at the third', () => {
    expect(nextRetry(1)).toEqual({ delayMs: 0, surface: false });
    expect(nextRetry(2)).toEqual({ delayMs: 2000, surface: false });
    expect(nextRetry(3)).toEqual({ delayMs: 4000, surface: true });
    expect(nextRetry(4)).toEqual({ delayMs: 8000, surface: true });
    expect(nextRetry(5)).toEqual({ delayMs: 15000, surface: true });
    expect(nextRetry(6)).toEqual({ delayMs: 30000, surface: true });
    expect(nextRetry(60)).toEqual({ delayMs: 30000, surface: true });
  });

  it('nextRetry treats anything below one failure as the first', () => {
    expect(nextRetry(0)).toEqual(nextRetry(1));
    expect(nextRetry(-3)).toEqual(nextRetry(1));
  });

  it('the health and attribution windows are the contract\'s', () => {
    expect(HEALTHY_AFTER_MS).toBe(5000);
    expect(PAUSE_ATTRIBUTION_MS).toBe(2000);
    expect(RESUME_PLAY_MAX_MS).toBe(20000);
    expect(RESUME_SEEK_MAX_MS).toBe(45000);
    expect(RESUME_SEEK_MAX_MS).toBeLessThan(60000);   // the session dies at 60 s; the client errs early
  });
});

describe('decideResume', () => {
  const at = (elapsed: number, over: Partial<ResumeQuery> = {}): ResumeQuery => ({
    pausedAt: 1_000_000,
    now: 1_000_000 + elapsed,
    cause: 'user',
    reason: 'remote-play',
    failedWhilePaused: false,
    ...over,
  });

  it('tiers on the pause edge: play below 20 s, seek from 20 s, rejoin from 45 s', () => {
    expect(decideResume(at(0))).toBe('play');
    expect(decideResume(at(19_999))).toBe('play');
    expect(decideResume(at(20_000))).toBe('seek-live-then-play');
    expect(decideResume(at(44_999))).toBe('seek-live-then-play');
    expect(decideResume(at(45_000))).toBe('rejoin');
    expect(decideResume(at(600_000))).toBe('rejoin');
  });

  it('a user\'s pause survives every system edge (decision 17); only the person\'s play lifts it', () => {
    expect(decideResume(at(5_000, { reason: 'foreground' }))).toBe('stay-paused');
    expect(decideResume(at(100_000, { reason: 'foreground' }))).toBe('stay-paused');
    expect(decideResume(at(5_000, { reason: 'pip-stop' }))).toBe('stay-paused');           // the PiP window's X pauses, then stops
    expect(decideResume(at(5_000, { reason: 'interruption-ended', shouldResume: true }))).toBe('stay-paused'); // paused before the call
    expect(decideResume(at(5_000, { reason: 'remote-play' }))).toBe('play');
    expect(decideResume(at(70_000, { reason: 'remote-play' }))).toBe('rejoin');
  });

  it('an interruption\'s pause resumes on foreground and on the PiP window closing', () => {
    expect(decideResume(at(5_000, { cause: 'interruption', reason: 'foreground' }))).toBe('play');
    expect(decideResume(at(30_000, { cause: 'interruption', reason: 'foreground' }))).toBe('seek-live-then-play');
    expect(decideResume(at(5_000, { cause: 'interruption', reason: 'pip-stop' }))).toBe('play');
  });

  it('interruption-ended honours shouldResume', () => {
    expect(decideResume(at(5_000, { cause: 'interruption', reason: 'interruption-ended', shouldResume: false }))).toBe('stay-paused');
    expect(decideResume(at(5_000, { cause: 'interruption', reason: 'interruption-ended' }))).toBe('stay-paused');
    expect(decideResume(at(5_000, { cause: 'interruption', reason: 'interruption-ended', shouldResume: true }))).toBe('play');
    expect(decideResume(at(70_000, { cause: 'interruption', reason: 'interruption-ended', shouldResume: true }))).toBe('rejoin');
  });

  it('a failure while paused rejoins whatever the elapsed time; so does a pause whose edge was not seen', () => {
    expect(decideResume(at(1_000, { failedWhilePaused: true }))).toBe('rejoin');
    expect(decideResume(at(1_000, { pausedAt: null }))).toBe('rejoin');
    // stay-paused still wins over rejoin: a user's pause is a decision.
    expect(decideResume(at(1_000, { failedWhilePaused: true, reason: 'foreground' }))).toBe('stay-paused');
  });
});
