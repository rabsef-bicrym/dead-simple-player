import type { StyleProp, ViewStyle } from 'react-native';

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

export interface PlayerMetadata {
  channelName: string;
  programmeTitle?: string;
  description?: string;
  artworkUrl?: string;
}

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
  onBuffering: (buffering: boolean) => void;
  onError: (error: PlayerError) => void;
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
   * same-channel re-tune of a failing channel (decision 16), a resume.
   */
  rejoin: (reason: string) => void;
}
