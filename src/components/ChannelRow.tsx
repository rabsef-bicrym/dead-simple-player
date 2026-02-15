import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, categoryColor } from '../constants/theme';
import type { Channel, Programme } from '../types';

interface ChannelRowProps {
  channel: Channel;
  nowPlaying?: Programme;
  /** Navigate to player on channel tap */
  onPress: () => void;
  /** Open programme detail modal on now-playing tap */
  onNowPlayingPress?: (programme: Programme) => void;
}

/**
 * A single row in the channel list showing:
 * - Channel number and logo
 * - Channel name
 * - Currently airing programme with title, subtitle, episode number, and time remaining
 * - Category tags as small colored pills
 * - Progress bar showing how far into the current programme we are
 *
 * Tapping the row navigates to the player.
 * Tapping the now-playing info area opens the programme detail modal.
 */
export function ChannelRow({ channel, nowPlaying, onPress, onNowPlayingPress }: ChannelRowProps) {
  const timeRemaining = nowPlaying ? formatTimeRemaining(nowPlaying.stop) : null;
  const progress = nowPlaying ? getProgress(nowPlaying) : 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.content}>
        {/* Channel number */}
        <View style={styles.numberContainer}>
          <Text style={styles.number}>{channel.number}</Text>
        </View>

        {/* Logo or placeholder */}
        <View style={styles.logoContainer}>
          {channel.logo ? (
            <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>
                {channel.name.charAt(0)}
              </Text>
            </View>
          )}
        </View>

        {/* Channel info + now playing */}
        <View style={styles.info}>
          <Text style={styles.channelName} numberOfLines={1}>
            {channel.name}
          </Text>
          {nowPlaying ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={(e) => {
                e.stopPropagation();
                onNowPlayingPress?.(nowPlaying);
              }}
            >
              <View style={styles.nowPlayingRow}>
                <Text style={styles.nowPlayingTitle} numberOfLines={1}>
                  {nowPlaying.title}
                  {nowPlaying.subtitle ? ` — ${nowPlaying.subtitle}` : ''}
                </Text>
                {timeRemaining && (
                  <Text style={styles.timeRemaining}>{timeRemaining}</Text>
                )}
              </View>
              {/* Episode number + categories row */}
              {(nowPlaying.episodeNum || nowPlaying.categories.length > 0) && (
                <View style={styles.metaRow}>
                  {nowPlaying.episodeNum && (
                    <Text style={styles.episodeNum}>{nowPlaying.episodeNum}</Text>
                  )}
                  {nowPlaying.categories.slice(0, 3).map((cat) => (
                    <View
                      key={cat}
                      style={[styles.categoryTag, { backgroundColor: categoryColor(cat) + '20', borderColor: categoryColor(cat) + '55' }]}
                    >
                      <Text style={[styles.categoryTagText, { color: categoryColor(cat) }]}>{cat}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.noData}>No programme data</Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {nowPlaying && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      )}
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

/** Format time remaining until programme ends as "Xh Ym" or "Ym". */
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

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  numberContainer: {
    width: 36,
    alignItems: 'center',
  },
  number: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  logoContainer: {
    width: 52,
    height: 40,
    marginLeft: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 52,
    height: 40,
    borderRadius: 6,
  },
  logoPlaceholder: {
    width: 52,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  channelName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  nowPlayingTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  timeRemaining: {
    fontSize: fontSize.xs,
    color: colors.nowPlaying,
    marginLeft: spacing.sm,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  episodeNum: {
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginRight: spacing.xs,
  },
  categoryTag: {
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  noData: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },

  // Progress bar
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.nowPlaying,
    borderRadius: 1,
  },
});
