/** AsyncStorage keys. */
export const STORAGE_KEYS = {
  /** @deprecated Migrated to SAVED_SERVERS + ACTIVE_SERVER_ID */
  SERVER_CONFIG: '@ipswitch/server-config',
  /** JSON array of SavedServer objects */
  SAVED_SERVERS: '@ipswitch/saved-servers',
  /** ID string of the currently active server */
  ACTIVE_SERVER_ID: '@ipswitch/active-server-id',
} as const;
