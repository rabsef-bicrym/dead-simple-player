import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { STORAGE_KEYS } from '../src/constants/storage';
import { parseM3U } from '../src/parsers/m3u';
import { parseXMLTV, getNowPlaying } from '../src/parsers/xmltv';
import { colors, fontSize, spacing } from '../src/constants/theme';
import type { Channel, Programme, ServerConfig } from '../src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Minimum vertical swipe distance to trigger a channel change
const SWIPE_THRESHOLD = 80;
// How long to show the channel info overlay (ms)
const OVERLAY_DURATION = 4000;

/**
 * Full-screen HLS player.
 * - Receives channelIndex as route param
 * - Swipe up = next channel, swipe down = previous channel
 * - Tap to show/hide channel info overlay with gradient fade
 * - Back gesture or button returns to channel list
 */
export default function PlayerScreen() {
  const { channelIndex: indexParam } = useLocalSearchParams<{ channelIndex: string }>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [currentIndex, setCurrentIndex] = useState(parseInt(indexParam || '0', 10));
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load channel data
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_CONFIG);
      if (!raw) {
        router.replace('/setup');
        return;
      }

      const config: ServerConfig = JSON.parse(raw);
      const baseUrl = `http://${config.host}:${config.port}`;

      try {
        const [m3uRes, xmltvRes] = await Promise.all([
          fetch(`${baseUrl}/iptv/channels.m3u`),
          fetch(`${baseUrl}/iptv/xmltv.xml`),
        ]);

        const [m3uText, xmltvText] = await Promise.all([
          m3uRes.text(),
          xmltvRes.text(),
        ]);

        setChannels(parseM3U(m3uText, config.host, config.port));
        setProgrammes(parseXMLTV(xmltvText, config.host, config.port).programmes);
      } catch {
        router.back();
        return;
      }

      setLoading(false);
    })();
  }, []);

  const currentChannel = channels[currentIndex];
  const nowPlaying = useMemo(
    () => (currentChannel ? getNowPlaying(programmes, currentChannel.id) : undefined),
    [currentChannel, programmes],
  );

  // Progress fraction (0–1) through the current programme
  const progress = useMemo(() => {
    if (!nowPlaying) return 0;
    const now = Date.now();
    const start = nowPlaying.start.getTime();
    const stop = nowPlaying.stop.getTime();
    const duration = stop - start;
    if (duration <= 0) return 0;
    return Math.min(1, Math.max(0, (now - start) / duration));
  }, [nowPlaying]);

  // Show overlay briefly on channel change, then fade out
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

  // Flash overlay on channel change
  useEffect(() => {
    if (!loading && currentChannel) {
      flashOverlay();
    }
  }, [currentIndex, loading, currentChannel, flashOverlay]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

  // Handle swipe gestures for channel switching
  const onGestureEvent = useCallback(
    ({ nativeEvent }: any) => {
      if (nativeEvent.state === State.END) {
        const { translationY } = nativeEvent;

        if (translationY < -SWIPE_THRESHOLD && currentIndex < channels.length - 1) {
          setCurrentIndex((i) => i + 1);
          setBuffering(true);
        } else if (translationY > SWIPE_THRESHOLD && currentIndex > 0) {
          setCurrentIndex((i) => i - 1);
          setBuffering(true);
        }
      }
    },
    [currentIndex, channels.length],
  );

  // Toggle overlay on tap
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

  if (loading || !currentChannel) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
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
              {/* HLS Video Player */}
              <Video
                source={{ uri: currentChannel.streamUrl }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping={false}
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded) {
                    setBuffering(status.isBuffering);
                  }
                }}
                onError={() => setBuffering(false)}
              />

              {/* Buffering indicator */}
              {buffering && (
                <View style={styles.bufferingOverlay}>
                  <ActivityIndicator size="large" color={colors.text} />
                </View>
              )}

              {/* Channel info overlay with gradient */}
              {showOverlay && (
                <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                  {/* Top gradient: back button area */}
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

                  {/* Bottom gradient: channel info area */}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    style={styles.bottomGradient}
                  >
                    <View style={styles.channelInfo}>
                      {/* Channel badge + name */}
                      <View style={styles.channelHeader}>
                        <View style={styles.channelBadge}>
                          <Text style={styles.channelNumber}>{currentChannel.number}</Text>
                        </View>
                        <Text style={styles.channelName}>{currentChannel.name}</Text>
                      </View>

                      {/* Now playing info */}
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
                          {/* Programme progress bar */}
                          <View style={styles.progressTrack}>
                            <View
                              style={[styles.progressFill, { width: `${progress * 100}%` }]}
                            />
                          </View>
                        </>
                      )}

                      <Text style={styles.swipeHint}>Swipe up/down to change channels</Text>
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
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // Top gradient with back button
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

  // Bottom gradient with channel info
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

  // Programme progress bar
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
