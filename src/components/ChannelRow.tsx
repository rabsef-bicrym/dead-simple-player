import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../constants/theme';
import type { Channel, Programme } from '../types';

interface ChannelRowProps {
  channel: Channel;
  nowPlaying?: Programme;
  onPress: () => void;
}

/**
 * A single row in the channel list showing:
 * - Channel number and logo
 * - Channel name
 * - Currently airing programme title and time remaining
 */
export function ChannelRow({ channel, nowPlaying, onPress }: ChannelRowProps) {
  const timeRemaining = nowPlaying
    ? formatTimeRemaining(nowPlaying.stop)
    : null;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {/* Channel number */}
      <View style={styles.numberContainer}>
        <Text style={styles.number}>{channel.number}</Text>
      </View>

      {/* Logo */}
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
          <View style={styles.nowPlayingRow}>
            <Text style={styles.nowPlayingTitle} numberOfLines={1}>
              {nowPlaying.title}
              {nowPlaying.subtitle ? ` — ${nowPlaying.subtitle}` : ''}
            </Text>
            {timeRemaining && (
              <Text style={styles.timeRemaining}>{timeRemaining}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.noData}>No programme data</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** Format time remaining until programme ends as "Xh Ym" or "Ym". */
function formatTimeRemaining(stop: Date): string | null {
  const now = new Date();
  const diffMs = stop.getTime() - now.getTime();
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  numberContainer: {
    width: 32,
    alignItems: 'center',
  },
  number: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  logoContainer: {
    width: 48,
    height: 36,
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 48,
    height: 36,
    borderRadius: 4,
  },
  logoPlaceholder: {
    width: 48,
    height: 36,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  channelName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
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
    fontVariant: ['tabular-nums'],
  },
  noData: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
