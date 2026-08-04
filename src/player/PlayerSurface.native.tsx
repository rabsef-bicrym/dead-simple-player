import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { useEventListener } from 'expo';
import {
  isPictureInPictureSupported,
  useVideoPlayer,
  VideoView,
  type VideoSource,
  type VideoView as VideoViewInstance,
} from 'expo-video';
import type { PlayerError, PlayerMetadata, PlayerSurfaceHandle, PlayerSurfaceProps } from './types';

function videoSource(sourceUrl: string, metadata?: PlayerMetadata): VideoSource {
  return {
    uri: sourceUrl,
    contentType: 'hls',
    metadata: {
      title: metadata?.programmeTitle ?? metadata?.channelName ?? 'Dead Simple Player',
      artist: metadata?.programmeTitle ? metadata.channelName : undefined,
      artwork: metadata?.artworkUrl,
    },
  };
}

/** AVPlayer-backed live television with a player lifecycle independent of its view. */
export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(
  function PlayerSurface(
    {
      sourceUrl,
      playing,
      muted,
      style,
      viewport = 'contain',
      metadata,
      viewAttached = true,
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    },
    forwardedRef,
  ) {
    const videoViewRef = useRef<VideoViewInstance | null>(null);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryPending = useRef(false);
    const retried = useRef(false);
    const readyReported = useRef(false);
    const sourceGeneration = useRef(0);
    const sourceRef = useRef(videoSource(sourceUrl, metadata));
    const playingRef = useRef(playing);
    const callbacksRef = useRef({ onReady, onBuffering, onError });

    playingRef.current = playing;
    callbacksRef.current = { onReady, onBuffering, onError };
    sourceRef.current = videoSource(sourceUrl, metadata);

    const player = useVideoPlayer(null, (createdPlayer) => {
      createdPlayer.staysActiveInBackground = true;
      createdPlayer.showNowPlayingNotification = true;
      createdPlayer.audioMixingMode = 'doNotMix';
      createdPlayer.allowsExternalPlayback = true;
      createdPlayer.timeUpdateEventInterval = 0.5;
    });

    const reportReady = useCallback(() => {
      callbacksRef.current.onBuffering(false);
      if (!readyReported.current) {
        readyReported.current = true;
        callbacksRef.current.onReady();
      }
    }, []);

    const reportPlayerError = useCallback((error: PlayerError) => {
      if (retryPending.current) return;

      // ErsatzTV can briefly serve an empty cold-start playlist. Reload the
      // same HLS source on this same AVPlayer once, after the established
      // four-second grace period, before surfacing the failure.
      if (!retried.current) {
        retried.current = true;
        retryPending.current = true;
        callbacksRef.current.onBuffering(true);
        console.warn('[Player retry after cold-start error]', error.message);
        const generation = sourceGeneration.current;
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          retryPending.current = false;
          if (sourceGeneration.current !== generation) return;
          readyReported.current = false;
          void player.replaceAsync(sourceRef.current)
            .then(() => {
              if (playingRef.current) player.play();
            })
            .catch((replacementError: unknown) => reportPlayerError({
              kind: 'media',
              message: replacementError instanceof Error
                ? replacementError.message
                : 'Native HLS retry failed',
            }));
        }, 4000);
        return;
      }

      callbacksRef.current.onBuffering(false);
      callbacksRef.current.onError(error);
    }, [player]);

    useEventListener(player, 'statusChange', ({ status, error }) => {
      if (status === 'loading') {
        callbacksRef.current.onBuffering(true);
      } else if (status === 'readyToPlay') {
        reportReady();
        if (playingRef.current) player.play();
      } else if (status === 'error') {
        reportPlayerError({
          kind: 'media',
          message: error?.message ? `Native HLS player error: ${error.message}` : 'Native HLS playback failed',
        });
      }
    });

    useEventListener(player, 'playingChange', ({ isPlaying }) => {
      if (isPlaying) reportReady();
    });

    useEventListener(player, 'timeUpdate', () => {
      reportReady();
    });

    useEffect(() => {
      const generation = ++sourceGeneration.current;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      retryPending.current = false;
      retried.current = false;
      readyReported.current = false;
      callbacksRef.current.onBuffering(true);

      void player.replaceAsync(sourceRef.current)
        .then(() => {
          if (sourceGeneration.current === generation && playingRef.current) player.play();
        })
        .catch((error: unknown) => {
          if (sourceGeneration.current !== generation) return;
          reportPlayerError({
            kind: 'media',
            message: error instanceof Error ? error.message : 'Native HLS source failed to load',
          });
        });

      return () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        retryPending.current = false;
      };
    }, [
      metadata?.artworkUrl,
      metadata?.channelName,
      metadata?.programmeTitle,
      player,
      reportPlayerError,
      sourceUrl,
    ]);

    useEffect(() => {
      if (playing) player.play();
      else player.pause();
    }, [player, playing]);

    useEffect(() => {
      player.muted = muted;
    }, [muted, player]);

    useEffect(() => {
      let available = false;
      try {
        available = isPictureInPictureSupported();
      } catch {
        available = false;
      }
      onPictureInPictureAvailabilityChange?.(available);
      return () => onPictureInPictureAvailabilityChange?.(false);
    }, [onPictureInPictureAvailabilityChange]);

    useImperativeHandle(forwardedRef, () => ({
      requestPictureInPicture: () => {
        void videoViewRef.current?.startPictureInPicture().catch(() => {});
      },
      seekToLiveEdge: () => {
        const offset = player.currentOffsetFromLive;
        if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
          player.seekBy(offset);
        }
      },
    }), [player]);

    if (!viewAttached) return null;

    return (
      <VideoView
        ref={videoViewRef}
        player={player}
        style={style}
        pointerEvents="none"
        contentFit={viewport === 'stretch' ? 'fill' : viewport}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onFirstFrameRender={reportReady}
      />
    );
  },
);
