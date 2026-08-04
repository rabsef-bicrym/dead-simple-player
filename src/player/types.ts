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
  sourceUrl: string;
  playing: boolean;
  muted: boolean;
  style?: StyleProp<ViewStyle>;
  viewport?: PlayerViewport;
  metadata?: PlayerMetadata;
  mediaSessionControls?: PlayerMediaSessionControls;
  /** Keep the player alive while detaching its native picture surface. */
  viewAttached?: boolean;
  onReady: () => void;
  onBuffering: (buffering: boolean) => void;
  onError: (error: PlayerError) => void;
  onPictureInPictureAvailabilityChange?: (available: boolean) => void;
}

export interface PlayerSurfaceHandle {
  /** Must be called synchronously from a user gesture. */
  requestPictureInPicture: () => void;
  seekToLiveEdge: () => void;
}
