import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { colors, spacing, fontSize } from '../src/constants/theme';
import { getNowPlaying } from '../src/parsers/xmltv';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { fetchIptvData } from '../src/services/iptv';
import { ChannelRow } from '../src/components/ChannelRow';
import { ProgrammeDetailModal } from '../src/components/ProgrammeDetailModal';
import type { Channel, EpgData, Programme, ServerConfig } from '../src/types';

/** Channel list screen — shows all channels with now-playing info. */
export default function ChannelsScreen() {
  const {
    activeConfig,
    loading: configLoading,
    reload: reloadConfig,
  } = useServerConfig();

  const navigation = useNavigation();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [epg, setEpg] = useState<EpgData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tick state to force re-render every minute for time-remaining updates
  const [tick, setTick] = useState(0);
  // Programme detail modal state
  const [selectedProgramme, setSelectedProgramme] = useState<Programme | null>(null);

  // Reload config when screen gains focus (picks up settings changes)
  useEffect(() => {
    return navigation.addListener('focus', () => {
      reloadConfig();
    });
  }, [navigation, reloadConfig]);

  // Redirect to setup if no config after hook finishes loading
  useEffect(() => {
    if (!configLoading && !activeConfig) {
      router.replace('/setup');
    }
  }, [configLoading, activeConfig]);

  /**
   * Fetch M3U and XMLTV data from the active server, parse both.
   * Clears error state on success, sets it on failure.
   */
  const fetchData = useCallback(async (cfg: ServerConfig) => {
    try {
      const { channels: nextChannels, epg: nextEpg } = await fetchIptvData(cfg);
      setChannels(nextChannels);
      setEpg(nextEpg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // Fetch channel data when activeConfig becomes available or changes
  useEffect(() => {
    if (!activeConfig) return;
    setDataLoading(true);
    fetchData(activeConfig).finally(() => setDataLoading(false));
  }, [activeConfig, fetchData]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    if (!activeConfig) return;
    setRefreshing(true);
    await fetchData(activeConfig);
    setRefreshing(false);
  }, [activeConfig, fetchData]);

  // Tick every 60s to update time-remaining displays
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build a lookup map of channelId -> current programme
  const nowPlayingMap = useMemo(() => {
    if (!epg) return new Map<string, Programme>();
    const map = new Map<string, Programme>();
    const now = new Date();
    for (const ch of channels) {
      const prog = getNowPlaying(epg.programmes, ch.id, now);
      if (prog) map.set(ch.id, prog);
    }
    return map;
    // tick forces periodic recalc for time-remaining updates
  }, [epg, channels, tick]);

  // Navigate to player with channel index
  const handleChannelPress = useCallback(
    (index: number) => {
      router.push({
        pathname: '/player',
        params: { channelIndex: index.toString() },
      });
    },
    [],
  );

  // Navigate to settings (NOT clear config)
  const handleSettings = useCallback(() => {
    router.push('/settings');
  }, []);

  // Show loading during config loading or initial data fetch
  const isLoading = configLoading || dataLoading;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => activeConfig && fetchData(activeConfig)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.disconnectText}>Change Server</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>(×▶×) DS,P</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push('/guide')}
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="grid-outline" size={18} color={colors.accent} />
            <Text style={styles.headerAction}>Guide</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSettings}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ChannelRow
            channel={item}
            nowPlaying={nowPlayingMap.get(item.id)}
            onPress={() => handleChannelPress(index)}
            onNowPlayingPress={setSelectedProgramme}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={channels.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No channels found</Text>
        }
      />
      <ProgrammeDetailModal
        programme={selectedProgramme}
        visible={selectedProgramme !== null}
        onClose={() => setSelectedProgramme(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerAction: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '500',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.md,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  disconnectButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  disconnectText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
