import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/constants/storage';
import { colors } from '../src/constants/theme';

/**
 * Entry point — checks for saved server config.
 * Redirects to setup if none found, otherwise to channel list.
 */
export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.SERVER_CONFIG).then((value) => {
      setHasConfig(value !== null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (hasConfig) {
    return <Redirect href="/channels" />;
  }

  return <Redirect href="/setup" />;
}
