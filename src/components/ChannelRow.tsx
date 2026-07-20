import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, spacing, fontSize, channelColor } from '../constants/theme';
import type { Channel, Programme } from '../types';

interface ChannelRowProps {
  channel: Channel;
  nowPlaying?: Programme;
  upNext?: Programme;
  /** Navigate to player on channel tap */
  onPress: () => void;
  /** Open programme detail modal on now-playing tap */
  onNowPlayingPress?: (programme: Programme) => void;
}

/**
 * ON NOW card — each channel is a broadcast marquee, not a list row.
 *
 * The channel's identity color forms the card's spine and number badge.
 * The current programme title is set in serif (the library's liner-notes
 * voice), with a live progress bar in the channel color, time remaining,
 * and the next programme as a footer line — a prime-time grid entry.
 *
 * Tapping the card tunes in. Tapping the programme block opens its notes.
 */
export function ChannelRow({ channel, nowPlaying, upNext, onPress, onNowPlayingPress }: ChannelRowProps) {
  const identity = channelColor(channel.number);
  const timeRemaining = nowPlaying ? formatTimeRemaining(nowPlaying.stop) : null;
  const progress = nowPlaying ? getProgress(nowPlaying) : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Identity spine */}
      <View style={[styles.spine, { backgroundColor: identity }]} />

      <View style={styles.body}>
        {/* Header: number badge + channel name + time remaining */}
        <View style={styles.headerRow}>
          <View style={[styles.numberBadge, { borderColor: identity }]}>
            <Text style={[styles.numberText, { color: identity }]}>{channel.number}</Text>
          </View>
          <Text style={[styles.channelName, { color: identity }]} numberOfLines={1}>
            {channel.name.toUpperCase()}
          </Text>
          {timeRemaining && <Text style={styles.timeRemaining}>{timeRemaining}</Text>}
        </View>

        {/* Programme block */}
        {nowPlaying ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              onNowPlayingPress?.(nowPlaying);
            }}
          >
            <Text style={styles.programmeTitle} numberOfLines={2}>
              {nowPlaying.title}
              {nowPlaying.subtitle ? (
                <Text style={styles.programmeSubtitle}> — {nowPlaying.subtitle}</Text>
              ) : null}
            </Text>
            {nowPlaying.episodeNum && (
              <Text style={styles.episodeNum}>{nowPlaying.episodeNum}</Text>
            )}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%`, backgroundColor: identity },
                ]}
              />
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={styles.offAir}>No listing</Text>
        )}

        {/* Up next footer */}
        {upNext && (
          <Text style={styles.upNext} numberOfLines={1}>
            <Text style={styles.upNextLabel}>NEXT  </Text>
            {formatStartTime(upNext.start)} · {describeNext(upNext, nowPlaying)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** Fraction of the programme that has elapsed (0-1). */
function getProgress(programme: Programme): number {
  const now = Date.now();
  const start = programme.start.getTime();
  const stop = programme.stop.getTime();
  const duration = stop - start;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, (now - start) / duration));
}

/** Format time remaining until programme ends as "Xh Ym left" or "Ym left". */
function formatTimeRemaining(stop: Date): string | null {
  const diffMs = stop.getTime() - Date.now();
  if (diffMs <= 0) return null;

  const totalMins = Math.ceil(diffMs / 60000);
  if (totalMins < 1) return '<1m';
  if (totalMins < 60) return `${totalMins}m left`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`;
}

/**
 * Describe the next programme: when it's another episode of the series
 * already airing, the subtitle is the informative part — show it.
 */
function describeNext(next: Programme, current?: Programme): string {
  if (current && next.title === current.title && next.subtitle) {
    return next.subtitle;
  }
  return next.subtitle ? `${next.title} — ${next.subtitle}` : next.title;
}

/** Format a start time as a short clock string. */
function formatStartTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const grotesk = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  spine: {
    width: 3,
  },
  body: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  numberBadge: {
    minWidth: 32,
    height: 32,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  numberText: {
    fontFamily: grotesk,
    fontSize: fontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  channelName: {
    flex: 1,
    fontFamily: grotesk,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 3,
  },
  timeRemaining: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  programmeTitle: {
    fontFamily: grotesk,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    color: colors.text,
    marginTop: spacing.md,
  },
  programmeSubtitle: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  episodeNum: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: spacing.md,
  },
  progressFill: {
    height: 3,
  },
  offAir: {
    fontFamily: grotesk,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  upNext: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  upNextLabel: {
    color: colors.textMuted,
    fontFamily: grotesk,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
