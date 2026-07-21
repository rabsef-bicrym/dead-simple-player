import { useEffect, useState, useCallback, useRef, useMemo, type ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video, { type OnBufferData, type OnVideoErrorData } from 'react-native-video';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { getNowPlaying, getUpcoming } from '../src/parsers/xmltv';
import { fetchIptvData } from '../src/services/iptv';
import { STORAGE_KEYS } from '../src/constants/storage';
import { walnut, brass, amber, cream, fonts } from '../src/constants/ds6';
import { Apron } from '../src/components/ds6/Apron';
import { Home } from '../src/components/ds6/Home';
import { Board } from '../src/components/ds6/Board';
import { Flash } from '../src/components/ds6/Flash';
import { Notes } from '../src/components/ds6/Notes';
import { Platform } from 'react-native';
import type { Channel, Programme } from '../src/types';

/**
 * The TV — a DS-6 receiver in walnut and brass.
 *
 * This is the whole app: it opens playing the last-watched channel,
 * full screen. Everything else is DS-6 furniture over the picture:
 *
 * - swipe up/down ... change channel (the stamped plate flashes)
 * - tap / i ........ the resting apron: what's on, until when
 * - Esc / h ........ the receiver: the dial (kills the stream)
 * - g .............. This Evening: the split-flap board (sound carries on)
 * - n / long-press . programme notes, projected on the dimmed picture
 *
 * No home-screen funnel. Turn it on and it's on.
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
  const [boardCursor, setBoardCursor] = useState(2);
  const boardCursorProg = useRef<Programme | null>(null);
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

  // The service panel's TUNE-IN PLATE card: brief, or a full six seconds.
  const flashDwellMs = useRef(FLASH_HIDE_MS);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.FLASH_STYLE)
      .then((v) => { flashDwellMs.current = v === 'six' ? 6000 : FLASH_HIDE_MS; })
      .catch(() => {});
  }, []);

  const flashChannel = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashVisible(true);
    flashOpacity.setValue(1);
    flashTimer.current = setTimeout(() => {
      Animated.timing(flashOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setFlashVisible(false));
    }, flashDwellMs.current);
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
    setBoardCursor(2);
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
      // While the notes are projected, the arrows belong to them —
      // nothing should tune or wander beneath the reading.
      if (detailProgramme && e.key.startsWith('Arrow')) return;
      if (boardVisible) {
        // At the board: left/right change the channel (the drums roll),
        // up/down walk the cursor through the evening (paging at the
        // edges), N reads the cursor's notes, Enter tunes, G returns.
        switch (e.key) {
          case 'ArrowRight':
            setBoardIndex((i) => (i + 1) % channels.length);
            setBoardScroll(0);
            setBoardCursor(2);
            break;
          case 'ArrowLeft':
            setBoardIndex((i) => (i - 1 + channels.length) % channels.length);
            setBoardScroll(0);
            setBoardCursor(2);
            break;
          case 'ArrowDown':
            if (boardCursor < 7) setBoardCursor(boardCursor + 1);
            else setBoardScroll((s) => Math.min(s + 1, 30));
            break;
          case 'ArrowUp':
            if (boardCursor > 0) setBoardCursor(boardCursor - 1);
            else setBoardScroll((s) => Math.max(s - 1, -8));
            break;
          case 'n':
            if (detailProgramme) setDetailProgramme(null);
            else if (boardCursorProg.current) setDetailProgramme(boardCursorProg.current);
            break;
          case 'Enter':
            tuneTo(boardIndex);
            break;
          case 'g':
          case 'Escape':
            if (detailProgramme) setDetailProgramme(null);
            else setBoardVisible(false);
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
          // N returns to the picture, as the projection promises.
          if (detailProgramme) setDetailProgramme(null);
          else openNotes();
          break;
        case 'Escape':
          if (detailProgramme) setDetailProgramme(null);
          else openHome(safeIndex);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [safeIndex, channels.length, tuneTo, showHud, openNotes, homeVisible, dialIndex, openHome, detailProgramme, boardVisible, boardIndex, openBoard, boardCursor]);


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
        <View style={styles.momentJewel} />
        <Text style={styles.momentText}>WARMING UP</Text>
      </View>
    );
  }

  if (dataError || !currentChannel) {
    return (
      <View style={styles.center}>
        <Text style={styles.difficultyKicker}>THE RECEIVER CANNOT FIND ITS STATIONS</Text>
        <Text style={styles.difficultyDetail}>{dataError ?? 'No channels found'}</Text>
        <View style={styles.serviceRow}>
          <TouchableOpacity style={styles.servicePlate} onPress={loadData}>
            <Text style={styles.servicePlateText}>TRY AGAIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.servicePlate} onPress={() => router.push('/settings')}>
            <Text style={styles.servicePlateText}>SERVICE PANEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
                <Text style={styles.difficultyDetail}>
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
              <View style={styles.moment} pointerEvents="none">
                <View style={styles.momentJewel} />
                <Text style={styles.momentText}>A MOMENT, PLEASE</Text>
              </View>
            )}

            {playerError && (
              <View style={styles.difficulty} pointerEvents="none">
                <Text style={styles.difficultyKicker}>THE PICTURE IS HAVING DIFFICULTY</Text>
                <Text style={styles.difficultyDetail} numberOfLines={2}>{playerError}</Text>
              </View>
            )}

            {/* ── Tune-in: the stamped channel plate flashes, then fades ── */}
            {flashVisible && (
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: flashOpacity }]} pointerEvents="none">
                <Flash channel={currentChannel} nowPlaying={nowPlaying} />
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
              setBoardCursor(2);
            }}
            programmes={programmes}
            scroll={boardScroll}
            cursor={boardCursor}
            cursorProgRef={boardCursorProg}
            onNotes={setDetailProgramme}
            clockNow={clockNow}
          />
        )}

        {/* ── PROGRAMME NOTES: the NFO, projected on the dimmed picture ── */}
        {detailProgramme && (
          <Notes
            programme={detailProgramme}
            channel={channels.find((c) => c.id === detailProgramme.channelId)}
            clockNow={clockNow}
            onClose={() => setDetailProgramme(null)}
          />
        )}
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
    backgroundColor: walnut.deep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // ── A moment, please — the receiver gathering itself ──
  moment: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  momentJewel: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: amber.jewel,
    shadowColor: amber.glow,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  momentText: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 4,
    color: brass.mid,
  },

  // ── Difficulty — spoken plainly, in the house voice ──
  difficulty: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 60,
    alignItems: 'center',
    gap: 8,
  },
  difficultyKicker: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 3.2,
    color: brass.light,
    textAlign: 'center',
  },
  difficultyDetail: {
    fontFamily: fonts.speech,
    fontSize: 13,
    color: brass.muted,
    textAlign: 'center',
  },
  serviceRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  servicePlate: {
    backgroundColor: walnut.raised,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 22,
  },
  servicePlateText: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 2.6,
    color: cream,
  },

  // ── HUD anchor — the apron rides the bottom edge ──
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
