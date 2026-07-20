import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/constants/storage';
import { colors } from '../src/constants/theme';

/**
 * Entry point — checks for a saved active server config.
 * Redirects to setup if none found, otherwise straight to the TV.
 *
 * Checks both the new multi-server format and the legacy single-server
 * format (migration happens on the channels screen via useServerConfig).
 */
export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    (async () => {
      const results = await AsyncStorage.multiGet([
        STORAGE_KEYS.SAVED_SERVERS,
        STORAGE_KEYS.ACTIVE_SERVER_ID,
        STORAGE_KEYS.SERVER_CONFIG,
      ]);

      const serversRaw = results[0][1];
      const idRaw = results[1][1];
      const legacyRaw = results[2][1];

      // New format: any non-empty saved-server list is enough.
      // Missing active ID is recovered by useServerConfig on next screen.
      let nextHasConfig = false;
      if (serversRaw) {
        try {
          const servers = JSON.parse(serversRaw);
          nextHasConfig = Array.isArray(servers) && servers.length > 0;
        } catch {
          nextHasConfig = false;
        }
      }

      // Legacy format still present — migration runs in useServerConfig.
      if (!nextHasConfig && legacyRaw) {
        nextHasConfig = true;
      }

      if (!nextHasConfig && idRaw) {
        // Stale active ID without servers should not count as configured.
        nextHasConfig = false;
      }

      setHasConfig(nextHasConfig);

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={hasConfig ? '/watch' : '/setup'} />;
}
