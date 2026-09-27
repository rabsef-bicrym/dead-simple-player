import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useEventListener } from 'expo';
import { isPictureInPictureSupported, useVideoPlayer, type VideoSource } from 'expo-video';
import {
  DSPPictureNativeView,
  pictureAvailable,
  playerId,
  type DSPFirstFrame,
  type DSPItemFailed,
  type DSPItemLost,
  type DSPPictureHandle,
  type DSPPipChange,
  type DSPStartResult,
  type DSPTraceRow,
} from '../../modules/dsp-picture';
import { traceBindGeneration, traceEvent, traceTuneWitness } from '../services/tuneTrace';
import {
  createGateState,
  reduceGate,
  type GateAction,
  type GateEvent,
  type GateState,
} from './firstFrameGate';
import type { PlayerMetadata, PlayerSurfaceHandle, PlayerSurfaceProps } from './types';

/**
 * The native surface: one persistent AVPlayer per mount (R6), its picture
 * hosted by modules/dsp-picture (the AVPlayerLayer, the first-frame witness,
 * PiP and the `N` rows — docs/native-witness.md), and the first-frame gate
 * (`firstFrameGate.ts`) deciding what every fact means.
 *
 * The order of a tune: `tuneTo` → `invalidate()` (synchronous; a generation
 * before any setState) → the source effect takes that generation → the chain:
 * `muted = …` (R5) → `expect(g, uri)` (rate 0 across the swap, FF-02; the next
 * item binds to g) → `replaceAsync` (resolves after the item is current: the
 * one patch hunk) → `settle(g)` in the same continuation (replays a latched
 * fire or error, FF-03) → `startPlayback(g, uri)` (native `playImmediately`,
 * re-issued on data; the one owner of playback start). Nothing in JS calls
 * `play()` before the first frame.
 *
 * What ends the static: `onFirstFrame(g)`, reachable only from the gate's
 * `first-frame` action, reachable only from the module's `onFirstFrame` for
 * the settled current generation (or its replay at settle). Errors,
 * `readyToPlay`, `playingChange`, `timeUpdate`, rebuilds, rotation, PiP and
 * app state never touch it (R1).
 *
 * Timers: one, the retry ladder's, which starts a FETCH and ends nothing.
 */

// Generations are unique per launch, not per mount: a late row from a
// previous mount can never wear the new mount's first generation. The gate
// carries the counter; every dispatch writes it back here.
let nextGeneration = 0;
/** Decision 6(d): a measured request; `N config` prints what the item took. */
const LIVE_OFFSET_SECONDS = 8;

function videoSource(sourceUrl: string | null, metadata?: PlayerMetadata): VideoSource {
  if (!sourceUrl) return null;
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
      pictureInPictureAuto = true,
      onReady,
      onFirstFrame,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
      onPictureInPictureChange,
    },
    forwardedRef,
  ) {
    const pictureRef = useRef<DSPPictureHandle | null>(null);
    const nativeViewAttachedRef = useRef(false);
    const viewAttachedRef = useRef(viewAttached);
    const [renderNativeView, setRenderNativeView] = useState(viewAttached);
    const mountedRef = useRef(true);
    const gate = useRef<GateState>(createGateState(nextGeneration));
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const replacementChain = useRef<Promise<void>>(Promise.resolve());
    const timeUpdateTracedGeneration = useRef(0);
    const pipActiveRef = useRef(false);
    const sourceRef = useRef(videoSource(sourceUrl, metadata));
    const sourceUrlRef = useRef(sourceUrl);
    const playingRef = useRef(playing);
    const mutedRef = useRef(muted);
    const pictureInPictureAutoRef = useRef(pictureInPictureAuto);
    const callbacksRef = useRef({
      onReady,
      onFirstFrame,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
      onPictureInPictureChange,
    });

    playingRef.current = playing;
    mutedRef.current = muted;
    viewAttachedRef.current = viewAttached;
    pictureInPictureAutoRef.current = pictureInPictureAuto;
    if (!viewAttached) nativeViewAttachedRef.current = false;
    callbacksRef.current = {
      onReady,
      onFirstFrame,
      onBuffering,
      onError,
      onPictureInPictureAvailabilityChange,
      onPictureInPictureChange,
    };
    sourceRef.current = videoSource(sourceUrl, metadata);
    sourceUrlRef.current = sourceUrl;

    const player = useVideoPlayer(null, (createdPlayer) => {
      createdPlayer.staysActiveInBackground = true;
      createdPlayer.showNowPlayingNotification = true;
      createdPlayer.audioMixingMode = 'doNotMix';
      createdPlayer.allowsExternalPlayback = true;
      createdPlayer.timeUpdateEventInterval = 0.5;
    });

    const callbackIsLive = useCallback(
      () => mountedRef.current && viewAttachedRef.current,
      [],
    );

    // The generation a listener row arrives under. After the layout cleanup
    // the current generation is bound to nothing, and the listeners outlive
    // it until their passive effect unsubscribes; a row in that window goes
    // untagged (g 0 routes to the newest tune) rather than wearing a number
    // no tune knows and lighting the dropped line.
    const arrivalGeneration = useCallback(
      () => (mountedRef.current ? gate.current.sourceGeneration : 0),
      [],
    );

    // `dispatch` is a stable trampoline so the chain (which needs it) and the
    // action runner (which needs the chain) can each be a plain callback.
    const dispatchRef = useRef<(event: GateEvent) => void>(() => {});
    const dispatch = useCallback((event: GateEvent) => dispatchRef.current(event), []);

    // expo-video cancels its native loader when replaceAsync calls overlap.
    // Keep exactly one request in flight; stale queued generations become
    // no-ops. Every await is followed by the generation re-check.
    const replaceForGeneration = useCallback((source: VideoSource, generation: number) => {
      const uri = typeof source === 'object' && source?.uri ? source.uri : 'source absent';
      const current = () => gate.current.sourceGeneration;
      const replacement = replacementChain.current
        .catch(() => {})
        .then(async () => {
          if (!mountedRef.current || current() !== generation) return;
          // Break the old audio signal before replacing its item. Static and
          // cleared-source states must never carry sound between stations (R5).
          player.muted = mutedRef.current;
          const picture = pictureRef.current;
          if (picture) {
            // Rate 0 across the swap; the next non-nil item binds to this
            // generation. A rejection here is plumbing, not media: the item
            // binds unexpected and startPlayback adopts it by URL.
            try {
              await picture.expect(generation, uri);
            } catch (error: unknown) {
              traceEvent('expect failed', error instanceof Error ? error.message : String(error), { g: generation });
            }
            if (!mountedRef.current || current() !== generation) return;
          }
          traceEvent('replaceAsync start', uri, { g: generation });
          await player.replaceAsync(source);
          traceEvent('replaceAsync resolve', uri, { g: generation });
          if (!mountedRef.current || current() !== generation) return;
          // Same continuation as the resolve: no window for a fact to fall in.
          dispatch({ type: 'settle', g: generation });
          player.showNowPlayingNotification = true;
          if (!playingRef.current) return;
          const started = pictureRef.current;
          if (!started) {
            // No picture view (the module is not linked): nothing can witness
            // a frame, so nothing starts and the static stays (R1); the
            // header reads witness=absent.
            traceEvent('startPlayback', 'no picture view', { g: generation });
            return;
          }
          let result: DSPStartResult;
          try {
            result = await started.startPlayback(generation, uri);
          } catch (error: unknown) {
            traceEvent('startPlayback failed', error instanceof Error ? error.message : String(error), { g: generation });
            result = 'unbound';
          }
          if (!mountedRef.current || current() !== generation) return;
          dispatch({ type: 'start-result', g: generation, result });
        });
      replacementChain.current = replacement.catch(() => {});
      return replacement;
    }, [dispatch, player]);

    const perform = useCallback((action: GateAction) => {
      switch (action.type) {
        case 'trace':
          traceEvent(action.name, action.detail, { g: action.g });
          return;
        case 'bind-generation':
          traceBindGeneration(action.g);
          return;
        case 'buffering':
          if (callbackIsLive()) callbacksRef.current.onBuffering(action.on);
          return;
        case 'ready':
          if (callbackIsLive()) callbacksRef.current.onReady();
          return;
        case 'first-frame':
          if (callbackIsLive()) callbacksRef.current.onFirstFrame?.(action.g);
          return;
        case 'error':
          if (callbackIsLive()) callbacksRef.current.onError(action.error);
          return;
        case 'replace':
          void replaceForGeneration(sourceRef.current, action.g)
            .catch((error: unknown) => dispatch({
              type: 'chain-rejected',
              g: action.g,
              message: error instanceof Error ? error.message : 'Native HLS source failed to load',
            }));
          return;
        case 'schedule-retry': {
          // Starts an attempt; ends nothing (R1). The delay is the ladder's.
          if (retryTimer.current) clearTimeout(retryTimer.current);
          const { g } = action;
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            dispatch({ type: 'retry-fired', g });
          }, action.delayMs);
          return;
        }
        case 'cancel-retry':
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = null;
          return;
      }
    }, [callbackIsLive, dispatch, replaceForGeneration]);

    dispatchRef.current = (event: GateEvent) => {
      const { state, actions } = reduceGate(gate.current, event);
      gate.current = state;
      nextGeneration = Math.max(nextGeneration, state.nextGeneration);
      for (const action of actions) perform(action);
    };

    // ── The module's events ──

    const onNativeTrace = useCallback((e: { nativeEvent: DSPTraceRow }) => {
      const { t, g, i, name, detail } = e.nativeEvent;
      const tag = { g: g > 0 ? g : undefined, nativeT: t, item: i !== '-' ? i : undefined };
      traceEvent(name, detail, tag);
      // The module is in this build: the header's witness= says so (FF-06's
      // tell, now about the module, not the patch).
      if (name === 'N item') traceTuneWitness('present', { g: tag.g });
    }, []);

    const onNativeFirstFrame = useCallback((e: { nativeEvent: DSPFirstFrame }) => {
      const { g, i, via } = e.nativeEvent;
      dispatch({ type: 'native-first-frame', g, item: i, via });
    }, [dispatch]);

    const onNativeItemLost = useCallback((e: { nativeEvent: DSPItemLost }) => {
      const { g, i } = e.nativeEvent;
      dispatch({ type: 'native-item-lost', g, item: i });
    }, [dispatch]);

    const onNativeItemFailed = useCallback((e: { nativeEvent: DSPItemFailed }) => {
      const { g, i, domain, code, message } = e.nativeEvent;
      dispatch({ type: 'native-item-failed', g, item: i, error: { kind: 'media', message: `${domain}/${code} ${message}` } });
    }, [dispatch]);

    const onNativePip = useCallback((e: { nativeEvent: DSPPipChange }) => {
      const { active, possible } = e.nativeEvent;
      if (pipActiveRef.current !== active) {
        pipActiveRef.current = active;
        traceEvent('pip', active ? 'start' : 'stop', { g: arrivalGeneration() });
        if (mountedRef.current) callbacksRef.current.onPictureInPictureChange?.(active);
      }
      if (mountedRef.current) callbacksRef.current.onPictureInPictureAvailabilityChange?.(possible);
    }, [arrivalGeneration]);

    // ── expo-video's events: rows and buffer health; never a start, never a first frame ──

    useEventListener(player, 'statusChange', ({ status, error }) => {
      const g = arrivalGeneration();
      traceEvent('statusChange', error?.message ? `${status}: ${error.message}` : status, { g });
      if (!callbackIsLive()) return;
      if (status === 'loading') {
        callbacksRef.current.onBuffering(true);
      } else if (status === 'readyToPlay') {
        dispatch({ type: 'ready' });
      } else if (status === 'error') {
        dispatch({
          type: 'status-error',
          g,
          error: {
            kind: 'media',
            message: error?.message ? `Native HLS player error: ${error.message}` : 'Native HLS playback failed',
          },
        });
      }
    });

    useEventListener(player, 'playingChange', ({ isPlaying }) => {
      traceEvent('playingChange', String(isPlaying), { g: arrivalGeneration() });
      if (isPlaying) dispatch({ type: 'ready' });
    });

    useEventListener(player, 'timeUpdate', ({ currentTime }) => {
      const generation = arrivalGeneration();
      if (timeUpdateTracedGeneration.current !== generation) {
        timeUpdateTracedGeneration.current = generation;
        // The URI is the requested prop, not the ticking item's identity.
        traceEvent('first timeUpdate', `${currentTime.toFixed(3)}s requested=${sourceUrlRef.current ?? 'source absent'}`, { g: generation });
      }
      dispatch({ type: 'ready' });
    });

    useLayoutEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        viewAttachedRef.current = false;
        nativeViewAttachedRef.current = false;
        pictureRef.current = null;
        dispatch({ type: 'unmount' });
        // Stop MediaPlayer/Now Playing ownership before the shared native
        // object is automatically released by useVideoPlayer.
        try {
          player.showNowPlayingNotification = false;
          player.pause();
        } catch {
          // The native shared object may already have entered release.
        }
      };
    }, [dispatch, player]);

    // The source effect: the generation comes from tuneTo's invalidate() when
    // there was one; a fresh mount allocates its own.
    useEffect(() => {
      dispatch({ type: 'take', reason: 'source', hasSource: sourceUrl !== null });

      // A cleared source means silence, not surgery: pause and mute instead of
      // replaceAsync(null) — a replace-with-null that hangs on iOS poisons the
      // serialization chain, and every later tune queues behind it forever (R7).
      if (!sourceUrl) {
        try {
          player.pause();
          player.muted = true;
        } catch {
          // The shared native object may be mid-release.
        }
        return () => {};
      }
      if (Platform.OS === 'ios' && !pictureAvailable) {
        traceTuneWitness('absent', { g: gate.current.sourceGeneration });
      }
      return () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
      };
      // Metadata is captured for a real source tune. EPG clock changes must
      // not tear down and reload the same live stream merely to refresh copy.
    }, [dispatch, player, sourceUrl]);

    // The pre-swap play() is gone: `playing` is a constant true in DS,P, and a
    // future false→true is honoured only on a settled generation. A source
    // change never reaches this effect.
    useEffect(() => {
      if (!mountedRef.current) return;
      const { settledGeneration, sourceGeneration } = gate.current;
      if (settledGeneration === 0 || settledGeneration !== sourceGeneration) return;
      if (playing && sourceUrlRef.current) player.play();
      else player.pause();
    }, [player, playing]);

    useEffect(() => {
      if (mountedRef.current) player.muted = muted;
    }, [muted, player]);

    useEffect(() => {
      if (viewAttached && player.status === 'readyToPlay') dispatch({ type: 'ready' });
    }, [dispatch, player.status, viewAttached]);

    useEffect(() => {
      // Detach in two commits: first disarm automatic PiP and apply the hidden
      // seat, then unmount. Reattachment likewise happens once, on the next
      // commit. Repeated values are idempotent and never churn the native view.
      setRenderNativeView((current) => current === viewAttached ? current : viewAttached);
    }, [viewAttached]);

    useEffect(() => {
      // The initial answer; the module refines it with every `possible` change.
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

    const setPictureRef = useCallback((instance: DSPPictureHandle | null) => {
      if (pictureRef.current === instance) return;
      pictureRef.current = instance;
      nativeViewAttachedRef.current = instance !== null && viewAttachedRef.current;
    }, []);

    useImperativeHandle(forwardedRef, () => ({
      invalidate: () => {
        if (!mountedRef.current) return;
        dispatch({ type: 'invalidate' });
      },
      rejoin: (reason: string) => {
        if (!mountedRef.current) return;
        traceEvent('rejoin', reason, { g: gate.current.sourceGeneration });
        dispatch({ type: 'take', reason: 'rejoin', detail: `rejoin:${reason}` });
      },
      requestPictureInPicture: () => {
        if (!mountedRef.current || !nativeViewAttachedRef.current) return;
        if (!pictureInPictureAutoRef.current) {
          // Decision 1: never while tuning.
          traceEvent('pip', 'request refused while tuning', { g: gate.current.sourceGeneration });
          return;
        }
        void pictureRef.current?.startPictureInPicture().catch(() => {});
      },
      seekToLiveEdge: () => {
        if (!mountedRef.current) return;
        const offset = player.currentOffsetFromLive;
        if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
          player.seekBy(offset);
        }
      },
    }), [dispatch, player]);

    if (!renderNativeView) return null;
    // Expo Go, or a non-iOS build: watch.tsx shows its "requires a development
    // build" seat; here there is nothing to host the picture in.
    if (!DSPPictureNativeView) return null;

    return (
      <DSPPictureNativeView
        ref={setPictureRef}
        player={playerId(player)}
        style={style}
        pointerEvents="none"
        contentFit={viewport === 'stretch' ? 'fill' : viewport}
        automaticPictureInPicture={playing && viewAttached && pictureInPictureAuto}
        liveOffsetSeconds={LIVE_OFFSET_SECONDS}
        onTrace={onNativeTrace}
        onFirstFrame={onNativeFirstFrame}
        onItemLost={onNativeItemLost}
        onItemFailed={onNativeItemFailed}
        onPictureInPictureChange={onNativePip}
      />
    );
  },
);
