import { useEffect, useState, useCallback, useRef, useMemo, type ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video, { type OnBufferData, type OnVideoErrorData } from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { getNowPlaying, getUpcoming } from '../src/parsers/xmltv';
import { fetchIptvData } from '../src/services/iptv';
import { colors, fontSize, spacing, channelColor, serifFamily } from '../src/constants/theme';
import { STORAGE_KEYS } from '../src/constants/storage';
import { ChannelRow } from '../src/components/ChannelRow';
import { ProgrammeDetailModal } from '../src/components/ProgrammeDetailModal';
import { Apron } from '../src/components/ds6/Apron';
import { Home } from '../src/components/ds6/Home';
import { Board } from '../src/components/ds6/Board';
import { Platform } from 'react-native';
import type { Channel, Programme } from '../src/types';

/**
 * The TV.
 *
 * This is the whole app: it opens playing the last-watched channel,
 * full screen. Everything else is an overlay on the picture:
 *
 * - swipe up/down ... change channel (with a chunky identity flash)
 * - tap ............ lower-third HUD: what you're watching, progress
 * - swipe left ..... WHAT'S ON: every channel, one chunky row each
 * - long-press ..... programme notes (the library's essays)
 *
 * No home screen. No list-first funnel. Turn it on and it's on.
 */

const SWIPE_THRESHOLD = 70;
const HUD_HIDE_MS = 4000;
const FLASH_HIDE_MS = 2500;
const BUFFERING_OVERLAY_DELAY_MS = 800;
const BUFFER_STALL_WINDOW_MS = 1500;
const CLOCK_TICK_MS = 30000;

type PlayerEngine = 'vlc' | 'native';

const vlcModule = (() => {
  try {
    return require('react-native-vlc-media-player');
  } catch {
    return null;
  }
})();
const VLCPlayer = (vlcModule?.VLCPlayer ?? null) as ComponentType<any> | null;

// Web browsers need hls.js for HLS; loaded only on web so native bundles skip it.
const WebVideo = (() => {
  if (Platform.OS !== 'web') return null;
  try {
    return require('../src/components/WebVideo').WebVideo;
  } catch {
    return null;
  }
})() as ComponentType<any> | null;

const serif = Platform.select(serifFamily);
const grotesk = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });

/** Determine which engine should be tried first (native handles HLS + PiP). */
function resolvePrimaryEngine(vlcAvailable: boolean, streamUrl?: string): PlayerEngine {
  if (!vlcAvailable) return 'native';
  if (!streamUrl) return 'vlc';
  if (streamUrl.toLowerCase().includes('.m3u8')) return 'native';
  return 'vlc';
}

/** Normalize react-native-video errors into readable text. */
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

function formatTimeRemaining(stop: Date): string | null {
  const diffMs = stop.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
}

export default function WatchScreen() {
  const { activeConfig, loading: configLoading } = useServerConfig();
  const isExpoGo = Constants.appOwnership === 'expo';
  const hasVlc = VLCPlayer !== null;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [indexRestored, setIndexRestored] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [hudVisible, setHudVisible] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [homeVisible, setHomeVisible] = useState(false);
  const [dialIndex, setDialIndex] = useState(0);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardIndex, setBoardIndex] = useState(0);
  const [boardScroll, setBoardScroll] = useState(0);
  const [detailProgramme, setDetailProgramme] = useState<Programme | null>(null);

  const [playerEngine, setPlayerEngine] = useState<PlayerEngine>(resolvePrimaryEngine(hasVlc));
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());

  const isMountedRef = useRef(true);
  const hudOpacity = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriedForUrl = useRef<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastProgressAt = useRef<number>(0);

  // ── Setup gate ──
  useEffect(() => {
    if (!configLoading && !activeConfig) router.replace('/setup');
  }, [configLoading, activeConfig]);

  // ── Data ──
  const loadData = useCallback(async () => {
    if (!activeConfig) return;
    setDataLoading(true);
    if (isMountedRef.current) setDataError(null);
    try {
      const { channels: nextChannels, epg } = await fetchIptvData(activeConfig);
      if (!isMountedRef.current) return;
      setChannels(nextChannels);
      setProgrammes(epg.programmes);
    } catch (error) {
      if (isMountedRef.current) {
        setDataError(error instanceof Error ? error.message : 'Failed to load channel data');
      }
    } finally {
      if (isMountedRef.current) setDataLoading(false);
    }
  }, [activeConfig]);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadData]);

  // ── Remember the channel like a TV does ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_CHANNEL_INDEX);
        const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) setCurrentIndex(parsed);
      } finally {
        setIndexRestored(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!indexRestored) return;
    AsyncStorage.setItem(STORAGE_KEYS.LAST_CHANNEL_INDEX, String(currentIndex)).catch(() => {});
  }, [currentIndex, indexRestored]);

  const safeIndex = channels.length > 0 ? Math.min(currentIndex, channels.length - 1) : 0;
  const currentChannel = channels[safeIndex];
  const identity = currentChannel ? channelColor(currentChannel.number) : colors.accent;

  // ── Clock + EPG lookups ──
  useEffect(() => {
    const interval = setInterval(() => setClockNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const nowPlaying = useMemo(
    () => (currentChannel ? getNowPlaying(programmes, currentChannel.id, clockNow) : undefined),
    [currentChannel, programmes, clockNow],
  );

  const { nowPlayingMap, upNextMap } = useMemo(() => {
    const nowMap = new Map<string, Programme>();
    const nextMap = new Map<string, Programme>();
    for (const ch of channels) {
      const prog = getNowPlaying(programmes, ch.id, clockNow);
      if (prog) nowMap.set(ch.id, prog);
      const upcoming = getUpcoming(programmes, ch.id, 6, clockNow);
      // "Then comes" should name the next real programme, not the glue.
      const strictlyNext = upcoming.find(
        (p) => p.start.getTime() > clockNow.getTime() && !/interstitial/i.test(p.title),
      );
      if (strictlyNext) nextMap.set(ch.id, strictlyNext);
    }
    return { nowPlayingMap: nowMap, upNextMap: nextMap };
  }, [channels, programmes, clockNow]);

  const progress = useMemo(() => {
    if (!nowPlaying) return 0;
    const now = clockNow.getTime();
    const start = nowPlaying.start.getTime();
    const stop = nowPlaying.stop.getTime();
    if (stop <= start) return 0;
    return Math.min(1, Math.max(0, (now - start) / (stop - start)));
  }, [nowPlaying, clockNow]);

  // ── Overlay choreography ──
  const hideHud = useCallback(() => {
    Animated.timing(hudOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
      .start(() => setHudVisible(false));
  }, [hudOpacity]);

  const showHud = useCallback(() => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    setHudVisible(true);
    Animated.timing(hudOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    hudTimer.current = setTimeout(hideHud, HUD_HIDE_MS);
  }, [hudOpacity, hideHud]);

  const flashChannel = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashVisible(true);
    flashOpacity.setValue(1);
    flashTimer.current = setTimeout(() => {
      Animated.timing(flashOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setFlashVisible(false));
    }, FLASH_HIDE_MS);
  }, [flashOpacity]);

  // ── Tuning ──
  const tuneTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setHomeVisible(false);
    setBoardVisible(false);
    flashChannel();
  }, [flashChannel]);

  /** Open the receiver home with the dial resting on the given station. */
  const openHome = useCallback((atIndex: number) => {
    setDialIndex(atIndex);
    setBoardVisible(false);
    setHomeVisible(true);
  }, []);

  /** Open This Evening — the board — showing the given channel. */
  const openBoard = useCallback((atIndex: number) => {
    setBoardIndex(atIndex);
    setBoardScroll(0);
    setHomeVisible(false);
    setBoardVisible(true);
  }, []);

  // Reset playback state on channel change; flash the channel bug.
  useEffect(() => {
    if (!currentChannel) return;
    setPlayerEngine(resolvePrimaryEngine(hasVlc, currentChannel.streamUrl));
    setFallbackUsed(false);
    setPlayerError(null);
    setBuffering(true);
    setShowBufferingOverlay(false);
    setClockNow(new Date());
    lastProgressAt.current = 0;
    retriedForUrl.current = null;
    flashChannel();
  }, [currentChannel?.streamUrl, hasVlc]);

  useEffect(() => () => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // Show the spinner only when playback genuinely stalls.
  useEffect(() => {
    if (!buffering) {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
      bufferingTimer.current = null;
      setShowBufferingOverlay(false);
      return;
    }
    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    bufferingTimer.current = setTimeout(() => {
      if (Date.now() - lastProgressAt.current >= BUFFER_STALL_WINDOW_MS) {
        setShowBufferingOverlay(true);
      }
    }, BUFFERING_OVERLAY_DELAY_MS);
    return () => {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
      bufferingTimer.current = null;
    };
  }, [buffering]);

  // ── Gestures ──
  const onGestureEvent = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state !== State.END) return;
    const { translationX, translationY } = nativeEvent;

    if (Math.abs(translationX) > Math.abs(translationY)) {
      if (translationX < -SWIPE_THRESHOLD) openHome(safeIndex);
      return;
    }
    if (translationY < -SWIPE_THRESHOLD && safeIndex < channels.length - 1) {
      tuneTo(safeIndex + 1);
    } else if (translationY > SWIPE_THRESHOLD && safeIndex > 0) {
      tuneTo(safeIndex - 1);
    }
  }, [safeIndex, channels.length, tuneTo]);

  const handleTap = useCallback(() => {
    if (hudVisible) {
      if (hudTimer.current) clearTimeout(hudTimer.current);
      hideHud();
    } else {
      showHud();
    }
  }, [hudVisible, hideHud, showHud]);

  const openNotes = useCallback(() => {
    if (nowPlaying) setDetailProgramme(nowPlaying);
  }, [nowPlaying]);

  // ── Keyboard remote (web / desktop): a TV deserves a remote ──
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (boardVisible) {
        // At the board: left/right change the channel (the drums roll),
        // up/down page through the evening, Enter tunes, G returns.
        switch (e.key) {
          case 'ArrowRight':
            setBoardIndex((i) => (i + 1) % channels.length);
            setBoardScroll(0);
            break;
          case 'ArrowLeft':
            setBoardIndex((i) => (i - 1 + channels.length) % channels.length);
            setBoardScroll(0);
            break;
          case 'ArrowDown':
            setBoardScroll((s) => Math.min(s + 1, 30));
            break;
          case 'ArrowUp':
            setBoardScroll((s) => Math.max(s - 1, -8));
            break;
          case 'Enter':
            tuneTo(boardIndex);
            break;
          case 'g':
          case 'Escape':
            setBoardVisible(false);
            break;
          case 'h':
          case 'l':
            openHome(boardIndex);
            break;
        }
        return;
      }
      if (homeVisible) {
        // At the receiver: arrows wind the dial, Enter tunes, Escape returns.
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            setDialIndex((i) => (i + 1) % channels.length);
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            setDialIndex((i) => (i - 1 + channels.length) % channels.length);
            break;
          case 'Enter':
            tuneTo(dialIndex);
            break;
          case 'g':
            openBoard(dialIndex);
            break;
          case 'Escape':
            setHomeVisible(false);
            break;
        }
        return;
      }
      switch (e.key) {
        case 'ArrowUp':
          if (safeIndex < channels.length - 1) tuneTo(safeIndex + 1);
          break;
        case 'ArrowDown':
          if (safeIndex > 0) tuneTo(safeIndex - 1);
          break;
        case 'Enter':
        case 'i':
          showHud();
          break;
        case 'g':
          openBoard(safeIndex);
          break;
        case 'l':
        case 'h':
          openHome(safeIndex);
          break;
        case 'n':
          openNotes();
          break;
        case 'Escape':
          if (detailProgramme) setDetailProgramme(null);
          else openHome(safeIndex);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [safeIndex, channels.length, tuneTo, showHud, openNotes, homeVisible, dialIndex, openHome, detailProgramme, boardVisible, boardIndex, openBoard]);


  // ── Playback plumbing (engine failover) ──
  const handlePlaybackStarted = useCallback(() => {
    lastProgressAt.current = Date.now();
    setBuffering(false);
    setShowBufferingOverlay(false);
    setPlayerError(null);
  }, []);

  const handlePlaybackProgress = useCallback(() => {
    lastProgressAt.current = Date.now();
    setBuffering(false);
    setShowBufferingOverlay(false);
  }, []);

  const tryFallbackEngine = useCallback((reason: string) => {
    // A freshly tuned channel's server session may not be ready for a few
    // seconds (cold start serves an empty playlist -> demuxer parse errors).
    // Retry the same engine once after a short wait before anything drastic.
    if (retriedForUrl.current !== currentChannel?.streamUrl) {
      retriedForUrl.current = currentChannel?.streamUrl ?? null;
      setBuffering(true);
      console.warn('[Player retry after cold-start error]', reason);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        if (isMountedRef.current) setReloadNonce((n) => n + 1);
      }, 4000);
      return;
    }
    if (fallbackUsed || !hasVlc) {
      setPlayerError(reason);
      setBuffering(false);
      setShowBufferingOverlay(false);
      return;
    }
    const nextEngine: PlayerEngine = playerEngine === 'vlc' ? 'native' : 'vlc';
    setFallbackUsed(true);
    setPlayerEngine(nextEngine);
    setBuffering(true);
    console.warn('[Player failover]', reason);
  }, [fallbackUsed, hasVlc, playerEngine, currentChannel?.streamUrl]);

  const handleNativeBuffer = useCallback((event: OnBufferData) => {
    setBuffering(event.isBuffering);
  }, []);

  const handleNativeError = useCallback((event: OnVideoErrorData) => {
    tryFallbackEngine(`Native player error: ${formatVideoError(event)}`);
  }, [tryFallbackEngine]);

  const handleVlcError = useCallback(() => {
    tryFallbackEngine('VLC player error');
  }, [tryFallbackEngine]);

  // ── Render ──
  if (configLoading || dataLoading || !indexRestored) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (dataError || !currentChannel) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{dataError ?? 'No channels found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.secondaryAction}>Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const timeLeft = nowPlaying ? formatTimeRemaining(nowPlaying.stop) : null;

  return (
    <PanGestureHandler
      onHandlerStateChange={onGestureEvent}
      activeOffsetY={[-20, 20]}
      activeOffsetX={[-20, 20]}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={handleTap} onLongPress={openNotes}>
          <View style={styles.container}>
            {/* ── The picture (dark while the receiver is showing) ── */}
            {homeVisible ? null : WebVideo ? (
              <WebVideo
                key={`web:${reloadNonce}:${currentChannel.streamUrl}`}
                streamUrl={currentChannel.streamUrl}
                onStarted={handlePlaybackStarted}
                onProgress={handlePlaybackProgress}
                onError={tryFallbackEngine}
              />
            ) : isExpoGo ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>
                  Playback requires a development build (Expo Go lacks the native player).
                </Text>
              </View>
            ) : playerEngine === 'vlc' && VLCPlayer ? (
              <VLCPlayer
                key={`vlc:${reloadNonce}:${currentChannel.streamUrl}`}
                source={{
                  uri: currentChannel.streamUrl,
                  initType: 2,
                  initOptions: ['--network-caching=900', '--clock-jitter=0'],
                }}
                autoplay
                paused={false}
                playInBackground
                resizeMode="contain"
                style={styles.video}
                onPlaying={handlePlaybackStarted}
                onProgress={handlePlaybackProgress}
                onLoad={handlePlaybackStarted}
                onError={handleVlcError}
              />
            ) : (
              <Video
                key={`native:${reloadNonce}:${currentChannel.streamUrl}`}
                source={{
                  uri: currentChannel.streamUrl,
                  metadata: {
                    title: currentChannel.name,
                    subtitle: nowPlaying?.title,
                    description: nowPlaying?.description,
                  },
                }}
                style={styles.video}
                resizeMode="contain"
                paused={false}
                controls={false}
                ignoreSilentSwitch="ignore"
                automaticallyWaitsToMinimizeStalling={false}
                playInBackground
                playWhenInactive
                enterPictureInPictureOnLeave
                allowsExternalPlayback
                showNotificationControls
                onLoadStart={() => setBuffering(true)}
                onLoad={handlePlaybackStarted}
                onBuffer={handleNativeBuffer}
                onProgress={handlePlaybackProgress}
                onError={handleNativeError}
              />
            )}

            {showBufferingOverlay && (
              <View style={styles.bufferingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.text} />
              </View>
            )}

            {playerError && (
              <View style={styles.playerErrorPill} pointerEvents="none">
                <Text style={styles.playerErrorText}>{playerError}</Text>
              </View>
            )}

            {/* ── Channel flash: the chunky channel bug ── */}
            {flashVisible && (
              <Animated.View
                style={[styles.flash, { opacity: flashOpacity, borderLeftColor: identity }]}
                pointerEvents="none"
              >
                <Text style={[styles.flashNumber, { color: identity }]}>
                  {currentChannel.number}
                </Text>
                <View style={styles.flashText}>
                  <Text style={styles.flashName}>{currentChannel.name.toUpperCase()}</Text>
                  {nowPlaying && (
                    <Text style={styles.flashTitle} numberOfLines={1}>
                      {nowPlaying.title}
                    </Text>
                  )}
                </View>
              </Animated.View>
            )}

            {/* ── HUD: the resting apron — the walnut shelf under the picture ── */}
            {hudVisible && (
              <Animated.View style={[styles.hud, { opacity: hudOpacity }]}>
                <Apron channel={currentChannel} nowPlaying={nowPlaying} clockNow={clockNow} />
              </Animated.View>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* ── HOME: the receiver — dial, plates, service rail ── */}
        {homeVisible && (
          <Home
            channels={channels}
            selectedIndex={dialIndex}
            onSelect={setDialIndex}
            onTune={(i) => {
              tuneTo(i);
              setHomeVisible(false);
            }}
            nowPlayingMap={nowPlayingMap}
            upNextMap={upNextMap}
            clockNow={clockNow}
          />
        )}

        {/* ── THIS EVENING: the departure board — the picture's sound carries on beneath ── */}
        {boardVisible && (
          <Board
            channels={channels}
            boardIndex={boardIndex}
            onSelectChannel={(i) => {
              setBoardIndex(i);
              setBoardScroll(0);
            }}
            programmes={programmes}
            scroll={boardScroll}
            clockNow={clockNow}
          />
        )}

        <ProgrammeDetailModal
          programme={detailProgramme}
          visible={detailProgramme !== null}
          onClose={() => setDetailProgramme(null)}
        />
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  secondaryAction: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerErrorPill: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 110,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    padding: spacing.md,
  },
  playerErrorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },

  // ── Channel flash: Swiss — flat black, hard edges, huge numeral ──
  flash: {
    position: 'absolute',
    left: 0,
    top: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    borderLeftWidth: 6,
    paddingVertical: spacing.lg,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xxl,
    gap: spacing.xl,
    maxWidth: '85%',
  },
  flashNumber: {
    fontFamily: grotesk,
    fontSize: 72,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 74,
  },
  flashText: {
    flexShrink: 1,
  },
  flashName: {
    color: colors.text,
    fontFamily: grotesk,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 3,
  },
  flashTitle: {
    color: colors.textSecondary,
    fontFamily: grotesk,
    fontSize: fontSize.md,
    marginTop: 4,
  },

  // ── HUD ──
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  hudBand: {
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: 2,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
  },
  hudChannelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hudBadge: {
    minWidth: 36,
    height: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  hudBadgeText: {
    fontFamily: grotesk,
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  hudChannelName: {
    flex: 1,
    fontFamily: grotesk,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 3,
  },
  hudTimeLeft: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  hudTitle: {
    color: colors.text,
    fontFamily: grotesk,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginTop: spacing.md,
  },
  hudSubtitle: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  hudProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: spacing.lg,
  },
  hudProgressFill: {
    height: 3,
  },
  hudActions: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  hudAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hudActionText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // ── WHAT'S ON overlay ──
  whatsOn: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,9,0.96)',
  },
  whatsOnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.xl,
  },
  whatsOnTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: grotesk,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 4,
  },
  whatsOnList: {
    paddingBottom: 48,
  },
});
