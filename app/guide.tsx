import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/constants/storage';
import { parseM3U } from '../src/parsers/m3u';
import { parseXMLTV } from '../src/parsers/xmltv';
import { GuideGrid } from '../src/components/GuideGrid';
import { colors, spacing, fontSize } from '../src/constants/theme';
import type { Channel, Programme, ServerConfig } from '../src/types';

/** EPG guide screen — shows programme grid for all channels. */
export default function GuideScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
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

      if (!m3uRes.ok) throw new Error(`M3U: ${m3uRes.status}`);
      if (!xmltvRes.ok) throw new Error(`XMLTV: ${xmltvRes.status}`);

      const [m3uText, xmltvText] = await Promise.all([
        m3uRes.text(),
        xmltvRes.text(),
      ]);

      setChannels(parseM3U(m3uText, config.host, config.port));
      const epg = parseXMLTV(xmltvText, config.host, config.port);
      setProgrammes(epg.programmes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
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
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guide</Text>
        <View style={styles.headerSpacer} />
      </View>
      <GuideGrid channels={channels} programmes={programmes} />
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
  backText: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
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
