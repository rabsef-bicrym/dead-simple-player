import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import Hls from 'hls.js';
import type { PlayerSurfaceHandle, PlayerSurfaceProps } from './types';

/** Web HLS surface. Recovery and browser integrations are layered here. */
export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(
  function PlayerSurface(
    {
      sourceUrl,
      playing,
      muted,
      style,
      viewport = 'contain',
      onReady,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
    },
    forwardedRef,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [needsSound, setNeedsSound] = useState(false);

    useImperativeHandle(forwardedRef, () => ({
      requestPictureInPicture: () => {},
      seekToLiveEdge: () => {},
    }), []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      let hls: Hls | null = null;
      let attachTimer: ReturnType<typeof setTimeout> | null = null;

      onPictureInPictureAvailabilityChange?.(false);
      onBuffering(true);

      if (Hls.isSupported()) {
        hls = new Hls({
          liveSyncDurationCount: 3,
          maxBufferLength: 30,
        });
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        attachTimer = setTimeout(() => {
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            hls?.destroy();
            hls = null;
            video.src = sourceUrl;
          } else {
            onError({ kind: 'unsupported', message: 'Media engine unavailable (MediaSource never opened)' });
          }
        }, 6000);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (attachTimer) clearTimeout(attachTimer);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            onError({ kind: 'unknown', message: `Web player error: ${data.details}` });
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = sourceUrl;
      } else {
        onError({ kind: 'unsupported', message: 'This browser cannot play HLS streams' });
        return;
      }

      const attemptPlay = async () => {
        if (!playing) return;
        video.muted = muted;
        try {
          await video.play();
        } catch {
          video.muted = true;
          setNeedsSound(true);
          video.play().catch(() => {});
        }
      };

      const onCanPlay = () => {
        onReady();
        onBuffering(false);
        void attemptPlay();
      };
      const onWaiting = () => onBuffering(true);
      const onTimeUpdate = () => onBuffering(false);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('timeupdate', onTimeUpdate);

      const unmute = () => {
        video.muted = muted;
        void video.play().catch(() => {});
        setNeedsSound(false);
        document.removeEventListener('pointerdown', unmute);
        document.removeEventListener('keydown', unmute);
      };
      document.addEventListener('pointerdown', unmute);
      document.addEventListener('keydown', unmute);

      return () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('timeupdate', onTimeUpdate);
        document.removeEventListener('pointerdown', unmute);
        document.removeEventListener('keydown', unmute);
        if (attachTimer) clearTimeout(attachTimer);
        hls?.destroy();
        video.removeAttribute('src');
        video.load();
      };
    }, [sourceUrl, playing, muted, onReady, onBuffering, onError, onPictureInPictureAvailabilityChange]);

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
