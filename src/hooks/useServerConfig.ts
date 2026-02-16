import { useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storage';
import type { ServerConfig, SavedServer } from '../types';

/** Generate a short unique ID for local storage use. */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Hook to manage multiple saved server configurations with an active selection.
 *
 * On first load, migrates from the legacy single-config format if present.
 * Provides CRUD operations for saved servers and a memoized `activeConfig`
 * derived from the currently selected server.
 *
 * Call `reload()` to re-read from AsyncStorage (e.g., on screen focus
 * after returning from settings).
 */
export function useServerConfig() {
  const [servers, setServers] = useState<SavedServer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Derive active server from the list
  const activeServer = servers.find((s) => s.id === activeId) ?? null;

  // Stable key for memoization — only changes when host:port actually changes
  const configKey = activeServer ? `${activeServer.host}:${activeServer.port}` : '';

  // Memoized ServerConfig to prevent unnecessary downstream re-renders/refetches
  const activeConfig = useMemo<ServerConfig | null>(
    () => (activeServer ? { host: activeServer.host, port: activeServer.port } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configKey],
  );

  /**
   * Load saved servers from AsyncStorage. Handles migration from the legacy
   * single-config format (@ipswitch/server-config) to the new multi-server
   * format (saved-servers + active-server-id).
   */
  const load = useCallback(async () => {
    try {
      const results = await AsyncStorage.multiGet([
        STORAGE_KEYS.SAVED_SERVERS,
        STORAGE_KEYS.ACTIVE_SERVER_ID,
        STORAGE_KEYS.SERVER_CONFIG,
      ]);

      const serversRaw = results[0][1];
      const idRaw = results[1][1];
      const legacyRaw = results[2][1];

      if (serversRaw) {
        // New multi-server format already exists
        setServers(JSON.parse(serversRaw));
        setActiveId(idRaw);
      } else if (legacyRaw) {
        // Migrate from legacy single-server format
        const legacy: ServerConfig = JSON.parse(legacyRaw);
        const migrated: SavedServer = {
          id: generateId(),
          name: `${legacy.host}:${legacy.port}`,
          host: legacy.host,
          port: legacy.port,
          lastUsed: Date.now(),
        };

        await AsyncStorage.multiSet([
          [STORAGE_KEYS.SAVED_SERVERS, JSON.stringify([migrated])],
          [STORAGE_KEYS.ACTIVE_SERVER_ID, migrated.id],
        ]);
        await AsyncStorage.removeItem(STORAGE_KEYS.SERVER_CONFIG);

        setServers([migrated]);
        setActiveId(migrated.id);
      } else {
        // No config at all
        setServers([]);
        setActiveId(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  /** Add a new server and set it as the active one. Returns the created server. */
  const addServer = useCallback(
    async (name: string, host: string, port: number): Promise<SavedServer> => {
      const server: SavedServer = {
        id: generateId(),
        name,
        host,
        port,
        lastUsed: Date.now(),
      };
      const updated = [...servers, server];

      setServers(updated);
      setActiveId(server.id);

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.SAVED_SERVERS, JSON.stringify(updated)],
        [STORAGE_KEYS.ACTIVE_SERVER_ID, server.id],
      ]);

      return server;
    },
    [servers],
  );

  /** Update fields on an existing server. */
  const updateServer = useCallback(
    async (id: string, changes: Partial<Pick<SavedServer, 'name' | 'host' | 'port'>>) => {
      const updated = servers.map((s) => (s.id === id ? { ...s, ...changes } : s));
      setServers(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_SERVERS, JSON.stringify(updated));
    },
    [servers],
  );

  /** Delete a server. If it was active, selects the first remaining or clears. */
  const deleteServer = useCallback(
    async (id: string) => {
      const updated = servers.filter((s) => s.id !== id);
      setServers(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_SERVERS, JSON.stringify(updated));

      // If we deleted the active server, fall back to the first remaining or null
      if (activeId === id) {
        const nextId = updated.length > 0 ? updated[0].id : null;
        setActiveId(nextId);
        if (nextId) {
          await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SERVER_ID, nextId);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_SERVER_ID);
        }
      }
    },
    [servers, activeId],
  );

  /** Switch to a different server and update its lastUsed timestamp. */
  const setActiveServer = useCallback(
    async (id: string) => {
      setActiveId(id);
      const updated = servers.map((s) =>
        s.id === id ? { ...s, lastUsed: Date.now() } : s,
      );
      setServers(updated);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.SAVED_SERVERS, JSON.stringify(updated)],
        [STORAGE_KEYS.ACTIVE_SERVER_ID, id],
      ]);
    },
    [servers],
  );

  return {
    activeConfig,
    activeServer,
    servers,
    loading,
    reload: load,
    addServer,
    updateServer,
    deleteServer,
    setActiveServer,
  };
}
