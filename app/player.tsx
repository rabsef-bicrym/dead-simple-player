import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Video, { ResizeMode } from 'react-native-video';
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
 * - Tap to show/hide channel info overlay
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

  // Load channel data (same as channel list, but we need it here too)
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

        const parsed = parseM3U(m3uText, config.host, config.port);
        const epg = parseXMLTV(xmltvText, config.host, config.port);

        setChannels(parsed);
        setProgrammes(epg.programmes);
      } catch {
        // If fetch fails, go back to channel list
        router.back();
        return;
      }

      setLoading(false);
    })();
  }, []);

  const currentChannel = channels[currentIndex];
  const nowPlaying = useMemo(
    () => currentChannel ? getNowPlaying(programmes, currentChannel.id) : undefined,
    [currentChannel, programmes]
  );

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
          // Swipe up = next channel
          setCurrentIndex((i) => i + 1);
          setBuffering(true);
        } else if (translationY > SWIPE_THRESHOLD && currentIndex > 0) {
          // Swipe down = previous channel
          setCurrentIndex((i) => i - 1);
          setBuffering(true);
        }
      }
    },
    [currentIndex, channels.length]
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
                onBuffer={({ isBuffering }: { isBuffering: boolean }) => setBuffering(isBuffering)}
                onError={() => setBuffering(false)}
                repeat={false}
                paused={false}
              />

              {/* Buffering indicator */}
              {buffering && (
                <View style={styles.bufferingOverlay}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              )}

              {/* Channel info overlay */}
              {showOverlay && (
                <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
                  {/* Top bar: back button */}
                  <TouchableWithoutFeedback onPress={() => router.back()}>
                    <View style={styles.backButton}>
                      <Text style={styles.backText}>Back</Text>
                    </View>
                  </TouchableWithoutFeedback>

                  {/* Bottom bar: channel info */}
                  <View style={styles.channelInfo}>
                    <View style={styles.channelHeader}>
                      <Text style={styles.channelNumber}>{currentChannel.number}</Text>
                      <Text style={styles.channelName}>{currentChannel.name}</Text>
                    </View>
                    {nowPlaying && (
                      <Text style={styles.nowPlayingText} numberOfLines={2}>
                        {nowPlaying.title}
                        {nowPlaying.subtitle ? ` — ${nowPlaying.subtitle}` : ''}
                      </Text>
                    )}
                    {nowPlaying?.description && (
                      <Text style={styles.descriptionText} numberOfLines={2}>
                        {nowPlaying.description}
                      </Text>
                    )}
                    <Text style={styles.swipeHint}>Swipe up/down to change channels</Text>
                  </View>
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
  backButton: {
    paddingTop: 60,
    paddingLeft: spacing.lg,
    paddingBottom: spacing.md,
  },
  backText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  channelInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 40,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  channelNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  channelName: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
  },
  nowPlayingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  swipeHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
