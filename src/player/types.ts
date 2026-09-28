import type { StyleProp, ViewStyle } from 'react-native';
import type { PauseCause, ResumeReason } from './pipelinePolicy';

export type PlayerErrorKind =
  | 'network'
  | 'media'
  | 'unsupported'
  | 'recovery-exhausted'
  | 'unknown';

export interface PlayerError {
  kind: PlayerErrorKind;
  message: string;
  /**
   * `false`: the surface keeps trying — the plate relabels, the tune record
   * stays open, a later frame still closes it (the native ladder's third
   * failure, the web's `recovery-exhausted`). Absent or `true`: final.
   */
  terminal?: boolean;
}

/**
 * What the lock screen may show. Native writes the channel name and artwork
 * only (decision 3): its source depends on the URL alone, so a programme
 * rollover never reaches Now Playing and never re-tunes the stream (NP-08).
 * The programme fields are the web's Media Session's.
 */
export interface PlayerMetadata {
  channelName: string;
  programmeTitle?: string;
  description?: string;
  artworkUrl?: string;
}

/**
 * Web only: the Media Session's previous/next track handlers. On iOS the
 * lock-screen keys are expo-video's Now Playing (play, pause, skip ±10 s);
 * previous/next are not wired there and this prop is ignored (NP-07).
 */
export interface PlayerMediaSessionControls {
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

export type PlayerViewport = 'contain' | 'cover' | 'stretch';

export interface PlayerSurfaceProps {
  /** Null leaves the persistent player seated but clears its current signal. */
  sourceUrl: string | null;
  playing: boolean;
  muted: boolean;
  style?: StyleProp<ViewStyle>;
  viewport?: PlayerViewport;
  metadata?: PlayerMetadata;
  mediaSessionControls?: PlayerMediaSessionControls;
  /** Keep the player alive while detaching its native picture surface. */
  viewAttached?: boolean;
  /** Decision 1: auto-PiP arms only while the picture is live — `!tuning`. Defaults to true. */
  pictureInPictureAuto?: boolean;
  onReady: () => void;
  /**
   * The witnessed first frame of `generation` — the only end of the tuning
   * static (docs/native-witness.md). The web surface passes a per-mount
   * counter no trace record binds; its own witness and rows are WP-06's.
   */
  onFirstFrame?: (generation: number) => void;
  /**
   * The clock of `generation` advanced (`playingChange true`, an advancing
   * `timeUpdate`): the screen's "no progress" clock resets on it (NP-02).
   * Native only today; the web's rows are WP-06's.
   */
  onProgress?: (generation: number) => void;
  onBuffering: (buffering: boolean) => void;
  onError: (error: PlayerError) => void;
  /**
   * An unrequested pause edge — Now Playing, the PiP button, an audio-session
   * interruption — stamped when it was seen and by whom. The surface keeps
   * the stamp for its own resume tiers; this is the screen's notice, and no
   * screen reads it yet (watch.tsx passes nothing; the `paused` row is the
   * record). A `paused cause=failure (re-attributed…)` row withdraws one.
   */
  onPlaybackPaused?: (at: number, cause: PauseCause) => void;
  onPictureInPictureAvailabilityChange?: (available: boolean) => void;
  onPictureInPictureChange?: (active: boolean) => void;
}

export interface PlayerSurfaceHandle {
  /** Must be called synchronously from a user gesture. */
  requestPictureInPicture: () => void;
  seekToLiveEdge: () => void;
  /**
   * Called by `tuneTo` synchronously, before its first setState: from this
   * instant every native fact carrying an older generation is stale, whatever
   * React's effect schedule does (race-2 R1).
   */
  invalidate: () => void;
  /**
   * A fresh attempt on the current source under a new generation — a
   * same-channel re-tune of a failing channel (decision 16); the surface's
   * own resume tiers call it for a dead item.
   */
  rejoin: (reason: string) => void;
  /**
   * A reason to play again, judged by the resume tiers (`decideResume`):
   * ignored unless the set is paused, and a person's pause survives every
   * system edge (decision 17). The surface raises its own edges (Now
   * Playing, interruption end, PiP stop, AppState); this is for one the
   * screen sees first, and no screen calls it yet — DS,P has no play
   * control of its own, so `remote-play` is the only person's edge today.
   */
  resume: (reason: ResumeReason) => void;
}
