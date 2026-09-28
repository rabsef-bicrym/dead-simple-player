/**
 * The pipeline's policy: the constants and the two pure decisions both
 * surfaces share — how long the next join attempt waits (`nextRetry`) and
 * what a resume edge does to a paused set (`decideResume`). The native gate
 * (`firstFrameGate.ts`) and the join controller (`nativeJoinController.ts`)
 * consume them here; the web pipeline (WP-06) is to read the same table.
 *
 * Every number descends from the station's contract
 * (reviews/dsp-polish/03-ersatztv-hls-contract.md, gap-server-idle): a
 * session lives 60 s past its last Touch — a master GET/HEAD or a segment
 * fetch; media-playlist polls never count (§2) — the served window is the last
 * ten segments (~40 s), and a retry that lands on a starting session merely
 * joins its wait (§1 Stage B), so the first retry is immediate.
 *
 * Nothing here is a timer: `nextRetry` answers a delay the caller schedules
 * (a fetch, never a reveal — R1), and `decideResume` compares two stamps the
 * caller took at the pause edge and at the resume edge.
 */

/** The join ladder, indexed by `failures - 1`; the last entry repeats (R1: the user's X is the escape). ff-spec §6.1's numbers. */
export const JOIN_BACKOFF_MS = [0, 2000, 4000, 8000, 15000, 30000] as const;
/** The plate relabels ("THE SIGNAL WILL NOT JOIN") at this many consecutive failures; polling continues (R4). */
export const JOIN_SURFACE_AFTER = 3;
/** Progress must be sustained this long before the ladder's budget replenishes (PW-10: a stream that plays a second and dies never backs off otherwise). */
export const HEALTHY_AFTER_MS = 5_000;
/** A pause shorter than this resumes with `play()`: the playhead is still inside the served window. */
export const RESUME_PLAY_MAX_MS = 20_000;
/**
 * Between RESUME_PLAY_MAX_MS and this, the playhead has left the window but
 * the session is presumed alive: seek to the live edge, then play. At or past
 * it the session is presumed dead (60 s minus the buffering the player may
 * have done after the pause edge) and the item is replaced — never a seek
 * (contract §2: the media playlist 302s to the master; the same item cannot
 * come back).
 */
export const RESUME_SEEK_MAX_MS = 45_000;
/** An audio-session interruption this close to a pause edge names the pause's cause. */
export const PAUSE_ATTRIBUTION_MS = 2_000;

export interface RetryDecision {
  /** The wait before the next attempt. */
  delayMs: number;
  /** The plate relabels now; attempts continue regardless. */
  surface: boolean;
}

/** What the ladder does after `failures` consecutive failures (≥ 1). */
export function nextRetry(failures: number): RetryDecision {
  const n = Math.max(1, Math.floor(failures));
  return {
    delayMs: JOIN_BACKOFF_MS[Math.min(n - 1, JOIN_BACKOFF_MS.length - 1)],
    surface: n >= JOIN_SURFACE_AFTER,
  };
}

/** Why the set is being asked to resume: the person pressed play (`remote-play`), selected the channel already on the set (`user`), or one of the system's own edges. */
export type ResumeReason = 'remote-play' | 'user' | 'interruption-ended' | 'foreground' | 'pip-stop';
/** The edges nobody pressed: a person's pause survives every one of them (decision 17). */
const SYSTEM_EDGES: ReadonlySet<ResumeReason> = new Set<ResumeReason>(['foreground', 'interruption-ended', 'pip-stop']);
/** Who paused it: a person (Now Playing, the PiP button) or the audio session (a call, Siri, an alarm). */
export type PauseCause = 'user' | 'interruption';
export type ResumeAction = 'play' | 'seek-live-then-play' | 'rejoin' | 'stay-paused';

export interface ResumeQuery {
  /** The pause edge's stamp; null when the set is paused but the edge was not seen. */
  pausedAt: number | null;
  now: number;
  cause: PauseCause | null;
  reason: ResumeReason;
  /** AVAudioSession's `shouldResume` option on an `interruption-ended` edge. */
  shouldResume?: boolean;
  /** The item failed (or a retry was cancelled) while paused: only a fresh item can play. */
  failedWhilePaused: boolean;
}

/**
 * The resume tiers (NP-03, decision 17). A user's pause is a decision and no
 * system edge overrules it — not the foreground, not a call ending with
 * `shouldResume` (the person paused before the call), not the PiP window
 * closing (AVKit pauses the player when its X is pressed, then reports the
 * stop; a resume there would restart audio in a window just closed); only
 * a play the person pressed — Now Playing, or the channel already on the
 * set selected again — lifts it. An interruption that ends without
 * `shouldResume` stays quiet; a failed item or a pause past the session's
 * life rejoins from the channel URL; a pause past the window seeks first;
 * anything shorter just plays.
 */
export function decideResume(q: ResumeQuery): ResumeAction {
  if (q.cause === 'user' && SYSTEM_EDGES.has(q.reason)) return 'stay-paused';
  if (q.reason === 'interruption-ended' && !q.shouldResume) return 'stay-paused';
  if (q.failedWhilePaused || q.pausedAt === null) return 'rejoin';
  const elapsed = q.now - q.pausedAt;
  if (elapsed >= RESUME_SEEK_MAX_MS) return 'rejoin';
  if (elapsed >= RESUME_PLAY_MAX_MS) return 'seek-live-then-play';
  return 'play';
}
