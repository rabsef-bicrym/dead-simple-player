import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storage';
import type { ServerConfig } from '../types';

/**
 * Hook to load and manage the server config from AsyncStorage.
 * Returns the config, a setter (that persists), and a clear function.
 */
export function useServerConfig() {
  const [config, setConfigState] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.SERVER_CONFIG).then((value) => {
      if (value) {
        setConfigState(JSON.parse(value));
      }
      setLoading(false);
    });
  }, []);

  const setConfig = useCallback(async (newConfig: ServerConfig) => {
    await AsyncStorage.setItem(STORAGE_KEYS.SERVER_CONFIG, JSON.stringify(newConfig));
    setConfigState(newConfig);
  }, []);

  const clearConfig = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.SERVER_CONFIG);
    setConfigState(null);
  }, []);

  return { config, loading, setConfig, clearConfig };
}
