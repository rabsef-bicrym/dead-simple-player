import { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { colors, spacing, fontSize, categoryColor } from '../constants/theme';
import type { Programme } from '../types';

interface ProgrammeDetailModalProps {
  programme: Programme | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Full-screen modal overlay showing complete programme information.
 *
 * Displays:
 * - Title, subtitle, and episode number
 * - Programme thumbnail (if available)
 * - Time range and duration
 * - Category pills with consistent hash-based colors
 * - Full scrollable description
 * - Year and previously-shown badges
 *
 * Dismissable by tapping the backdrop or the close button.
 */
export function ProgrammeDetailModal({ programme, visible, onClose }: ProgrammeDetailModalProps) {
  if (!programme) return null;

  const duration = useMemo(() => formatDuration(programme.start, programme.stop), [programme]);
  const timeRange = useMemo(() => formatTimeRange(programme.start, programme.stop), [programme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {/* Thumbnail */}
            {programme.icon && (
              <Image
                source={{ uri: programme.icon }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            )}

            {/* Title */}
            <Text style={styles.title}>{programme.title}</Text>

            {/* Episode line: subtitle + episode number */}
            {(programme.subtitle || programme.episodeNum) && (
              <Text style={styles.episodeLine}>
                {programme.episodeNum && (
                  <Text style={styles.episodeNum}>{programme.episodeNum}</Text>
                )}
                {programme.episodeNum && programme.subtitle && (
                  <Text style={styles.episodeSeparator}> &middot; </Text>
                )}
                {programme.subtitle && (
                  <Text style={styles.subtitleText}>{programme.subtitle}</Text>
                )}
              </Text>
            )}

            {/* Time + duration row */}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{timeRange}</Text>
              <Text style={styles.durationText}>{duration}</Text>
            </View>

            {/* Metadata badges: year, previously-shown */}
            {(programme.year || programme.previouslyShown) && (
              <View style={styles.badgeRow}>
                {programme.year && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{programme.year}</Text>
                  </View>
                )}
                {programme.previouslyShown && (
                  <View style={[styles.badge, styles.rerunBadge]}>
                    <Text style={styles.badgeText}>Previously Aired</Text>
                  </View>
                )}
              </View>
            )}

            {/* Category pills */}
            {programme.categories.length > 0 && (
              <View style={styles.categoryRow}>
                {programme.categories.map((cat) => (
                  <View
                    key={cat}
                    style={[styles.categoryPill, { backgroundColor: categoryColor(cat) + '22', borderColor: categoryColor(cat) + '66' }]}
                  >
                    <Text style={[styles.categoryText, { color: categoryColor(cat) }]}>{cat}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Description */}
            {programme.description && (
              <Text style={styles.description}>{programme.description}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Format a duration between two dates as "Xh Ym" or "Xm" or "<1m". */
function formatDuration(start: Date, stop: Date): string {
  const diffMs = stop.getTime() - start.getTime();
  if (diffMs <= 0) return '0m';
  const totalMins = Math.round(diffMs / 60000);
  if (totalMins < 1) return '<1m';
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Format start–stop as a human-readable time range. */
function formatTimeRange(start: Date, stop: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(stop)}`;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH - spacing.xl * 2,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    zIndex: 10,
  },
  closeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.accent,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.xxl + spacing.sm,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceLight,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  episodeLine: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
  },
  episodeNum: {
    color: colors.accent,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  episodeSeparator: {
    color: colors.textMuted,
  },
  subtitleText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  timeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  durationText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
  },
  rerunBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.lg,
  },
});
