import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { fetchIptvData } from '../src/services/iptv';
import { GuideGrid } from '../src/components/GuideGrid';
import { ProgrammeDetailModal } from '../src/components/ProgrammeDetailModal';
import { colors, spacing, fontSize } from '../src/constants/theme';
import type { Channel, Programme, ServerConfig } from '../src/types';

/** EPG guide screen — shows programme grid for all channels. */
export default function GuideScreen() {
  const {
    activeConfig,
    loading: configLoading,
    reload: reloadConfig,
  } = useServerConfig();

  const navigation = useNavigation();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProgramme, setSelectedProgramme] = useState<Programme | null>(null);

  // Reload config on screen focus
  useEffect(() => {
    return navigation.addListener('focus', () => {
      reloadConfig();
    });
  }, [navigation, reloadConfig]);

  // Redirect to setup if no config
  useEffect(() => {
    if (!configLoading && !activeConfig) {
      router.replace('/setup');
    }
  }, [configLoading, activeConfig]);

  /** Fetch and parse M3U + XMLTV from the active server. */
  const fetchData = useCallback(async (cfg: ServerConfig) => {
    try {
      const { channels: nextChannels, epg } = await fetchIptvData(cfg);
      setChannels(nextChannels);
      setProgrammes(epg.programmes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // Fetch data when config is available
  useEffect(() => {
    if (!activeConfig) return;
    setDataLoading(true);
    fetchData(activeConfig).finally(() => setDataLoading(false));
  }, [activeConfig, fetchData]);

  const isLoading = configLoading || dataLoading;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading guide...</Text>
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
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Channels</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guide</Text>
        <View style={styles.headerSpacer} />
      </View>
      <GuideGrid
        channels={channels}
        programmes={programmes}
        onProgrammePress={setSelectedProgramme}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  backText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    minWidth: 80,
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
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
