import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import Video, {
  type OnBufferData,
  type OnVideoErrorData,
  type VideoRef,
} from 'react-native-video';
import type { PlayerError, PlayerSurfaceHandle, PlayerSurfaceProps } from './types';

type PlayerEngine = 'vlc' | 'native';

const vlcModule = (() => {
  try {
    return require('react-native-vlc-media-player');
  } catch {
    return null;
  }
})();
const VLCPlayer = (vlcModule?.VLCPlayer ?? null) as ComponentType<any> | null;

function resolvePrimaryEngine(streamUrl: string): PlayerEngine {
  if (!VLCPlayer) return 'native';
  if (streamUrl.toLowerCase().includes('.m3u8')) return 'native';
  return 'vlc';
}

function formatVideoError(errorData: OnVideoErrorData): string {
  const details = errorData.error;
  return (
    details.errorString
    || details.localizedDescription
    || details.errorException
    || details.error
    || 'Playback failed'
  );
}

/** Native playback, including the established VLC/native failover chain. */
export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(
  function PlayerSurface(
    {
      sourceUrl,
      playing,
      muted,
      style,
      viewport = 'contain',
      metadata,
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    },
    forwardedRef,
  ) {
    const videoRef = useRef<VideoRef | null>(null);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sourceRef = useRef(sourceUrl);
    const [engine, setEngine] = useState<PlayerEngine>(() => resolvePrimaryEngine(sourceUrl));
    const [fallbackUsed, setFallbackUsed] = useState(false);
    const [retried, setRetried] = useState(false);
    const [reloadNonce, setReloadNonce] = useState(0);

    sourceRef.current = sourceUrl;

    useEffect(() => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      setEngine(resolvePrimaryEngine(sourceUrl));
      setFallbackUsed(false);
      setRetried(false);
      setReloadNonce(0);
      onBuffering(true);
    }, [sourceUrl, onBuffering]);

    useEffect(() => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    }, []);

    useEffect(() => {
      onPictureInPictureAvailabilityChange?.(false);
    }, [onPictureInPictureAvailabilityChange]);

    useImperativeHandle(forwardedRef, () => ({
      requestPictureInPicture: () => {
        videoRef.current?.enterPictureInPicture();
      },
      seekToLiveEdge: () => {},
    }), []);

    const reportStarted = useCallback(() => {
      onReady();
      onBuffering(false);
    }, [onReady, onBuffering]);

    const tryFallbackEngine = useCallback((error: PlayerError) => {
      const failedSource = sourceUrl;
      if (sourceRef.current !== failedSource) return;

      // ErsatzTV can briefly serve an empty cold-start playlist. Preserve the
      // established one-time, same-engine four-second retry before failover.
      if (!retried) {
        setRetried(true);
        onBuffering(true);
        console.warn('[Player retry after cold-start error]', error.message);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          if (sourceRef.current === failedSource) setReloadNonce((nonce) => nonce + 1);
        }, 4000);
        return;
      }

      if (fallbackUsed || !VLCPlayer) {
        onBuffering(false);
        onError(error);
        return;
      }

      setFallbackUsed(true);
      setEngine((current) => (current === 'vlc' ? 'native' : 'vlc'));
      onBuffering(true);
      console.warn('[Player failover]', error.message);
    }, [fallbackUsed, onBuffering, onError, retried, sourceUrl]);

    const handleNativeBuffer = useCallback((event: OnBufferData) => {
      onBuffering(event.isBuffering);
    }, [onBuffering]);

    const resizeMode = viewport === 'stretch' ? 'stretch' : viewport;

    if (engine === 'vlc' && VLCPlayer) {
      return (
        <VLCPlayer
          key={`vlc:${reloadNonce}:${sourceUrl}`}
          source={{
            uri: sourceUrl,
            initType: 2,
            initOptions: ['--network-caching=900', '--clock-jitter=0'],
          }}
          autoplay
          paused={!playing}
          muted={muted}
          playInBackground
          resizeMode={resizeMode}
          style={style}
          onPlaying={reportStarted}
          onProgress={() => onBuffering(false)}
          onLoad={reportStarted}
          onError={() => tryFallbackEngine({ kind: 'media', message: 'VLC player error' })}
        />
      );
    }

    return (
      <Video
        ref={videoRef}
        key={`native:${reloadNonce}:${sourceUrl}`}
        source={{
          uri: sourceUrl,
          metadata: {
            title: metadata?.channelName,
            subtitle: metadata?.programmeTitle,
            description: metadata?.description,
            imageUri: metadata?.artworkUrl,
          },
        }}
        style={style}
        resizeMode={resizeMode}
        paused={!playing}
        muted={muted}
        controls={false}
        ignoreSilentSwitch="ignore"
        automaticallyWaitsToMinimizeStalling={false}
        playInBackground
        playWhenInactive
        enterPictureInPictureOnLeave
        allowsExternalPlayback
        showNotificationControls
        onLoadStart={() => onBuffering(true)}
        onLoad={reportStarted}
        onBuffer={handleNativeBuffer}
        onProgress={() => onBuffering(false)}
        onError={(event) => tryFallbackEngine({
          kind: 'media',
          message: `Native player error: ${formatVideoError(event)}`,
        })}
      />
    );
  },
);
