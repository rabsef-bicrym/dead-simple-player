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
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { parseM3U } from '../src/parsers/m3u';
import { parseXMLTV, getNowPlaying } from '../src/parsers/xmltv';
import { colors, fontSize, spacing } from '../src/constants/theme';
import type { Channel, Programme } from '../src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const OVERLAY_DURATION = 4000;

/**
 * Build the inline HTML string that loads mpegts.js from CDN and plays an
 * MPEG-TS stream in a full-screen <video> element.
 *
 * - Uses mpegts.js to demux the transport stream in JS.
 * - Posts messages back to React Native on errors so the overlay can react.
 * - Black background, no native controls, auto-play with sound.
 */
function buildPlayerHTML(streamUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
  </style>
</head>
<body>
  <video id="video" playsinline webkit-playsinline></video>
  <script src="https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js"></script>
  <script>
    (function() {
      // Send structured messages to React Native
      function postMsg(type, payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }

      var video = document.getElementById('video');
      var url = ${JSON.stringify(streamUrl)};

      if (!mpegts.isSupported()) {
        postMsg('error', 'mpegts.js is not supported in this browser');
        return;
      }

      var player = mpegts.createPlayer({
        type: 'mpegts',
        url: url,
        isLive: true
      }, {
        // Low-latency live streaming config
        enableWorker: false,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 3,
        liveBufferLatencyMinRemain: 0.5
      });

      player.attachMediaElement(video);
      player.load();

      // Attempt autoplay — iOS requires non-muted for sound
      video.muted = false;
      video.play().then(function() {
        postMsg('status', 'playing');
      }).catch(function(e) {
        // iOS may block unmuted autoplay; try muted first then unmute
        console.warn('Autoplay blocked, trying muted:', e.message);
        video.muted = true;
        video.play().then(function() {
          // Unmute after play starts (works on iOS with user-gesture-bypass props)
          video.muted = false;
          postMsg('status', 'playing');
        }).catch(function(e2) {
          postMsg('error', 'Autoplay failed: ' + e2.message);
        });
      });

      // Forward mpegts.js errors to RN
      player.on(mpegts.Events.ERROR, function(type, detail, info) {
        console.error('mpegts error:', type, detail, info);
        postMsg('error', type + ': ' + detail);
      });

      // Track buffering state via video element events
      video.addEventListener('waiting', function() {
        postMsg('status', 'buffering');
      });
      video.addEventListener('playing', function() {
        postMsg('status', 'playing');
      });
      video.addEventListener('error', function() {
        var err = video.error;
        postMsg('error', 'Video error: ' + (err ? err.message : 'unknown'));
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Full-screen MPEG-TS video player using WebView + mpegts.js.
 *
 * Replaces expo-video (which can't demux raw .ts streams) with a WebView that
 * loads mpegts.js from CDN to handle MPEG-TS demuxing in JavaScript.
 *
 * - Receives channelIndex as route param
 * - Swipe up = next channel, swipe down = previous channel
 * - Tap to show/hide channel info overlay with gradient fade
 * - Back gesture or button returns to channel list
 */
export default function PlayerScreen() {
  const { channelIndex: indexParam } = useLocalSearchParams<{ channelIndex: string }>();
  const { activeConfig, loading: configLoading } = useServerConfig();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [currentIndex, setCurrentIndex] = useState(parseInt(indexParam || '0', 10));
  const [dataLoading, setDataLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect to setup if no config
  useEffect(() => {
    if (!configLoading && !activeConfig) {
      router.replace('/setup');
    }
  }, [configLoading, activeConfig]);

  // Load channel data from active server config
  useEffect(() => {
    if (!activeConfig) return;

    (async () => {
      const baseUrl = `http://${activeConfig.host}:${activeConfig.port}`;

      try {
        const [m3uRes, xmltvRes] = await Promise.all([
          fetch(`${baseUrl}/iptv/channels.m3u`),
          fetch(`${baseUrl}/iptv/xmltv.xml`),
        ]);

        const [m3uText, xmltvText] = await Promise.all([
          m3uRes.text(),
          xmltvRes.text(),
        ]);

        setChannels(parseM3U(m3uText, activeConfig.host, activeConfig.port));
        setProgrammes(parseXMLTV(xmltvText, activeConfig.host, activeConfig.port).programmes);
      } catch {
        router.back();
        return;
      }

      setDataLoading(false);
    })();
  }, [activeConfig]);

  const currentChannel = channels[currentIndex];

  // Build the HTML source for the WebView player.
  // Memoized on streamUrl so it only regenerates on channel change.
  const webViewSource = useMemo(() => {
    if (!currentChannel) return undefined;
    return { html: buildPlayerHTML(currentChannel.streamUrl) };
  }, [currentChannel?.streamUrl]);

  /** Handle messages from the WebView (error reports, status updates). */
  const onWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'error') {
        console.error('[WebView player]', msg.payload);
        setBuffering(false);
      } else if (msg.type === 'status') {
        setBuffering(msg.payload === 'buffering');
      }
    } catch {
      console.warn('[WebView player] unparseable message:', event.nativeEvent.data);
    }
  }, []);

  const nowPlaying = useMemo(
    () => (currentChannel ? getNowPlaying(programmes, currentChannel.id) : undefined),
    [currentChannel, programmes],
  );

  const progress = useMemo(() => {
    if (!nowPlaying) return 0;
    const now = Date.now();
    const start = nowPlaying.start.getTime();
    const stop = nowPlaying.stop.getTime();
    const duration = stop - start;
    if (duration <= 0) return 0;
    return Math.min(1, Math.max(0, (now - start) / duration));
  }, [nowPlaying]);

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

  // Clean up overlay timer on unmount
  useEffect(() => {
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, []);

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

  if (configLoading || dataLoading || !currentChannel) {
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
              {/* WebView MPEG-TS player (behind overlay) */}
              {webViewSource && (
                <WebView
                  key={currentChannel.streamUrl}
                  source={webViewSource}
                  style={styles.video}
                  originWhitelist={['*']}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled
                  scrollEnabled={false}
                  bounces={false}
                  onMessage={onWebViewMessage}
                  allowsFullscreenVideo={false}
                  mixedContentMode="always"
                />
              )}

              {/* Buffering indicator */}
              {buffering && (
                <View style={styles.bufferingOverlay}>
                  <ActivityIndicator size="large" color={colors.text} />
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
    backgroundColor: '#000',
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
