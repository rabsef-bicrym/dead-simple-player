import { useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors, spacing, fontSize } from '../constants/theme';
import type { Channel, Programme } from '../types';

interface GuideGridProps {
  channels: Channel[];
  programmes: Programme[];
  /** Number of hours to display in the grid (default 3) */
  hoursToShow?: number;
}

// Layout constants
const CHANNEL_LABEL_WIDTH = 100;
const HOUR_WIDTH = 300; // pixels per hour
const ROW_HEIGHT = 56;
const TIME_HEADER_HEIGHT = 32;
// Minimum pixel width for a programme cell so tiny ones remain tappable
const MIN_CELL_WIDTH = 4;

/**
 * EPG guide grid showing upcoming programmes per channel.
 *
 * Layout:
 * - Fixed left column with channel names
 * - Horizontally scrollable programme grid
 * - Time markers at the top
 * - Current time indicated with a red vertical line
 *
 * Handles tiny-duration programmes by enforcing a minimum cell width
 * so they don't disappear, while keeping them proportional to duration.
 */
export function GuideGrid({ channels, programmes, hoursToShow = 3 }: GuideGridProps) {
  const scrollRef = useRef<ScrollView>(null);
  const now = useMemo(() => new Date(), []);

  // Round start time down to the nearest half hour
  const gridStart = useMemo(() => {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
    return d;
  }, [now]);

  const gridEnd = useMemo(
    () => new Date(gridStart.getTime() + hoursToShow * 60 * 60 * 1000),
    [gridStart, hoursToShow]
  );

  const gridWidthPx = hoursToShow * HOUR_WIDTH;

  // Current time position as pixels from grid start
  const nowOffsetPx = useMemo(
    () => ((now.getTime() - gridStart.getTime()) / (1000 * 60 * 60)) * HOUR_WIDTH,
    [now, gridStart]
  );

  // Build time markers (every 30 minutes)
  const timeMarkers = useMemo(() => {
    const markers: { label: string; offsetPx: number }[] = [];
    const step = 30 * 60 * 1000; // 30 minutes in ms
    for (let t = gridStart.getTime(); t < gridEnd.getTime(); t += step) {
      const d = new Date(t);
      const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const offsetPx = ((t - gridStart.getTime()) / (1000 * 60 * 60)) * HOUR_WIDTH;
      markers.push({ label, offsetPx });
    }
    return markers;
  }, [gridStart, gridEnd]);

  // Build per-channel programme cells
  const channelRows = useMemo(() => {
    return channels.map((ch) => {
      // Get programmes that overlap the grid window
      const chProgs = programmes
        .filter((p) => {
          return p.channelId === ch.id && p.stop > gridStart && p.start < gridEnd;
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      // Convert to positioned cells
      const cells = chProgs.map((p) => {
        const startMs = Math.max(p.start.getTime(), gridStart.getTime());
        const endMs = Math.min(p.stop.getTime(), gridEnd.getTime());
        const leftPx = ((startMs - gridStart.getTime()) / (1000 * 60 * 60)) * HOUR_WIDTH;
        const rawWidth = ((endMs - startMs) / (1000 * 60 * 60)) * HOUR_WIDTH;
        const widthPx = Math.max(rawWidth, MIN_CELL_WIDTH);
        const isNow = p.start <= now && p.stop > now;

        return { programme: p, leftPx, widthPx, isNow };
      });

      return { channel: ch, cells };
    });
  }, [channels, programmes, gridStart, gridEnd, now]);

  return (
    <View style={styles.container}>
      {/* Time header row */}
      <View style={styles.headerRow}>
        <View style={styles.channelLabelHeader} />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: gridWidthPx }}
          scrollEventThrottle={16}
        >
          <View style={[styles.timeHeaderContent, { width: gridWidthPx }]}>
            {timeMarkers.map((marker, i) => (
              <Text
                key={i}
                style={[styles.timeLabel, { left: marker.offsetPx }]}
              >
                {marker.label}
              </Text>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Channel rows with scrollable programmes */}
      <ScrollView style={styles.verticalScroll} showsVerticalScrollIndicator={false}>
        {channelRows.map(({ channel, cells }) => (
          <View key={channel.id} style={styles.row}>
            {/* Fixed channel label */}
            <View style={styles.channelLabel}>
              <Text style={styles.channelNumber}>{channel.number}</Text>
              <Text style={styles.channelName} numberOfLines={1}>
                {channel.name}
              </Text>
            </View>

            {/* Scrollable programme cells */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ width: gridWidthPx, height: ROW_HEIGHT }}
            >
              <View style={[styles.programmeTrack, { width: gridWidthPx }]}>
                {cells.map((cell, i) => (
                  <View
                    key={`${cell.programme.channelId}-${i}`}
                    style={[
                      styles.programmeCell,
                      {
                        left: cell.leftPx,
                        width: cell.widthPx - 2, // 2px gap between cells
                      },
                      cell.isNow && styles.programmeCellNow,
                    ]}
                  >
                    <Text style={styles.programmeCellTitle} numberOfLines={1}>
                      {cell.programme.title}
                    </Text>
                    {cell.widthPx > 80 && cell.programme.subtitle && (
                      <Text style={styles.programmeCellSubtitle} numberOfLines={1}>
                        {cell.programme.subtitle}
                      </Text>
                    )}
                  </View>
                ))}

                {/* Current time indicator */}
                <View
                  style={[styles.nowLine, { left: nowOffsetPx }]}
                />
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    height: TIME_HEADER_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channelLabelHeader: {
    width: CHANNEL_LABEL_WIDTH,
  },
  timeHeaderContent: {
    height: TIME_HEADER_HEIGHT,
    position: 'relative',
  },
  timeLabel: {
    position: 'absolute',
    top: 8,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  verticalScroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channelLabel: {
    width: CHANNEL_LABEL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  channelNumber: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    width: 24,
    fontVariant: ['tabular-nums'],
  },
  channelName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  programmeTrack: {
    position: 'relative',
    height: ROW_HEIGHT,
  },
  programmeCell: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: colors.surface,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  programmeCellNow: {
    backgroundColor: colors.surfaceLight,
    borderLeftWidth: 2,
    borderLeftColor: colors.nowPlaying,
  },
  programmeCellTitle: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '500',
  },
  programmeCellSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  nowLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#e74c3c',
    zIndex: 10,
  },
});
