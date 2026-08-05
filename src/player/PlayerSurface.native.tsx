import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
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
    const nativeViewAttachedRef = useRef(false);
    const viewAttachedRef = useRef(viewAttached);
    const [renderNativeView, setRenderNativeView] = useState(viewAttached);
    const mountedRef = useRef(true);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryPending = useRef(false);
    const retried = useRef(false);
    const readyReported = useRef(false);
    const sourceGeneration = useRef(0);
    const settledGeneration = useRef(0);
    const replaceInFlightGeneration = useRef<number | null>(null);
    const replacementChain = useRef<Promise<void>>(Promise.resolve());
    const sourceRef = useRef(videoSource(sourceUrl, metadata));
    const playingRef = useRef(playing);
    const callbacksRef = useRef({
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    });

    playingRef.current = playing;
    viewAttachedRef.current = viewAttached;
    if (!viewAttached) nativeViewAttachedRef.current = false;
    callbacksRef.current = {
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    };
    sourceRef.current = videoSource(sourceUrl, metadata);

    const player = useVideoPlayer(null, (createdPlayer) => {
      createdPlayer.staysActiveInBackground = true;
      createdPlayer.showNowPlayingNotification = true;
      createdPlayer.audioMixingMode = 'doNotMix';
      createdPlayer.allowsExternalPlayback = true;
      createdPlayer.timeUpdateEventInterval = 0.5;
    });

    const callbackIsLive = useCallback((requiresNativeView = false) => (
      mountedRef.current
      && viewAttachedRef.current
      && (!requiresNativeView || nativeViewAttachedRef.current)
    ), []);

    const emitBuffering = useCallback((next: boolean) => {
      if (callbackIsLive()) callbacksRef.current.onBuffering(next);
    }, [callbackIsLive]);

    const emitFinalError = useCallback((error: PlayerError) => {
      if (!callbackIsLive()) return;
      callbacksRef.current.onBuffering(false);
      callbacksRef.current.onError(error);
    }, [callbackIsLive]);

    const reportReady = useCallback((requiresNativeView = false) => {
      if (
        !callbackIsLive(requiresNativeView)
        || settledGeneration.current !== sourceGeneration.current
      ) return;
      callbacksRef.current.onBuffering(false);
      if (!readyReported.current) {
        readyReported.current = true;
        callbacksRef.current.onReady();
      }
    }, [callbackIsLive]);

    // expo-video cancels its native loader when replaceAsync calls overlap. Keep
    // exactly one request in flight; stale queued generations become no-ops.
    const replaceForGeneration = useCallback((source: VideoSource, generation: number) => {
      const replacement = replacementChain.current
        .catch(() => {})
        .then(async () => {
          if (!mountedRef.current || sourceGeneration.current !== generation) return;
          replaceInFlightGeneration.current = generation;
          try {
            await player.replaceAsync(source);
          } finally {
            if (replaceInFlightGeneration.current === generation) {
              replaceInFlightGeneration.current = null;
            }
          }
          if (!mountedRef.current || sourceGeneration.current !== generation) return;
          settledGeneration.current = generation;
          if (playingRef.current) player.play();
        });
      replacementChain.current = replacement.catch(() => {});
      return replacement;
    }, [player]);

    const reportPlayerError = useCallback((error: PlayerError) => {
      if (
        !callbackIsLive()
        || retryPending.current
        || settledGeneration.current !== sourceGeneration.current
      ) return;

      // ErsatzTV can briefly serve an empty cold-start playlist. Reload the
      // same HLS source once, after the established four-second grace period.
      if (!retried.current) {
        retried.current = true;
        retryPending.current = true;
        emitBuffering(true);
        console.warn('[Player retry after cold-start error]', error.message);
        const generation = sourceGeneration.current;
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          retryPending.current = false;
          if (
            !callbackIsLive()
            || sourceGeneration.current !== generation
          ) return;
          readyReported.current = false;
          settledGeneration.current = 0;
          void replaceForGeneration(sourceRef.current, generation)
            .catch((replacementError: unknown) => emitFinalError({
              kind: 'media',
              message: replacementError instanceof Error
                ? replacementError.message
                : 'Native HLS retry failed',
            }));
        }, 4000);
        return;
      }

      emitFinalError(error);
    }, [callbackIsLive, emitBuffering, emitFinalError, replaceForGeneration]);

    useEventListener(player, 'statusChange', ({ status, error }) => {
      if (!callbackIsLive()) return;
      if (status === 'loading') {
        emitBuffering(true);
      } else if (status === 'readyToPlay') {
        reportReady();
        if (
          settledGeneration.current === sourceGeneration.current
          && playingRef.current
        ) player.play();
      } else if (
        status === 'error'
        && replaceInFlightGeneration.current === null
        && settledGeneration.current === sourceGeneration.current
      ) {
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

    useLayoutEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        viewAttachedRef.current = false;
        nativeViewAttachedRef.current = false;
        videoViewRef.current = null;
        sourceGeneration.current += 1;
        settledGeneration.current = 0;
        replaceInFlightGeneration.current = null;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        retryPending.current = false;
        // Stop MediaPlayer/Now Playing ownership before the shared native
        // object is automatically released by useVideoPlayer.
        try {
          player.showNowPlayingNotification = false;
          player.pause();
        } catch {
          // The native shared object may already have entered release.
        }
      };
    }, [player]);

    useEffect(() => {
      const generation = ++sourceGeneration.current;
      settledGeneration.current = 0;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      retryPending.current = false;
      retried.current = false;
      readyReported.current = false;
      emitBuffering(true);

      const requestedSource = sourceRef.current;
      void replaceForGeneration(requestedSource, generation)
        .catch((error: unknown) => {
          if (!mountedRef.current || sourceGeneration.current !== generation) return;
          // A source-load rejection is safe to feed into the one-retry policy;
          // stale native events were filtered before reaching this point.
          settledGeneration.current = generation;
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
      // Metadata is captured for a real source tune. EPG clock changes must
      // not tear down and reload the same live stream merely to refresh copy.
    }, [emitBuffering, player, replaceForGeneration, reportPlayerError, sourceUrl]);

    useEffect(() => {
      if (!mountedRef.current) return;
      if (playing) player.play();
      else player.pause();
    }, [player, playing]);

    useEffect(() => {
      if (mountedRef.current) player.muted = muted;
    }, [muted, player]);

    useEffect(() => {
      if (viewAttached && player.status === 'readyToPlay') reportReady();
    }, [player.status, reportReady, viewAttached]);

    useEffect(() => {
      // Detach in two commits: first disarm automatic PiP and apply the hidden
      // seat, then unmount. Reattachment likewise happens once, on the next
      // commit. Repeated values are idempotent and never churn the native view.
      setRenderNativeView((current) => current === viewAttached ? current : viewAttached);
    }, [viewAttached]);

    useEffect(() => {
      let available = false;
      try {
        available = isPictureInPictureSupported();
      } catch {
        available = false;
      }
      if (mountedRef.current) {
        callbacksRef.current.onPictureInPictureAvailabilityChange?.(available);
      }
      return () => {
        if (mountedRef.current) {
          callbacksRef.current.onPictureInPictureAvailabilityChange?.(false);
        }
      };
    }, []);

    const setVideoViewRef = useCallback((instance: VideoViewInstance | null) => {
      if (videoViewRef.current === instance) return;
      videoViewRef.current = instance;
      nativeViewAttachedRef.current = instance !== null && viewAttachedRef.current;
    }, []);

    useImperativeHandle(forwardedRef, () => ({
      requestPictureInPicture: () => {
        if (!mountedRef.current || !nativeViewAttachedRef.current) return;
        void videoViewRef.current?.startPictureInPicture().catch(() => {});
      },
      seekToLiveEdge: () => {
        if (!mountedRef.current) return;
        const offset = player.currentOffsetFromLive;
        if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
          player.seekBy(offset);
        }
      },
    }), [player]);

    if (!renderNativeView) return null;

    return (
      <VideoView
        ref={setVideoViewRef}
        player={player}
        style={style}
        pointerEvents="none"
        contentFit={viewport === 'stretch' ? 'fill' : viewport}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically={playing && viewAttached}
        onFirstFrameRender={() => reportReady(true)}
      />
    );
  },
);
