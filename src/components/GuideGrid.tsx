import { useRef, useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  PinchGestureHandler,
  State,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { colors, spacing, fontSize, categoryColor, channelColor } from '../constants/theme';
import type { Channel, Programme } from '../types';

interface GuideGridProps {
  channels: Channel[];
  programmes: Programme[];
  /** Number of hours to display in the grid (default 4) */
  hoursToShow?: number;
  /** Called when user taps a programme cell */
  onProgrammePress?: (programme: Programme) => void;
}

// ── Layout constants ──────────────────────────────────────────────────
const DEFAULT_HOUR_WIDTH = 360;
const MIN_HOUR_WIDTH = 140;
const MAX_HOUR_WIDTH = 1400;
const PINCH_UPDATE_EPSILON = 3;
const LEFT_ANCHOR_FRACTION = 0.03;
const GRID_CONTEXT_BEFORE_NOW_MS = 2 * 60 * 1000;
const ANCHOR_CHANNEL_COUNT = 8;
const ROW_HEIGHT = 64;
const TIME_HEADER_HEIGHT = 44;
const MIN_CELL_WIDTH = 4;
// Below this width (px), programme cells render as thin bars without text
const TINY_CELL_THRESHOLD = 24;
// Minimum width to show episode number below subtitle
const EPISODE_NUM_THRESHOLD = 140;

/**
 * EPG guide grid with synchronized scrolling.
 *
 * Architecture:
 * - Top-left corner shows the current time
 * - Time header row scrolls horizontally (synced with programme grid)
 * - Left rail of channel labels scrolls vertically (synced with grid)
 * - Programme grid is the master scroller (horizontal + vertical)
 *
 * Visual features:
 * - Category color-coded left border on each programme cell
 * - Now-playing cells highlighted with green accent border + subtle glow
 * - Past cells dimmed
 * - Tiny-duration programmes render as thin bars (no text)
 * - Episode number shown when space permits
 * - Prominent red current-time indicator with triangle marker
 * - Half-hour grid lines for alignment
 * - Auto-scrolls to "now" on mount
 * - Tapping a cell triggers onProgrammePress callback
 */
export function GuideGrid({ channels, programmes, hoursToShow = 4, onProgrammePress }: GuideGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const timeHeaderScrollRef = useRef<ScrollView>(null);
  const channelLabelScrollRef = useRef<ScrollView>(null);
  const gridHScrollRef = useRef<ScrollView>(null);
  const initialScrollDone = useRef(false);
  const currentScrollXRef = useRef(0);
  const pinchStartHourWidthRef = useRef(DEFAULT_HOUR_WIDTH);
  const pinchLastAppliedWidthRef = useRef(DEFAULT_HOUR_WIDTH);
  const initialTime = useRef(new Date()).current;
  const [now, setNow] = useState(initialTime);
  const [hourWidth, setHourWidth] = useState(DEFAULT_HOUR_WIDTH);

  const channelLabelWidth = useMemo(
    () => Math.max(64, Math.min(92, Math.round(screenWidth * 0.2))),
    [screenWidth],
  );

  // Refresh the "now" marker and current-programme styling periodically.
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Start the grid close to now to avoid large dead-space windows.
  const gridStart = useMemo(() => {
    const d = new Date(initialTime);
    d.setSeconds(0, 0);
    d.setTime(d.getTime() - GRID_CONTEXT_BEFORE_NOW_MS);
    return d;
  }, [initialTime]);

  const gridEnd = useMemo(
    () => new Date(gridStart.getTime() + hoursToShow * 60 * 60 * 1000),
    [gridStart, hoursToShow],
  );

  const gridWidthPx = hoursToShow * hourWidth;
  const totalContentHeight = channels.length * ROW_HEIGHT;

  // Current time position in pixels from grid start
  const nowOffsetPx = useMemo(
    () => ((now.getTime() - gridStart.getTime()) / (1000 * 60 * 60)) * hourWidth,
    [now, gridStart, hourWidth],
  );

  // Half-hour time markers
  const timeMarkers = useMemo(() => {
    const markers: { label: string; offsetPx: number }[] = [];
    const step = 30 * 60 * 1000;
    for (let t = gridStart.getTime(); t < gridEnd.getTime(); t += step) {
      const d = new Date(t);
      const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const offsetPx = ((t - gridStart.getTime()) / (1000 * 60 * 60)) * hourWidth;
      markers.push({ label, offsetPx });
    }
    return markers;
  }, [gridStart, gridEnd, hourWidth]);

  // Per-channel programme cells with positioning metadata
  const channelRows = useMemo(() => {
    return channels.map((ch) => {
      const chProgs = programmes
        .filter((p) => p.channelId === ch.id && p.stop > gridStart && p.start < gridEnd)
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      const cells = chProgs.map((p) => {
        const startMs = Math.max(p.start.getTime(), gridStart.getTime());
        const endMs = Math.min(p.stop.getTime(), gridEnd.getTime());
        const leftPx = ((startMs - gridStart.getTime()) / (1000 * 60 * 60)) * hourWidth;
        const rawWidth = ((endMs - startMs) / (1000 * 60 * 60)) * hourWidth;
        const widthPx = Math.max(rawWidth, MIN_CELL_WIDTH);
        const isNow = p.start <= now && p.stop > now;
        const isPast = p.stop <= now;

        return { programme: p, leftPx, widthPx, isNow, isPast };
      });

      return { channel: ch, cells };
    });
  }, [channels, programmes, gridStart, gridEnd, now, hourWidth]);

  // Find earliest current/upcoming programme in visible channels (skip past dead area).
  const firstPlayableOffsetPx = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;

    for (const row of channelRows.slice(0, ANCHOR_CHANNEL_COUNT)) {
      for (const cell of row.cells) {
        if (!cell.isPast && cell.leftPx < min) {
          min = cell.leftPx;
        }
      }
    }

    return Number.isFinite(min) ? min : null;
  }, [channelRows]);

  // Auto-scroll to earliest current/upcoming content so dead left area is minimized.
  useEffect(() => {
    if (initialScrollDone.current) return;
    const timer = setTimeout(() => {
      const viewWidth = screenWidth - channelLabelWidth;
      const targetOffsetPx = firstPlayableOffsetPx ?? nowOffsetPx;
      const maxX = Math.max(0, gridWidthPx - viewWidth);
      const targetX = Math.min(
        maxX,
        Math.max(0, targetOffsetPx - viewWidth * LEFT_ANCHOR_FRACTION),
      );
      gridHScrollRef.current?.scrollTo({ x: targetX, animated: false });
      timeHeaderScrollRef.current?.scrollTo({ x: targetX, animated: false });
      initialScrollDone.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, [nowOffsetPx, gridWidthPx, screenWidth, channelLabelWidth, firstPlayableOffsetPx]);

  // Sync horizontal scroll to time header
  const onGridHScroll = (e: any) => {
    currentScrollXRef.current = e.nativeEvent.contentOffset.x;
    timeHeaderScrollRef.current?.scrollTo({
      x: e.nativeEvent.contentOffset.x,
      animated: false,
    });
  };

  // Sync vertical scroll to channel labels
  const onGridVScroll = (e: any) => {
    channelLabelScrollRef.current?.scrollTo({
      y: e.nativeEvent.contentOffset.y,
      animated: false,
    });
  };

  /** Set horizontal time scale while preserving the centered timeline position. */
  const applyZoomWidth = (rawWidth: number) => {
    const nextHourWidth = Math.max(MIN_HOUR_WIDTH, Math.min(MAX_HOUR_WIDTH, rawWidth));

    setHourWidth((previousHourWidth) => {
      if (Math.abs(nextHourWidth - previousHourWidth) < 0.1) return previousHourWidth;

      const viewWidth = Math.max(0, screenWidth - channelLabelWidth);
      const centerHours = (currentScrollXRef.current + viewWidth / 2) / previousHourWidth;

      requestAnimationFrame(() => {
        const nextGridWidthPx = hoursToShow * nextHourWidth;
        const maxX = Math.max(0, nextGridWidthPx - viewWidth);
        const targetX = Math.min(maxX, Math.max(0, centerHours * nextHourWidth - viewWidth / 2));

        currentScrollXRef.current = targetX;
        gridHScrollRef.current?.scrollTo({ x: targetX, animated: false });
        timeHeaderScrollRef.current?.scrollTo({ x: targetX, animated: false });
      });

      return nextHourWidth;
    });
  };

  const onPinchGestureEvent = ({ nativeEvent }: any) => {
    const nextHourWidth = pinchStartHourWidthRef.current * nativeEvent.scale;
    if (Math.abs(nextHourWidth - pinchLastAppliedWidthRef.current) < PINCH_UPDATE_EPSILON) {
      return;
    }
    pinchLastAppliedWidthRef.current = nextHourWidth;
    applyZoomWidth(nextHourWidth);
  };

  const onPinchStateChange = ({ nativeEvent }: PinchGestureHandlerStateChangeEvent) => {
    if (nativeEvent.state === State.BEGAN) {
      pinchStartHourWidthRef.current = hourWidth;
      pinchLastAppliedWidthRef.current = hourWidth;
    }
    if (nativeEvent.state === State.END) {
      applyZoomWidth(pinchStartHourWidthRef.current * nativeEvent.scale);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Top row: corner + time header ── */}
      <View style={styles.headerRow}>
        <View style={[styles.cornerCell, { width: channelLabelWidth }]}>
          <Text style={styles.cornerTimeText}>
            {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        <ScrollView
          ref={timeHeaderScrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={[styles.timeHeaderContent, { width: gridWidthPx }]}>
            {timeMarkers.map((marker, i) => (
              <View key={i} style={[styles.timeMarkerGroup, { left: marker.offsetPx }]}>
                <Text style={styles.timeLabel}>{marker.label}</Text>
                <View style={styles.timeMarkerTick} />
              </View>
            ))}
            {/* Red dot in time header at "now" position */}
            <View style={[styles.timeHeaderNowDot, { left: nowOffsetPx - 3 }]} />
          </View>
        </ScrollView>
      </View>

      {/* ── Body: channel labels + programme grid ── */}
      <View style={styles.bodyRow}>
        {/* Fixed channel label column (synced vertically with grid).
            Wrapped in a plain View because react-native-web drops width
            set directly on a ScrollView's style, letting the rail
            stretch across the grid (it covered half the screen). */}
        <View style={[styles.channelLabelColumn, { width: channelLabelWidth }]}>
          <ScrollView
            ref={channelLabelScrollRef}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          >
            {channelRows.map(({ channel }) => (
              <View key={channel.id} style={styles.channelLabel}>
                <View
                  style={[
                    styles.channelNumberBadge,
                    { borderColor: channelColor(channel.number) },
                  ]}
                >
                  <Text
                    style={[
                      styles.channelNumberText,
                      { color: channelColor(channel.number) },
                    ]}
                  >
                    {channel.number}
                  </Text>
                </View>
                <Text style={styles.channelName} numberOfLines={1}>
                  {channel.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Scrollable programme grid (master scroller) */}
        <PinchGestureHandler
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchStateChange}
        >
          <View style={styles.gridWrapper}>
            <ScrollView
              ref={gridHScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={onGridHScroll}
              scrollEventThrottle={16}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                onScroll={onGridVScroll}
                scrollEventThrottle={16}
              >
                <View style={{ width: gridWidthPx, height: totalContentHeight }}>
              {/* Half-hour grid lines */}
              {timeMarkers.map((marker, i) => (
                <View
                  key={`gl-${i}`}
                  style={[styles.gridLine, { left: marker.offsetPx }]}
                />
              ))}

              {/* Programme rows */}
              {channelRows.map(({ channel, cells }, rowIndex) => (
                <View
                  key={channel.id}
                  style={[
                    styles.programmeRow,
                    { top: rowIndex * ROW_HEIGHT },
                    rowIndex % 2 === 1 && styles.programmeRowAlt,
                  ]}
                >
                  {cells.map((cell, i) => {
                    const isTiny = cell.widthPx < TINY_CELL_THRESHOLD;
                    const cellWidth = Math.max(cell.widthPx - 2, MIN_CELL_WIDTH);

                    // Derive category border color from first category (if any)
                    const catBorderColor = cell.programme.categories.length > 0
                      ? categoryColor(cell.programme.categories[0])
                      : undefined;

                    // Build dynamic border styles — category color on left unless now-playing
                    // (now-playing always gets the green border for visual priority)
                    const borderStyle = cell.isNow
                      ? undefined
                      : catBorderColor && !isTiny
                        ? { borderLeftWidth: 3, borderLeftColor: catBorderColor }
                        : undefined;

                    return (
                      <TouchableOpacity
                        key={`${cell.programme.channelId}-${i}`}
                        style={[
                          styles.programmeCell,
                          { left: cell.leftPx, width: cellWidth },
                          cell.isNow && styles.programmeCellNow,
                          cell.isPast && styles.programmeCellPast,
                          isTiny && styles.programmeCellTiny,
                          borderStyle,
                        ]}
                        activeOpacity={isTiny ? 1 : 0.7}
                        onPress={() => !isTiny && onProgrammePress?.(cell.programme)}
                        disabled={isTiny}
                      >
                        {!isTiny && (
                          <>
                            <Text
                              style={[
                                styles.programmeCellTitle,
                                cell.isNow && styles.programmeCellTitleNow,
                                cell.isPast && styles.programmeCellTitlePast,
                              ]}
                              numberOfLines={1}
                            >
                              {cell.programme.title}
                            </Text>
                            {cell.widthPx > 100 && cell.programme.subtitle && (
                              <Text
                                style={[
                                  styles.programmeCellSubtitle,
                                  cell.isPast && styles.programmeCellSubtitlePast,
                                ]}
                                numberOfLines={1}
                              >
                                {cell.programme.subtitle}
                              </Text>
                            )}
                            {cell.widthPx > EPISODE_NUM_THRESHOLD && cell.programme.episodeNum && (
                              <Text
                                style={[
                                  styles.programmeCellEpisode,
                                  cell.isPast && styles.programmeCellSubtitlePast,
                                ]}
                                numberOfLines={1}
                              >
                                {cell.programme.episodeNum}
                              </Text>
                            )}
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {/* ── Current time indicator ── */}
                  <View style={[styles.nowIndicatorContainer, { left: nowOffsetPx }]}>
                    <View style={styles.nowTriangle} />
                    <View style={[styles.nowLine, { height: totalContentHeight - 6 }]} />
                  </View>
                </View>
              </ScrollView>
            </ScrollView>
          </View>
        </PinchGestureHandler>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header row ──
  headerRow: {
    flexDirection: 'row',
    height: TIME_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cornerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  cornerTimeText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  timeHeaderContent: {
    height: TIME_HEADER_HEIGHT,
    position: 'relative',
  },
  timeMarkerGroup: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'flex-start',
  },
  timeLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    paddingLeft: spacing.sm,
    paddingTop: spacing.md,
  },
  timeMarkerTick: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 1,
    height: 10,
    backgroundColor: colors.borderLight,
  },
  timeHeaderNowDot: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.timeIndicator,
  },

  // ── Body row ──
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridWrapper: {
    flex: 1,
  },
  channelLabelColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },
  channelLabel: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channelLogo: {
    width: 32,
    height: 24,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  channelNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  channelNumberText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  channelName: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 16,
  },

  // ── Programme grid ──
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    zIndex: 1,
  },
  programmeRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  programmeRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  programmeCell: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  programmeCellNow: {
    backgroundColor: colors.nowPlayingDim,
    borderLeftWidth: 3,
    borderLeftColor: colors.nowPlaying,
    // Shadow for subtle glow on iOS
    shadowColor: colors.nowPlaying,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  programmeCellPast: {
    opacity: 0.35,
  },
  programmeCellTiny: {
    paddingHorizontal: 0,
    borderRadius: 2,
    backgroundColor: colors.surfaceBright,
  },
  programmeCellTitle: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '500',
  },
  programmeCellTitleNow: {
    fontWeight: '600',
  },
  programmeCellTitlePast: {
    color: colors.textMuted,
  },
  programmeCellSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  programmeCellSubtitlePast: {
    color: colors.textMuted,
  },
  programmeCellEpisode: {
    fontSize: 9,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },

  // ── Current time indicator ──
  nowIndicatorContainer: {
    position: 'absolute',
    top: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  nowTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.timeIndicator,
  },
  nowLine: {
    width: 2,
    backgroundColor: colors.timeIndicator,
  },
});
