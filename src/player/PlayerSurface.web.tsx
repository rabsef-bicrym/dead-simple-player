import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import Hls from 'hls.js';
import {
  decideHlsRecovery,
  initialHlsRecoveryState,
  markHlsPlaybackHealthy,
  type HlsFailureType,
  type HlsRecoveryState,
} from './hlsRecoveryController';
import type { PlayerSurfaceHandle, PlayerSurfaceProps } from './types';

const HIDDEN_LIVE_EDGE_THRESHOLD_MS = 60_000;

interface SafariVideoElement extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
}

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

function supportsPictureInPicture(video: SafariVideoElement): boolean {
  const standard = document.pictureInPictureEnabled
    && typeof video.requestPictureInPicture === 'function';
  if (standard) return true;
  try {
    return video.webkitSupportsPresentationMode?.('picture-in-picture') === true
      && typeof video.webkitSetPresentationMode === 'function';
  } catch {
    return false;
  }
}

function requestPictureInPicture(video: SafariVideoElement): void {
  if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
    // Invocation deliberately happens before any await: transient activation
    // from the plate/key gesture must still be live.
    void video.requestPictureInPicture().catch(() => {});
    return;
  }
  try {
    if (
      video.webkitSupportsPresentationMode?.('picture-in-picture')
      && typeof video.webkitSetPresentationMode === 'function'
    ) {
      video.webkitSetPresentationMode('picture-in-picture');
    }
  } catch {
    // Presentation mode support differs across Safari releases.
  }
}

function seekVideoToLiveEdge(video: HTMLVideoElement, hls: Hls | null): void {
  const hlsTarget = hls?.liveSyncPosition;
  if (typeof hlsTarget === 'number' && Number.isFinite(hlsTarget)) {
    video.currentTime = hlsTarget;
    return;
  }
  if (video.seekable.length > 0) {
    const liveEnd = video.seekable.end(video.seekable.length - 1);
    if (Number.isFinite(liveEnd)) video.currentTime = Math.max(0, liveEnd - 0.25);
  }
}

/** Modern live-TV web playback behind the shared player contract. */
export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(
  function PlayerSurface(
    {
      sourceUrl,
      playing,
      muted,
      style,
      viewport = 'contain',
      metadata,
      mediaSessionControls,
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    },
    forwardedRef,
  ) {
    const videoRef = useRef<SafariVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const playingRef = useRef(playing);
    const mutedRef = useRef(muted);
    const needsSoundRef = useRef(false);
    const callbacksRef = useRef({ onReady, onBuffering, onError, onPictureInPictureAvailabilityChange });
    const [needsSound, setNeedsSound] = useState(false);

    playingRef.current = playing;
    mutedRef.current = muted;
    callbacksRef.current = { onReady, onBuffering, onError, onPictureInPictureAvailabilityChange };

    const setSoundNeeded = useCallback((needed: boolean) => {
      needsSoundRef.current = needed;
      setNeedsSound(needed);
    }, []);

    const attemptPlayback = useCallback((video: HTMLVideoElement) => {
      if (!playingRef.current) return;
      video.muted = mutedRef.current || needsSoundRef.current;
      const playAttempt = video.play();
      void playAttempt.catch(() => {
        if (mutedRef.current) return;
        video.muted = true;
        setSoundNeeded(true);
        void video.play().catch(() => {});
      });
    }, [setSoundNeeded]);

    useImperativeHandle(forwardedRef, () => ({
      requestPictureInPicture: () => {
        const video = videoRef.current;
        if (video) requestPictureInPicture(video);
      },
      seekToLiveEdge: () => {
        const video = videoRef.current;
        if (video) seekVideoToLiveEdge(video, hlsRef.current);
      },
    }), []);

    // A source change tears the complete pipeline down. loadSource is never
    // used to retune an existing Hls instance.
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (!sourceUrl) {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        callbacksRef.current.onBuffering(false);
        callbacksRef.current.onPictureInPictureAvailabilityChange?.(false);
        setSoundNeeded(false);
        return;
      }

      let disposed = false;
      let attachTimer: ReturnType<typeof setTimeout> | null = null;
      let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
      let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
      let recoveryState: HlsRecoveryState = { ...initialHlsRecoveryState };
      let needsLiveEdge = false;
      let wakeLock: WakeLockSentinelLike | null = null;
      let readyReported = false;

      const clearAttachTimer = () => {
        if (attachTimer) clearTimeout(attachTimer);
        attachTimer = null;
      };

      const releaseWakeLock = () => {
        const lock = wakeLock;
        wakeLock = null;
        if (lock && !lock.released) void lock.release().catch(() => {});
      };

      const acquireWakeLock = async () => {
        const wakeLockApi = (navigator as WakeLockNavigator).wakeLock;
        if (
          !wakeLockApi
          || disposed
          || !playingRef.current
          || video.paused
          || document.visibilityState !== 'visible'
          || (wakeLock && !wakeLock.released)
        ) return;
        try {
          const requested = await wakeLockApi.request('screen');
          if (disposed || !playingRef.current || video.paused) {
            void requested.release().catch(() => {});
            return;
          }
          wakeLock = requested;
          requested.addEventListener('release', () => {
            if (wakeLock === requested) wakeLock = null;
          });
        } catch {
          // Wake lock can be denied by browser policy or power settings.
        }
      };

      const markHealthy = () => {
        recoveryState = markHlsPlaybackHealthy(recoveryState, Date.now());
        callbacksRef.current.onBuffering(false);
        if (!readyReported) {
          readyReported = true;
          callbacksRef.current.onReady();
        }
      };

      const rejoinIfNeeded = (instance: Hls | null) => {
        if (!needsLiveEdge) return;
        seekVideoToLiveEdge(video, instance);
        needsLiveEdge = false;
      };

      const destroyHls = () => {
        clearAttachTimer();
        hlsRef.current?.destroy();
        hlsRef.current = null;
      };

      let createPipeline: () => void;

      const scheduleRebuild = (delayMs: number, surfaceError: boolean) => {
        destroyHls();
        video.pause();
        video.removeAttribute('src');
        video.load();
        callbacksRef.current.onBuffering(true);
        needsLiveEdge = true;
        readyReported = false;
        if (surfaceError) {
          callbacksRef.current.onError({
            kind: 'recovery-exhausted',
            message: 'The signal has not returned. The receiver will keep trying.',
          });
        }
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
          rebuildTimer = null;
          if (!disposed) createPipeline();
        }, delayMs);
      };

      const recoverFrom = (fatal: boolean, type: HlsFailureType, instance: Hls | null) => {
        const decision = decideHlsRecovery(recoveryState, { fatal, type }, Date.now());
        recoveryState = decision.state;

        switch (decision.action.type) {
          case 'ignore':
            return;
          case 'start-load':
            needsLiveEdge = true;
            instance?.startLoad();
            return;
          case 'recover-media':
            needsLiveEdge = true;
            instance?.recoverMediaError();
            return;
          case 'rebuild':
            scheduleRebuild(decision.action.delayMs, decision.action.surfaceError);
            return;
        }
      };

      const handleNativeError = () => {
        if (!hlsRef.current && !rebuildTimer) recoverFrom(true, 'other', null);
      };

      createPipeline = () => {
        if (disposed) return;
        callbacksRef.current.onBuffering(true);

        if (Hls.isSupported()) {
          const instance = new Hls({
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            liveDurationInfinity: true,
            maxBufferLength: 20,
            maxMaxBufferLength: 30,
            backBufferLength: 30,
            enableWorker: true,
            abrEwmaDefaultEstimate: 10_000_000,
            capLevelToPlayerSize: true,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            fragLoadingMaxRetry: 6,
          });
          hlsRef.current = instance;

          instance.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (hlsRef.current === instance) clearAttachTimer();
          });
          instance.on(Hls.Events.FRAG_BUFFERED, () => {
            if (hlsRef.current !== instance) return;
            rejoinIfNeeded(instance);
            markHealthy();
          });
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (hlsRef.current !== instance) return;
            const type: HlsFailureType = data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? 'network'
              : data.type === Hls.ErrorTypes.MEDIA_ERROR
                ? 'media'
                : 'other';
            recoverFrom(data.fatal, type, instance);
          });

          attachTimer = setTimeout(() => {
            if (hlsRef.current !== instance) return;
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
              destroyHls();
              video.src = sourceUrl;
              attemptPlayback(video);
            } else {
              recoverFrom(true, 'other', instance);
            }
          }, 6000);

          // Ordering is intentional: attach the MediaSource before loading the
          // playlist, and never retune this instance to another source.
          instance.attachMedia(video);
          instance.loadSource(sourceUrl);
          return;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari's native HLS path remains ahead of the unsupported case;
          // iOS playback and AirPlay depend on it.
          video.src = sourceUrl;
          attemptPlayback(video);
          return;
        }

        callbacksRef.current.onBuffering(false);
        callbacksRef.current.onError({
          kind: 'unsupported',
          message: 'This browser cannot play HLS streams',
        });
      };

      const onCanPlay = () => {
        rejoinIfNeeded(hlsRef.current);
        markHealthy();
        attemptPlayback(video);
      };
      const onWaiting = () => callbacksRef.current.onBuffering(true);
      const onTimeUpdate = () => callbacksRef.current.onBuffering(false);
      const onPlay = () => { void acquireWakeLock(); };
      const onPause = () => releaseWakeLock();
      const onLoadedMetadata = () => {
        callbacksRef.current.onPictureInPictureAvailabilityChange?.(supportsPictureInPicture(video));
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now();
          releaseWakeLock();
          return;
        }
        if (
          hiddenAt !== null
          && Date.now() - hiddenAt > HIDDEN_LIVE_EDGE_THRESHOLD_MS
          && playingRef.current
        ) {
          seekVideoToLiveEdge(video, hlsRef.current);
        }
        hiddenAt = null;
        if (playingRef.current && !video.paused) void acquireWakeLock();
      };
      const restoreSound = () => {
        if (!needsSoundRef.current) return;
        video.muted = mutedRef.current;
        setSoundNeeded(false);
        // Direct call inside the gesture handler retains autoplay activation.
        void video.play().catch(() => {});
      };

      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('ended', onPause);
      video.addEventListener('error', handleNativeError);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      document.addEventListener('visibilitychange', onVisibilityChange);
      document.addEventListener('pointerdown', restoreSound);
      document.addEventListener('keydown', restoreSound);

      callbacksRef.current.onPictureInPictureAvailabilityChange?.(supportsPictureInPicture(video));
      createPipeline();

      return () => {
        disposed = true;
        if (rebuildTimer) clearTimeout(rebuildTimer);
        clearAttachTimer();
        releaseWakeLock();
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('ended', onPause);
        video.removeEventListener('error', handleNativeError);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        document.removeEventListener('pointerdown', restoreSound);
        document.removeEventListener('keydown', restoreSound);
        destroyHls();
        video.pause();
        video.removeAttribute('src');
        video.load();
        callbacksRef.current.onPictureInPictureAvailabilityChange?.(false);
      };
    }, [attemptPlayback, setSoundNeeded, sourceUrl]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      if (!playing) {
        video.pause();
        return;
      }
      attemptPlayback(video);
    }, [attemptPlayback, playing]);

    useEffect(() => {
      const video = videoRef.current;
      if (video && !needsSoundRef.current) video.muted = muted;
    }, [muted]);

    useEffect(() => {
      if (!('mediaSession' in navigator)) return;
      const session = navigator.mediaSession;
      if ('MediaMetadata' in window) {
        session.metadata = new MediaMetadata({
          title: metadata?.programmeTitle ?? metadata?.channelName ?? 'Dead Simple Player',
          artist: metadata?.programmeTitle ? metadata.channelName : undefined,
          album: 'Dead Simple Player',
          artwork: metadata?.artworkUrl
            ? [{ src: metadata.artworkUrl, sizes: '512x512' }]
            : undefined,
        });
      }

      const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        try {
          session.setActionHandler(action, handler);
        } catch {
          // Unsupported action names throw in several browser versions.
        }
      };
      setHandler('play', () => {
        const video = videoRef.current;
        if (video) {
          if (!mutedRef.current) {
            video.muted = false;
            setSoundNeeded(false);
          }
          attemptPlayback(video);
        }
      });
      setHandler('pause', () => videoRef.current?.pause());
      setHandler('previoustrack', () => mediaSessionControls?.onPreviousTrack());
      setHandler('nexttrack', () => mediaSessionControls?.onNextTrack());
      setHandler('enterpictureinpicture' as MediaSessionAction, () => {
        const video = videoRef.current;
        if (video) requestPictureInPicture(video);
      });

      return () => {
        setHandler('play', null);
        setHandler('pause', null);
        setHandler('previoustrack', null);
        setHandler('nexttrack', null);
        setHandler('enterpictureinpicture' as MediaSessionAction, null);
        session.metadata = null;
      };
    }, [attemptPlayback, mediaSessionControls, metadata, setSoundNeeded]);

    const objectFit = viewport === 'stretch' ? 'fill' : viewport;

    return (
      <View style={style}>
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit,
            backgroundColor: '#000',
          }}
          playsInline
        />
        {needsSound && (
          <div
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              backgroundColor: '#000',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '8px 14px',
              fontFamily: 'Helvetica Neue, sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
              pointerEvents: 'none',
            }}
          >
            {navigator.maxTouchPoints > 0 ? 'TAP FOR SOUND' : 'CLICK FOR SOUND'}
          </div>
        )}
      </View>
    );
  },
);
