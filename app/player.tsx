import { useEffect, useState, useCallback, useRef, useMemo, type ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Constants from 'expo-constants';
import Video, { type OnBufferData, type OnVideoErrorData } from 'react-native-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { getNowPlaying } from '../src/parsers/xmltv';
import { fetchIptvData } from '../src/services/iptv';
import { colors, fontSize, spacing } from '../src/constants/theme';
import type { Channel, Programme } from '../src/types';

const SWIPE_THRESHOLD = 80;
const OVERLAY_DURATION = 4000;
const BUFFERING_OVERLAY_DELAY_MS = 800;
const BUFFER_STALL_WINDOW_MS = 1500;
const PROGRAMME_CLOCK_TICK_MS = 15000;

type PlayerEngine = 'vlc' | 'native';

const vlcModule = (() => {
  try {
    return require('react-native-vlc-media-player');
  } catch {
    return null;
  }
})();

const VLCPlayer = (vlcModule?.VLCPlayer ?? null) as ComponentType<any> | null;

/** Parse channel index route param safely and default to 0. */
function parseChannelIndex(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '0', 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

/** Keep the selected index inside available channel bounds. */
function clampChannelIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
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

/** Determine which engine should be tried first. */
function resolvePrimaryEngine(vlcAvailable: boolean, streamUrl?: string): PlayerEngine {
  if (!vlcAvailable) return 'native';
  if (!streamUrl) return 'vlc';

  // Prefer native for HLS to unlock PiP/Now Playing controls, keep VLC for TS.
  if (streamUrl.toLowerCase().includes('.m3u8')) {
    return 'native';
  }

  return 'vlc';
}

function describeEngine(engine: PlayerEngine): string {
  return engine === 'vlc' ? 'VLC' : 'Native';
}

/**
 * Full-screen live player with automatic engine failover.
 *
 * Strategy:
 * - Primary engine: VLC (handles TS/HLS broadly on iOS + Android)
 * - Fallback engine: react-native-video native backend
 */
export default function PlayerScreen() {
  const { channelIndex: indexParam } = useLocalSearchParams<{ channelIndex: string }>();
  const { activeConfig, loading: configLoading } = useServerConfig();
  const isExpoGo = Constants.appOwnership === 'expo';
  const hasVlc = VLCPlayer !== null;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [currentIndex, setCurrentIndex] = useState(parseChannelIndex(indexParam));
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const [playerEngine, setPlayerEngine] = useState<PlayerEngine>(resolvePrimaryEngine(hasVlc));
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const isMountedRef = useRef(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressAt = useRef<number>(0);

  // Keep current channel index in sync with route updates.
  useEffect(() => {
    setCurrentIndex(parseChannelIndex(indexParam));
  }, [indexParam]);

  // Redirect to setup if no config.
  useEffect(() => {
    if (!configLoading && !activeConfig) {
      router.replace('/setup');
    }
  }, [configLoading, activeConfig]);

  /** Load channels + EPG from the active server. */
  const loadData = useCallback(async () => {
    if (!activeConfig) return;

    setDataLoading(true);
    if (isMountedRef.current) setDataError(null);

    try {
      const { channels: nextChannels, epg } = await fetchIptvData(activeConfig);
      if (!isMountedRef.current) return;

      setChannels(nextChannels);
      setProgrammes(epg.programmes);
      setCurrentIndex((previous) => clampChannelIndex(previous, nextChannels.length));
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

  const currentChannel = channels[currentIndex];

  // Tick wall clock so now-playing metadata can roll over without user interaction.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockNow(new Date());
    }, PROGRAMME_CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Reset playback engine and errors when channel changes.
  useEffect(() => {
    if (!currentChannel) return;

    setPlayerEngine(resolvePrimaryEngine(hasVlc, currentChannel.streamUrl));
    setFallbackUsed(false);
    setPlayerError(null);
    setBuffering(true);
    setShowBufferingOverlay(false);
    setClockNow(new Date());
    lastProgressAt.current = 0;
    if (bufferingTimer.current) {
      clearTimeout(bufferingTimer.current);
      bufferingTimer.current = null;
    }
  }, [currentChannel?.streamUrl, hasVlc]);

  const nowPlaying = useMemo(
    () => (currentChannel ? getNowPlaying(programmes, currentChannel.id, clockNow) : undefined),
    [currentChannel, programmes, clockNow],
  );

  const progress = useMemo(() => {
    if (!nowPlaying) return 0;
    const now = clockNow.getTime();
    const start = nowPlaying.start.getTime();
    const stop = nowPlaying.stop.getTime();
    const duration = stop - start;
    if (duration <= 0) return 0;
    return Math.min(1, Math.max(0, (now - start) / duration));
  }, [nowPlaying, clockNow]);

  const flashOverlay = useCallback(() => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    setShowOverlay(true);
    overlayOpacity.setValue(1);
    overlayTimer.current = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setShowOverlay(false));
    }, OVERLAY_DURATION);
  }, [overlayOpacity]);

  useEffect(() => {
    if (!dataLoading && currentChannel) {
      flashOverlay();
    }
  }, [currentIndex, dataLoading, currentChannel, flashOverlay]);

  // Clean up overlay timer on unmount.
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    };
  }, []);

  // Only show spinner when buffering persists and playback appears stalled.
  useEffect(() => {
    if (!buffering) {
      if (bufferingTimer.current) {
        clearTimeout(bufferingTimer.current);
        bufferingTimer.current = null;
      }
      setShowBufferingOverlay(false);
      return;
    }

    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    bufferingTimer.current = setTimeout(() => {
      const stalledForMs = Date.now() - lastProgressAt.current;
      if (stalledForMs >= BUFFER_STALL_WINDOW_MS) {
        setShowBufferingOverlay(true);
      }
    }, BUFFERING_OVERLAY_DELAY_MS);

    return () => {
      if (bufferingTimer.current) {
        clearTimeout(bufferingTimer.current);
        bufferingTimer.current = null;
      }
    };
  }, [buffering]);

  const onGestureEvent = useCallback(
    ({ nativeEvent }: any) => {
      if (nativeEvent.state !== State.END) return;

      const { translationY } = nativeEvent;
      if (translationY < -SWIPE_THRESHOLD && currentIndex < channels.length - 1) {
        setCurrentIndex((index) => index + 1);
      } else if (translationY > SWIPE_THRESHOLD && currentIndex > 0) {
        setCurrentIndex((index) => index - 1);
      }
    },
    [currentIndex, channels.length],
  );

  const handleTap = useCallback(() => {
    if (showOverlay) {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowOverlay(false));
    } else {
      flashOverlay();
    }
  }, [showOverlay, overlayOpacity, flashOverlay]);

  const handlePlaybackStarted = useCallback(() => {
    lastProgressAt.current = Date.now();
    setBuffering(false);
    setShowBufferingOverlay(false);
    setPlayerError(null);
  }, []);

  const handlePlaybackBuffering = useCallback(() => {
    setBuffering(true);
  }, []);

  const handlePlaybackLoadStart = useCallback(() => {
    setBuffering(true);
  }, []);

  const handlePlaybackProgress = useCallback(() => {
    lastProgressAt.current = Date.now();
    setBuffering(false);
    setShowBufferingOverlay(false);
  }, []);

  const tryFallbackEngine = useCallback(
    (reason: string) => {
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
      setPlayerError(`Playback failed on ${describeEngine(playerEngine)}. Retrying with ${describeEngine(nextEngine)}...`);
      console.warn('[Player failover]', reason);
    },
    [fallbackUsed, hasVlc, playerEngine],
  );

  const handleNativeBuffer = useCallback((event: OnBufferData) => {
    setBuffering(event.isBuffering);
  }, []);

  const handleNativeError = useCallback((event: OnVideoErrorData) => {
    const message = formatVideoError(event);
    tryFallbackEngine(`Native player error: ${message}`);
  }, [tryFallbackEngine]);

  const handleVlcError = useCallback((event: { target?: number } | undefined) => {
    const targetInfo = typeof event?.target === 'number' ? ` (target ${event.target})` : '';
    tryFallbackEngine(`VLC player error${targetInfo}`);
  }, [tryFallbackEngine]);

  if (configLoading || dataLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (dataError || !currentChannel) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{dataError ?? 'No channel available'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.secondaryAction}>Back to Channels</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isExpoGo) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Playback requires a development build. Expo Go does not include the native player modules.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.secondaryAction}>Back to Channels</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <PanGestureHandler
        onHandlerStateChange={onGestureEvent}
        activeOffsetY={[-20, 20]}
      >
        <View style={styles.container}>
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={styles.container}>
              {playerEngine === 'vlc' && VLCPlayer ? (
                <VLCPlayer
                  key={`${playerEngine}:${currentChannel.streamUrl}`}
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
                  onBuffering={handlePlaybackBuffering}
                  onProgress={handlePlaybackProgress}
                  onLoad={handlePlaybackStarted}
                  onError={handleVlcError}
                />
              ) : (
                <Video
                  key={`${playerEngine}:${currentChannel.streamUrl}`}
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
                  onLoadStart={handlePlaybackLoadStart}
                  onLoad={handlePlaybackStarted}
                  onBuffer={handleNativeBuffer}
                  onProgress={handlePlaybackProgress}
                  onError={handleNativeError}
                />
              )}

              {showBufferingOverlay && (
                <View style={styles.bufferingOverlay}>
                  <ActivityIndicator size="large" color={colors.text} />
                </View>
              )}

              {playerError && (
                <View style={styles.playerErrorOverlay}>
                  <Text style={styles.playerErrorText}>{playerError}</Text>
                </View>
              )}

              {/* Channel info overlay with gradient */}
              {showOverlay && (
                <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                  <LinearGradient
                    colors={['rgba(0,0,0,0.7)', 'transparent']}
                    style={styles.topGradient}
                  >
                    <TouchableOpacity
                      onPress={() => router.back()}
                      style={styles.backButton}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons name="chevron-back" size={28} color={colors.text} />
                    </TouchableOpacity>
                  </LinearGradient>

                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    style={styles.bottomGradient}
                  >
                    <View style={styles.channelInfo}>
                      <View style={styles.channelHeader}>
                        <View style={styles.channelBadge}>
                          <Text style={styles.channelNumber}>{currentChannel.number}</Text>
                        </View>
                        <Text style={styles.channelName}>{currentChannel.name}</Text>
                      </View>

                      {nowPlaying && (
                        <>
                          <Text style={styles.nowPlayingText} numberOfLines={2}>
                            {nowPlaying.title}
                            {nowPlaying.subtitle ? ` — ${nowPlaying.subtitle}` : ''}
                          </Text>
                          {nowPlaying.description && (
                            <Text style={styles.descriptionText} numberOfLines={2}>
                              {nowPlaying.description}
                            </Text>
                          )}
                          <View style={styles.progressTrack}>
                            <View
                              style={[styles.progressFill, { width: `${progress * 100}%` }]}
                            />
                          </View>
                        </>
                      )}

                      <Text style={styles.swipeHint}>
                        Swipe up/down to change channels · {describeEngine(playerEngine)}
                      </Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
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
    textAlign: 'center',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerErrorOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 120,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    padding: spacing.md,
  },
  playerErrorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topGradient: {
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGradient: {
    paddingTop: spacing.xxl,
  },
  channelInfo: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 44,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  channelBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  channelNumber: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  channelName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  nowPlayingText: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 1.5,
    marginTop: spacing.md,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.nowPlaying,
    borderRadius: 1.5,
  },
  swipeHint: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.3)',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
