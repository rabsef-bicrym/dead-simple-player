import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  AppState,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { getNowPlaying, getUpcoming } from '../src/parsers/xmltv';
import { fetchIptvChannels, fetchIptvGuide, type GuideState } from '../src/services/iptv';
import { restoreLastChannelIndex } from '../src/services/channelStorage';
import { STORAGE_KEYS } from '../src/constants/storage';
import { walnut, brass, amber, cream, fonts } from '../src/constants/ds6';
import { Apron } from '../src/components/ds6/Apron';
import { Home } from '../src/components/ds6/Home';
import { Board } from '../src/components/ds6/Board';
import { Flash } from '../src/components/ds6/Flash';
import { Notes } from '../src/components/ds6/Notes';
import { MHomeLandscape, MHomePortrait } from '../src/components/ds8m/MHome';
import { MApron } from '../src/components/ds8m/MApron';
import { MReading } from '../src/components/ds8m/MReading';
import { MBoard } from '../src/components/ds8m/MBoard';
import { SignOff } from '../src/components/ds8m/SignOff';
import { TuningStatic } from '../src/components/ds8m/TuningStatic';
import { VideoHardwareControls } from '../src/components/ds8m/VideoHardwareControls';
import { useCabinet } from '../src/hooks/useCabinet';
import { PlayerSurface } from '../src/player/PlayerSurface';
import type { PlayerError, PlayerSurfaceHandle } from '../src/player/types';
import type { Channel, Programme } from '../src/types';
import {
  APRON_DROP_MS,
  APRON_LIFT_MS,
  COLLAPSE_COOL_MS,
  COLLAPSE_LINE_TO_DOT_MS,
  COLLAPSE_VERTICAL_MS,
  FLASH_COOL_MS,
  FLASH_DWELL_MS,
  FLASH_STAMP_MS,
  GEAR_COMMIT_MS,
  MECHANICAL_EASE_OUT,
  REGISTER_LINKAGE_MS,
  motionDuration,
  useReducedMotion,
} from '../src/ui/motion';

/**
 * The TV — a DS-6 receiver in walnut and brass.
 *
 * This is the whole app. The traveling set wakes quietly at its stick;
 * a deliberate station choice brings the tube and its sound to life.
 *
 * - swipe up/down ....... change channel (the stamped plate flashes)
 * - tap / i ............. the resting apron: what's on, until when
 * - Esc / h / swipe ◀ ... the receiver: the dial (kills the stream)
 * - g / swipe ▶ ......... This Evening: the board (sound carries on)
 * - n / long-press ...... programme notes, projected on the dimmed picture
 *
 * On glass (phone, tablet) each surface's printed key legend doubles as
 * its buttons: the ⏎ and G plates are tappable, the dial dots tune, the
 * board's arrows roll the drums.
 *
 * No home-screen funnel. Turn it on and it's on.
 */

const SWIPE_THRESHOLD = 70;
const HUD_HIDE_MS = 4000;
const BUFFERING_OVERLAY_DELAY_MS = 800;
const BUFFER_STALL_WINDOW_MS = 1500;
const CLOCK_TICK_MS = 30000;
const GUIDE_REFRESH_MS = 30 * 60 * 1000;
type TuneOrigin = 'register' | 'swipe' | 'board' | 'remote' | 'gate';

export default function WatchScreen() {
  const { activeConfig, loading: configLoading, reload: reloadServerConfig } = useServerConfig();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const isExpoGo = Constants.appOwnership === 'expo';
  // DS-8 console, or the DS-8/M traveling set? Nothing shrinks;
  // everything re-cabinets.
  const { isPhone, landscape: isLandscape, width: winW, height: winH } = useCabinet();
  const safeAreaInsets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [indexRestored, setIndexRestored] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [guideState, setGuideState] = useState<GuideState | 'loading'>('loading');
  const [guideError, setGuideError] = useState<string | null>(null);

  const [hudVisible, setHudVisible] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const [homeVisible, setHomeVisible] = useState(false);
  const [homeEntrance, setHomeEntrance] = useState<'none' | 'stamp' | 'expand'>('stamp');
  const [dialIndex, setDialIndex] = useState(0);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardClosing, setBoardClosing] = useState(false);
  const [registerTuneRequest, setRegisterTuneRequest] = useState<{ index: number; token: number } | null>(null);
  const [boardIndex, setBoardIndex] = useState(0);
  const [boardScroll, setBoardScroll] = useState(0);
  const [boardCursor, setBoardCursor] = useState(2);
  const boardCursorProg = useRef<Programme | null>(null);
  const [detailProgramme, setDetailProgramme] = useState<Programme | null>(null);

  // The traveling set's night: POWER concludes the broadcast day.
  const [signOff, setSignOff] = useState(false);
  useFocusEffect(
    useCallback(() => {
      // Settings owns a separate hook instance, so re-read its active aerial
      // before resuming this screen. A changed host/port then reloads data and
      // gives every channel a stream URL from the newly selected server.
      reloadServerConfig().catch(() => {});
    }, [reloadServerConfig]),
  );

  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [sourceReady, setSourceReady] = useState(false);
  const [watchRevealDone, setWatchRevealDone] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const [pictureOutAvailable, setPictureOutAvailable] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [housekeepingForeground, setHousekeepingForeground] = useState(() => (
    Platform.OS === 'web'
      ? typeof document === 'undefined' || document.visibilityState === 'visible'
      : AppState.currentState === 'active'
  ));
  const isMountedRef = useRef(true);
  const hudTravel = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const flashScale = useRef(new Animated.Value(1)).current;
  const watchReveal = useRef(new Animated.Value(1)).current;
  const pictureScaleX = useRef(new Animated.Value(1)).current;
  const pictureScaleY = useRef(new Animated.Value(1)).current;
  const pictureOpacity = useRef(new Animated.Value(1)).current;
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressAt = useRef<number>(0);
  const playerRef = useRef<PlayerSurfaceHandle | null>(null);
  const playbackActiveRef = useRef(false);
  const registerTuneSequence = useRef(0);
  const registerTuneOrigin = useRef<TuneOrigin>('swipe');
  const channelRestoreStarted = useRef(false);
  const dataGeneration = useRef(0);
  const guideRefreshInFlight = useRef<string | null>(null);
  const activeConfigKey = activeConfig ? `${activeConfig.host}:${activeConfig.port}` : '';
  const activeConfigKeyRef = useRef(activeConfigKey);
  const housekeepingForegroundRef = useRef(housekeepingForeground);
  activeConfigKeyRef.current = activeConfigKey;

  // ── Setup gate ──
  useEffect(() => {
    if (!configLoading && !activeConfig) router.replace('/setup');
  }, [configLoading, activeConfig]);

  // ── Data ──
  const loadData = useCallback(async () => {
    if (!activeConfig) return;
    const generation = ++dataGeneration.current;
    const requestConfigKey = `${activeConfig.host}:${activeConfig.port}`;
    setDataLoading(true);
    if (isMountedRef.current) setDataError(null);
    setGuideState('loading');
    setGuideError(null);
    setProgrammes([]);

    // The guide is deliberately not awaited here: a slow or absent XMLTV
    // endpoint must not hold the tuner behind it.
    fetchIptvGuide(activeConfig)
      .then((guide) => {
        if (
          isMountedRef.current
          && dataGeneration.current === generation
          && activeConfigKeyRef.current === requestConfigKey
        ) {
          setProgrammes(guide.epg.programmes);
          setGuideState(guide.state);
          setGuideError(guide.error ?? null);
        }
      })
      .catch(() => {});

    try {
      const nextChannels = await fetchIptvChannels(activeConfig);
      if (
        !isMountedRef.current
        || dataGeneration.current !== generation
        || activeConfigKeyRef.current !== requestConfigKey
      ) return;
      setChannels(nextChannels);
    } catch (error) {
      if (isMountedRef.current && dataGeneration.current === generation) {
        setDataError(error instanceof Error ? error.message : 'Failed to load channel data');
      }
    } finally {
      if (isMountedRef.current && dataGeneration.current === generation) setDataLoading(false);
    }
  }, [activeConfig]);

  const refreshGuide = useCallback(async () => {
    if (!activeConfig) return;
    const requestConfigKey = `${activeConfig.host}:${activeConfig.port}`;
    if (guideRefreshInFlight.current === requestConfigKey) return;
    guideRefreshInFlight.current = requestConfigKey;
    try {
      const guide = await fetchIptvGuide(activeConfig);
      if (isMountedRef.current && activeConfigKeyRef.current === requestConfigKey) {
        if (guide.state !== 'unavailable') setProgrammes(guide.epg.programmes);
        setGuideState(guide.state);
        setGuideError(guide.error ?? null);
      }
    } finally {
      if (guideRefreshInFlight.current === requestConfigKey) {
        guideRefreshInFlight.current = null;
      }
    }
  }, [activeConfig]);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadData]);

  useEffect(() => {
    const updateForeground = (foreground: boolean) => {
      const becameActive = foreground && !housekeepingForegroundRef.current;
      housekeepingForegroundRef.current = foreground;
      setHousekeepingForeground(foreground);
      if (becameActive) {
        setClockNow(new Date());
        refreshGuide().catch(() => {});
      }
    };

    if (Platform.OS === 'web') {
      const onVisibilityChange = () => updateForeground(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      updateForeground(state === 'active');
    });
    return () => subscription.remove();
  }, [refreshGuide]);

  useEffect(() => {
    if (!activeConfig || !housekeepingForeground) return;
    const interval = setInterval(() => { refreshGuide().catch(() => {}); }, GUIDE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeConfig, housekeepingForeground, refreshGuide]);

  // ── Remember the channel like a TV does ──
  useEffect(() => {
    if (dataLoading || channels.length === 0 || channelRestoreStarted.current) return;
    channelRestoreStarted.current = true;
    restoreLastChannelIndex(channels)
      .then((index) => {
        if (isMountedRef.current) setCurrentIndex(index);
      })
      .catch(() => {})
      .finally(() => {
        if (isMountedRef.current) setIndexRestored(true);
      });
  }, [channels, dataLoading]);

  useEffect(() => {
    if (!indexRestored || channels.length === 0) return;
    const channel = channels[Math.min(currentIndex, channels.length - 1)];
    AsyncStorage.setItem(STORAGE_KEYS.LAST_CHANNEL_ID, channel.id).catch(() => {});
  }, [channels, currentIndex, indexRestored]);

  const safeIndex = channels.length > 0 ? Math.min(currentIndex, channels.length - 1) : 0;
  const currentChannel = channels[safeIndex];
  // ── Clock + EPG lookups ──
  useEffect(() => {
    if (!housekeepingForeground) return;
    const interval = setInterval(() => setClockNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, [housekeepingForeground]);

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
    hudTravel.stopAnimation();
    Animated.timing(hudTravel, {
      toValue: 1,
      duration: motionDuration(APRON_DROP_MS, reducedMotion),
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    })
      .start(() => setHudVisible(false));
  }, [hudTravel, reducedMotion]);

  const showHud = useCallback(() => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    setHudVisible(true);
    hudTravel.stopAnimation();
    hudTravel.setValue(1);
    Animated.timing(hudTravel, {
      toValue: 0,
      duration: motionDuration(APRON_LIFT_MS, reducedMotion),
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    }).start();
    hudTimer.current = setTimeout(hideHud, HUD_HIDE_MS);
  }, [hudTravel, hideHud, reducedMotion]);

  // The service panel's TUNE-IN PLATE card: brief, or a full six seconds.
  const flashDwellMs = useRef(FLASH_DWELL_MS);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.FLASH_STYLE)
      .then((v) => { flashDwellMs.current = v === 'six' ? 6000 : FLASH_DWELL_MS; })
      .catch(() => {});
  }, []);

  const flashChannel = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashOpacity.stopAnimation();
    flashScale.stopAnimation();
    setFlashVisible(true);
    flashOpacity.setValue(1);
    flashScale.setValue(reducedMotion ? 1 : 1.03);
    Animated.timing(flashScale, {
      toValue: 1,
      duration: motionDuration(FLASH_STAMP_MS, reducedMotion),
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    }).start();
    flashTimer.current = setTimeout(() => {
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: motionDuration(FLASH_COOL_MS, reducedMotion),
        useNativeDriver: true,
      })
        .start(() => setFlashVisible(false));
    }, flashDwellMs.current);
  }, [flashOpacity, flashScale, reducedMotion]);

  // ── Tuning ──
  // Changing surface always dismisses the notes projection — otherwise
  // it lingers over the new surface and every key looks dead beneath it.
  const tuneTo = useCallback((index: number, origin: TuneOrigin = 'remote') => {
    setRegisterTuneRequest(null);
    if (playbackActiveRef.current && index === safeIndex) {
      setHomeVisible(false);
      setBoardVisible(false);
      setBoardClosing(false);
      setDetailProgramme(null);
      if (origin !== 'register' && !tuning) flashChannel();
      return;
    }
    const openingPicture = !playbackActiveRef.current;
    playbackActiveRef.current = true;
    setPlaybackActive(true);
    setTuning(true);
    setSourceReady(false);
    setStopping(false);
    setPlayerError(null);
    pictureScaleX.setValue(1);
    pictureScaleY.setValue(1);
    pictureOpacity.setValue(1);
    setCurrentIndex(index);
    setHomeVisible(false);
    setBoardVisible(false);
    setBoardClosing(false);
    setRegisterTuneRequest(null);
    setDetailProgramme(null);
    if (origin !== 'register') {
      flashChannel();
    } else {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashOpacity.stopAnimation();
      setFlashVisible(false);
    }

    if (openingPicture && isPhone && !isLandscape) {
      setWatchRevealDone(reducedMotion);
      watchReveal.setValue(reducedMotion ? 1 : 0);
      Animated.timing(watchReveal, {
        toValue: 1,
        duration: motionDuration(REGISTER_LINKAGE_MS, reducedMotion),
        easing: MECHANICAL_EASE_OUT,
        useNativeDriver: true,
      }).start();
      // Timers decide; animations decorate. New-arch native completion
      // callbacks can report unfinished — the static's clearance, and every
      // other state transition, must never hang on them.
      setTimeout(() => setWatchRevealDone(true), motionDuration(REGISTER_LINKAGE_MS, reducedMotion) + 30);
    } else {
      watchReveal.setValue(1);
      setWatchRevealDone(true);
    }
  }, [flashChannel, flashOpacity, isLandscape, isPhone, pictureOpacity, pictureScaleX, pictureScaleY, reducedMotion, safeIndex, tuning, watchReveal]);

  const requestTune = useCallback((index: number, origin: TuneOrigin) => {
    if (isPhone && !isLandscape) {
      registerTuneOrigin.current = origin;
      registerTuneSequence.current += 1;
      setRegisterTuneRequest({ index, token: registerTuneSequence.current });
      return;
    }
    tuneTo(index, origin);
  }, [isLandscape, isPhone, tuneTo]);

  /** Open the receiver home with the dial resting on the given station. */
  const openHome = useCallback((atIndex: number, entrance: 'none' | 'stamp' | 'expand' = 'none') => {
    playbackActiveRef.current = false;
    setPlaybackActive(false);
    setTuning(false);
    setSourceReady(false);
    setRegisterTuneRequest(null);
    setDialIndex(atIndex);
    setBoardVisible(false);
    setBoardClosing(false);
    setDetailProgramme(null);
    setHomeEntrance(entrance);
    setHomeVisible(true);
  }, []);

  /** Open This Evening — the board — showing the given channel. */
  const openBoard = useCallback((atIndex: number) => {
    setBoardIndex(atIndex);
    setBoardScroll(0);
    setBoardCursor(2);
    if (playbackActiveRef.current) setHomeVisible(false);
    setDetailProgramme(null);
    setBoardClosing(false);
    setBoardVisible(true);
  }, []);

  // The gated shifter engages a speed: the lever throws first (the
  // gate lights, the knob runs through neutral), then the set tunes.
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onGate = useCallback((index: number) => {
    setDialIndex(index);
    if (gateTimer.current) clearTimeout(gateTimer.current);
    gateTimer.current = setTimeout(() => tuneTo(index, 'gate'), GEAR_COMMIT_MS);
  }, [tuneTo]);
  useEffect(() => () => {
    if (gateTimer.current) clearTimeout(gateTimer.current);
  }, []);

  // Arriving from the antenna terminals, the set presents its stations —
  // the receiver, dial resting on the remembered channel — rather than
  // blasting straight into a picture nobody chose. On the web the set
  // always wakes this way: browsers refuse un-asked-for sound, and the
  // first tap of the dial is exactly the asking.
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current || !indexRestored || channels.length === 0) return;
    welcomed.current = true;
    if (isPhone || welcome === '1' || Platform.OS === 'web') {
      openHome(safeIndex, isPhone && !isLandscape ? 'stamp' : 'none');
    } else {
      // Console DS-6 keeps its established turn-it-on-and-it-is-on behavior.
      playbackActiveRef.current = true;
      setPlaybackActive(true);
      setBuffering(true);
    }
  }, [welcome, indexRestored, channels.length, safeIndex, openHome, isPhone, isLandscape]);

  // Reset playback state for the pending source. The static interstitial owns
  // the wait; the flash is an input acknowledgment and is triggered by origin.
  useEffect(() => {
    if (!currentChannel || !playbackActiveRef.current) return;
    setPlayerError(null);
    setBuffering(true);
    setShowBufferingOverlay(false);
    setClockNow(new Date());
    lastProgressAt.current = 0;
  }, [currentChannel?.streamUrl]);

  useEffect(() => {
    if (tuning && sourceReady && watchRevealDone) setTuning(false);
  }, [sourceReady, tuning, watchRevealDone]);

  useEffect(() => () => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    hudTravel.stopAnimation();
    flashOpacity.stopAnimation();
    flashScale.stopAnimation();
    watchReveal.stopAnimation();
    pictureScaleX.stopAnimation();
    pictureScaleY.stopAnimation();
    pictureOpacity.stopAnimation();
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
  // Each surface owns the fingers on it — a swipe over the board must
  // never tune the picture hiding underneath.
  const onGestureEvent = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state !== State.END) return;
    const { translationX, translationY } = nativeEvent;
    const horizontal = Math.abs(translationX) > Math.abs(translationY);

    // While the notes are projected, fingers belong to the reading.
    if (detailProgramme) return;

    // ── The traveling set's vocabulary ──
    if (isPhone) {
      if (signOff) return;
      if (boardVisible) {
        if (horizontal) {
          if (Math.abs(translationX) < SWIPE_THRESHOLD) return;
          const dir = translationX < 0 ? 1 : -1;
          setBoardIndex((i) => (i + dir + channels.length) % channels.length);
          setBoardScroll(0);
        } else if (translationY < -SWIPE_THRESHOLD) {
          // Upright: the shade rolls home. On its side: page onward.
          if (!isLandscape) setBoardClosing(true);
          else setBoardScroll((s) => Math.min(s + 1, 30));
        } else if (translationY > SWIPE_THRESHOLD) {
          setBoardScroll((s) => (isLandscape ? Math.max(s - 1, -8) : Math.min(s + 1, 30)));
        }
        return;
      }
      if (homeVisible) {
        if (isLandscape) {
          // A swipe runs the gate and tunes; no priming tap is required.
          if (horizontal && Math.abs(translationX) > SWIPE_THRESHOLD) {
            const dir = translationX < 0 ? 1 : -1;
            const next = (dialIndex + dir + channels.length) % channels.length;
            onGate(next);
          }
        }
        return;
      }
      // Watching: swipe across to tune. iOS owns drag-from-top; the shade
      // opens only from its THIS EVENING plate.
      if (horizontal && Math.abs(translationX) > SWIPE_THRESHOLD) {
        const dir = translationX < 0 ? 1 : -1;
        requestTune((safeIndex + dir + channels.length) % channels.length, 'swipe');
      }
      return;
    }

    if (boardVisible) {
      // Sideways rolls the channel drums; vertical walks the cursor
      // through the evening, paging at the edges — same as the arrows.
      if (horizontal) {
        if (Math.abs(translationX) < SWIPE_THRESHOLD) return;
        const dir = translationX < 0 ? 1 : -1;
        setBoardIndex((i) => (i + dir + channels.length) % channels.length);
        setBoardScroll(0);
        setBoardCursor(2);
      } else if (translationY < -SWIPE_THRESHOLD) {
        if (boardCursor < 7) setBoardCursor(boardCursor + 1);
        else setBoardScroll((s) => Math.min(s + 1, 30));
      } else if (translationY > SWIPE_THRESHOLD) {
        if (boardCursor > 0) setBoardCursor(boardCursor - 1);
        else setBoardScroll((s) => Math.max(s - 1, -8));
      }
      return;
    }

    if (homeVisible) {
      // At the receiver: sideways winds the dial.
      if (horizontal && Math.abs(translationX) > SWIPE_THRESHOLD) {
        const dir = translationX < 0 ? 1 : -1;
        setDialIndex((i) => (i + dir + channels.length) % channels.length);
      }
      return;
    }

    if (horizontal) {
      if (translationX < -SWIPE_THRESHOLD) openHome(safeIndex);
      else if (translationX > SWIPE_THRESHOLD) openBoard(safeIndex);
      return;
    }
    if (translationY < -SWIPE_THRESHOLD && safeIndex < channels.length - 1) {
      tuneTo(safeIndex + 1, 'swipe');
    } else if (translationY > SWIPE_THRESHOLD && safeIndex > 0) {
      tuneTo(safeIndex - 1, 'swipe');
    }
  }, [safeIndex, channels.length, tuneTo, requestTune, detailProgramme, boardVisible, boardCursor, homeVisible, openHome, openBoard, isPhone, isLandscape, signOff, dialIndex, onGate]);

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

  const requestPictureOut = useCallback(() => {
    // This remains a direct, synchronous call from the key/plate gesture.
    playerRef.current?.requestPictureInPicture();
  }, []);

  const stopPlayback = useCallback(() => {
    if (!playbackActiveRef.current || stopping) return;
    setStopping(true);
    setHudVisible(false);
    setBoardVisible(false);
    setBoardClosing(false);
    setRegisterTuneRequest(null);
    setDetailProgramme(null);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashVisible(false);
    pictureScaleX.stopAnimation();
    pictureScaleY.stopAnimation();
    pictureOpacity.stopAnimation();

    const cutSignal = () => {
      playbackActiveRef.current = false;
      setPlaybackActive(false);
      setTuning(false);
      setSourceReady(false);
    };
    const showExpandedRegister = () => {
      setDialIndex(safeIndex);
      setHomeEntrance('expand');
      setHomeVisible(true);
      setStopping(false);
    };

    if (reducedMotion) {
      pictureScaleY.setValue(0.012);
      pictureScaleX.setValue(0.018);
      pictureOpacity.setValue(0);
      cutSignal();
      showExpandedRegister();
      return;
    }

    // Timers decide; animations decorate. Completion callbacks are unreliable
    // on the native new architecture, and a stuck `stopping` parks the CRT
    // charge line over the picture forever.
    Animated.timing(pictureScaleY, {
      toValue: 0.012,
      duration: COLLAPSE_VERTICAL_MS,
      easing: MECHANICAL_EASE_OUT,
      useNativeDriver: true,
    }).start();
    setTimeout(() => {
      // The audio and current item end exactly when the picture reaches a line.
      cutSignal();
      Animated.sequence([
        Animated.timing(pictureScaleX, {
          toValue: 0.018,
          duration: COLLAPSE_LINE_TO_DOT_MS,
          easing: MECHANICAL_EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(pictureOpacity, {
          toValue: 0,
          duration: COLLAPSE_COOL_MS,
          useNativeDriver: true,
        }),
      ]).start();
    }, COLLAPSE_VERTICAL_MS);
    setTimeout(showExpandedRegister, COLLAPSE_VERTICAL_MS + COLLAPSE_LINE_TO_DOT_MS + COLLAPSE_COOL_MS + 30);
  }, [pictureOpacity, pictureScaleX, pictureScaleY, reducedMotion, safeIndex, stopping]);

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
            tuneTo(boardIndex, 'board');
            break;
          case 'g':
          case 'Escape':
            if (detailProgramme) setDetailProgramme(null);
            else if (isPhone && !isLandscape) setBoardClosing(true);
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
            requestTune(dialIndex, 'remote');
            break;
          case 'g':
            openBoard(dialIndex);
            break;
          case 's':
            router.push('/settings');
            break;
          case 'Escape':
            break;
        }
        return;
      }
      switch (e.key) {
        case 'ArrowUp':
          if (safeIndex < channels.length - 1) requestTune(safeIndex + 1, 'remote');
          break;
        case 'ArrowDown':
          if (safeIndex > 0) requestTune(safeIndex - 1, 'remote');
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
          stopPlayback();
          break;
        case 'n':
          // N returns to the picture, as the projection promises.
          if (detailProgramme) setDetailProgramme(null);
          else openNotes();
          break;
        case 'p':
        case 'P':
          if (pictureOutAvailable) requestPictureOut();
          break;
        case 'Escape':
          if (detailProgramme) setDetailProgramme(null);
          else stopPlayback();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [safeIndex, channels.length, tuneTo, requestTune, showHud, openNotes, homeVisible, dialIndex, openHome, detailProgramme, boardVisible, boardIndex, openBoard, boardCursor, pictureOutAvailable, requestPictureOut, stopPlayback, isPhone, isLandscape]);


  // ── Playback plumbing ──
  const handlePlaybackStarted = useCallback(() => {
    lastProgressAt.current = Date.now();
    setSourceReady(true);
    setBuffering(false);
    setShowBufferingOverlay(false);
    setPlayerError(null);
  }, []);

  const handlePlayerBuffering = useCallback((isBuffering: boolean) => {
    if (!isBuffering) lastProgressAt.current = Date.now();
    setBuffering(isBuffering);
    if (!isBuffering) setShowBufferingOverlay(false);
  }, []);

  const handlePlayerError = useCallback((error: PlayerError) => {
    setPlayerError(error.message);
    setBuffering(false);
    setShowBufferingOverlay(false);
  }, []);

  const mediaSessionControls = useMemo(() => ({
    onPreviousTrack: () => {
      if (safeIndex > 0) requestTune(safeIndex - 1, 'remote');
    },
    onNextTrack: () => {
      if (safeIndex < channels.length - 1) requestTune(safeIndex + 1, 'remote');
    },
  }), [channels.length, requestTune, safeIndex]);

  // ── Render ──
  if (configLoading || dataLoading || (!indexRestored && channels.length > 0)) {
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

  const watching = playbackActive && !homeVisible && !signOff;
  const portraitWatching = isPhone && !isLandscape && watching;
  const portraitPictureFrame = {
    left: 0,
    top: safeAreaInsets.top,
    width: winW,
    height: (winW * 9) / 16,
  };
  const signalSeatStyle = watching
    ? portraitWatching
      ? [
        styles.signalSeat,
        portraitPictureFrame,
      ]
      : styles.signalSeatFull
    : styles.hiddenVideo;

  // This owner never changes across cabinet surfaces or channel changes. Stop
  // and sign-off clear its source; tuning serially replaces it in place.
  const signalEl = (
    <Animated.View
      pointerEvents="none"
      style={[
        signalSeatStyle,
        {
          transform: [{ scaleX: pictureScaleX }, { scaleY: pictureScaleY }],
          opacity: pictureOpacity,
        },
      ]}
    >
      {Platform.OS !== 'web' && isExpoGo ? (
        playbackActive && (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={styles.difficultyDetail}>
              Playback requires a development build (Expo Go lacks the native player).
            </Text>
          </View>
        )
      ) : (
        <PlayerSurface
          ref={playerRef}
          sourceUrl={playbackActive ? currentChannel.streamUrl : null}
          playing={playbackActive}
          muted={tuning || !playbackActive}
          style={StyleSheet.absoluteFill}
          viewport="contain"
          viewAttached
          metadata={playbackActive ? {
            channelName: currentChannel.name,
            programmeTitle: nowPlayingMap.get(currentChannel.id)?.title,
            description: nowPlayingMap.get(currentChannel.id)?.description,
            artworkUrl: currentChannel.logo,
          } : undefined}
          mediaSessionControls={mediaSessionControls}
          onReady={handlePlaybackStarted}
          onBuffering={handlePlayerBuffering}
          onError={handlePlayerError}
          onPictureInPictureAvailabilityChange={setPictureOutAvailable}
        />
      )}

      {tuning && playbackActive && <TuningStatic error={playerError} />}

      {!tuning && showBufferingOverlay && (
        <View style={styles.moment}>
          <View style={styles.momentJewel} />
          <Text style={styles.momentText}>A MOMENT, PLEASE</Text>
        </View>
      )}

      {!tuning && playerError && (
        <View style={styles.portraitDifficulty}>
          <Text style={styles.difficultyKicker}>THE PICTURE IS HAVING DIFFICULTY</Text>
          <Text style={styles.difficultyDetail} numberOfLines={2}>{playerError}</Text>
        </View>
      )}

      {flashVisible && playbackActive && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: flashOpacity, transform: [{ scale: flashScale }] },
          ]}
        >
          <Flash channel={currentChannel} nowPlaying={nowPlaying} compact={isPhone} />
        </Animated.View>
      )}

      {stopping && <Animated.View style={[styles.crtCharge, { opacity: pictureOpacity, transform: [{ scaleX: pictureScaleX }] }]} />}
    </Animated.View>
  );

  return (
    <PanGestureHandler
      onHandlerStateChange={onGestureEvent}
      activeOffsetY={[-20, 20]}
      activeOffsetX={[-20, 20]}
    >
      <View style={styles.container}>
        <View
          style={styles.readingLayer}
          pointerEvents={portraitWatching && !boardVisible && !stopping ? 'auto' : 'none'}
        >
          {portraitWatching && (
            <MReading
              channels={channels}
              tunedIndex={safeIndex}
              onTune={(index, origin) => tuneTo(
                index,
                origin === 'external' ? registerTuneOrigin.current : 'register',
              )}
              nowPlayingMap={nowPlayingMap}
              upNextMap={upNextMap}
              clockNow={clockNow}
              width={winW}
              onNotes={openNotes}
              onBoard={() => openBoard(safeIndex)}
              revealProgress={watchReveal}
              selectionRequest={registerTuneRequest}
            />
          )}
        </View>

        {signalEl}

        <TouchableWithoutFeedback onPress={handleTap} onLongPress={openNotes}>
          <View
            style={styles.pictureTapLayer}
            pointerEvents={watching && !portraitWatching && !boardVisible && !stopping ? 'auto' : 'none'}
          />
        </TouchableWithoutFeedback>

        {hudVisible && watching && !portraitWatching && !boardVisible && (
          <Animated.View
            style={[
              styles.hud,
              {
                transform: [
                  { translateY: hudTravel.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
                  { scaleY: hudTravel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) },
                ],
              },
            ]}
          >
            {isPhone ? (
              <MApron
                channel={currentChannel}
                nowPlaying={nowPlaying}
                clockNow={clockNow}
                onNotes={openNotes}
                onBoard={() => openBoard(safeIndex)}
                onHome={stopPlayback}
                onPictureOut={pictureOutAvailable ? requestPictureOut : undefined}
              />
            ) : (
              <Apron
                channel={currentChannel}
                nowPlaying={nowPlaying}
                clockNow={clockNow}
                onPictureOut={pictureOutAvailable ? requestPictureOut : undefined}
              />
            )}
          </Animated.View>
        )}

        {watching && !boardVisible && !stopping && (
          <View style={signalSeatStyle} pointerEvents="box-none">
            <VideoHardwareControls onStop={stopPlayback} />
          </View>
        )}

        {/* ── HOME on the traveling set ── */}
        {isPhone && homeVisible && !signOff && (
          isLandscape ? (
            <MHomeLandscape
              channels={channels}
              selectedIndex={dialIndex}
              onGate={onGate}
              onBoard={() => openBoard(dialIndex)}
              onPower={() => {
                playbackActiveRef.current = false;
                setPlaybackActive(false);
                setTuning(false);
                setHomeVisible(false);
                setSignOff(true);
              }}
              onService={() => router.push('/settings')}
              onNotes={setDetailProgramme}
              nowPlayingMap={nowPlayingMap}
              upNextMap={upNextMap}
              clockNow={clockNow}
              height={winH}
            />
          ) : (
            <MHomePortrait
              channels={channels}
              tunedIndex={dialIndex}
              onTune={(index, origin) => tuneTo(
                index,
                origin === 'external' ? registerTuneOrigin.current : 'register',
              )}
              nowPlayingMap={nowPlayingMap}
              upNextMap={upNextMap}
              clockNow={clockNow}
              onBoard={() => openBoard(dialIndex)}
              entrance={homeEntrance}
              expandFrom={(winW * 9) / 16}
              selectionRequest={registerTuneRequest}
            />
          )
        )}

        {/* ── THIS EVENING on the traveling set — board, or shade ── */}
        {isPhone && boardVisible && !signOff && (
          <MBoard
            channels={channels}
            boardIndex={boardIndex}
            onSelectChannel={(i) => {
              setBoardIndex(i);
              setBoardScroll(0);
            }}
            programmes={programmes}
            scroll={boardScroll}
            landscape={isLandscape}
            onTune={() => tuneTo(boardIndex, 'board')}
            onClose={() => {
              setBoardVisible(false);
              setBoardClosing(false);
            }}
            onNotes={setDetailProgramme}
            clockNow={clockNow}
            height={Math.round(winH * 0.75)}
            top={isLandscape ? 0 : safeAreaInsets.top}
            closing={boardClosing}
          />
        )}

        {/* ── SIGN-OFF: the broadcast day concludes ── */}
        {isPhone && signOff && (
          <SignOff
            channel={currentChannel}
            next={upNextMap.get(currentChannel.id)}
            onWake={() => {
              setSignOff(false);
              openHome(safeIndex, 'stamp');
            }}
          />
        )}

        {/* ── HOME: the receiver — dial, plates, service rail ── */}
        {!isPhone && homeVisible && (
          <Home
            channels={channels}
            selectedIndex={dialIndex}
            tunedIndex={safeIndex}
            onSelect={setDialIndex}
            onTune={(i) => {
              tuneTo(i, 'remote');
              setHomeVisible(false);
            }}
            onBoard={() => openBoard(dialIndex)}
            onPower={() => {
              setHomeVisible(false);
              if (typeof window !== 'undefined') {
                (window as typeof window & { dspShell?: { powerOff(): void } }).dspShell?.powerOff();
              }
            }}
            onService={() => router.push('/settings')}
            onNotes={setDetailProgramme}
            nowPlayingMap={nowPlayingMap}
            upNextMap={upNextMap}
            clockNow={clockNow}
          />
        )}

        {/* ── THIS EVENING: the departure board — the picture's sound carries on beneath ── */}
        {!isPhone && boardVisible && (
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
            onTune={() => tuneTo(boardIndex, 'board')}
            onClose={() => setBoardVisible(false)}
            clockNow={clockNow}
          />
        )}

        {/* The tuner keeps playing when the separate programme guide is late. */}
        {guideState !== 'fresh'
          && !signOff
          && (homeVisible || boardVisible || portraitWatching)
          && (
            <View style={styles.guideStatus} pointerEvents="none">
              <View style={styles.momentJewel} />
              <View style={styles.guideStatusCopy}>
                <Text style={styles.momentText}>
                  {guideState === 'loading'
                    ? 'THE GUIDE — A MOMENT, PLEASE'
                    : guideState === 'cached'
                      ? 'THE GUIDE — LAST RECEIPT'
                      : 'THE GUIDE IS NOT ANSWERING'}
                </Text>
                {guideState === 'unavailable' && guideError && (
                  <Text style={styles.difficultyDetail} numberOfLines={1}>{guideError}</Text>
                )}
              </View>
            </View>
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
  readingLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    backgroundColor: walnut.deep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  signalSeatFull: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  signalSeat: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000',
    transformOrigin: '50% 50%',
  },
  pictureTapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  crtCharge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: '#fff7db',
    shadowColor: '#fff7db',
    shadowOpacity: 0.95,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  portraitDifficulty: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.42)',
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
  guideStatus: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 70,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  guideStatusCopy: {
    gap: 3,
    alignItems: 'center',
  },

  // ── HUD anchor — the apron rides the bottom edge ──
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Web needs its DOM video connected to preserve the hls.js pipeline.
  // Native instead detaches VideoView and keeps the expo-video player alive.
  hiddenVideo: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
  },
});
