import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface WebVideoProps {
  streamUrl: string;
  onStarted: () => void;
  onProgress: () => void;
  onError: (reason: string) => void;
}

/**
 * Web playback surface. Browsers (except Safari) can't play HLS in a
 * bare <video>, so we attach hls.js. Autoplay policy means the first
 * play may only be allowed muted — we start muted, then unmute on the
 * first user gesture anywhere on the page.
 */
export function WebVideo({ streamUrl, onStarted, onProgress, onError }: WebVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [needsSound, setNeedsSound] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        // Live edge: keep close but tolerate the segmenter's cadence.
        liveSyncDurationCount: 3,
        maxBufferLength: 30,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      // Some environments expose MediaSource but never fire sourceopen
      // (hls.js then waits forever). If attach doesn't complete, drop to
      // the browser's native HLS pipeline if it has one.
      attachTimer = setTimeout(() => {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          hls?.destroy();
          hls = null;
          video.src = streamUrl;
        } else {
          onError('Media engine unavailable (MediaSource never opened)');
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
          onError(`Web player error: ${data.details}`);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively.
      video.src = streamUrl;
    } else {
      onError('This browser cannot play HLS streams');
      return;
    }

    const attemptPlay = async () => {
      try {
        await video.play();
      } catch {
        // Autoplay with sound blocked — retry muted, unmute on gesture.
        video.muted = true;
        setNeedsSound(true);
        video.play().catch(() => {
          /* even muted autoplay refused; user gesture will start it */
        });
      }
    };

    const onCanPlay = () => {
      onStarted();
      void attemptPlay();
    };
    const onTimeUpdate = () => onProgress();
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);

    const unmute = () => {
      if (videoRef.current) {
        videoRef.current.muted = false;
        void videoRef.current.play().catch(() => {});
      }
      setNeedsSound(false);
      document.removeEventListener('pointerdown', unmute);
      document.removeEventListener('keydown', unmute);
    };
    document.addEventListener('pointerdown', unmute);
    document.addEventListener('keydown', unmute);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
      document.removeEventListener('pointerdown', unmute);
      document.removeEventListener('keydown', unmute);
      if (attachTimer) clearTimeout(attachTimer);
      hls?.destroy();
    };
  }, [streamUrl, onStarted, onProgress, onError]);

  return (
    <>
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
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
          {typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 'TAP FOR SOUND' : 'CLICK FOR SOUND'}
        </div>
      )}
    </>
  );
}
