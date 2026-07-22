/** AsyncStorage keys. */
export const STORAGE_KEYS = {
  /** @deprecated Migrated to SAVED_SERVERS + ACTIVE_SERVER_ID */
  SERVER_CONFIG: '@ipswitch/server-config',
  /** JSON array of SavedServer objects */
  SAVED_SERVERS: '@ipswitch/saved-servers',
  /** ID string of the currently active server */
  ACTIVE_SERVER_ID: '@ipswitch/active-server-id',
  /** Index of the last-watched channel — a TV remembers where it was */
  LAST_CHANNEL_INDEX: '@ipswitch/last-channel-index',
  /** Tune-in plate dwell: 'brief' | 'six' (seconds on screen) */
  FLASH_STYLE: '@ipswitch/flash-style',
  /** '1' when the set is silent (no detent, no clatter) */
  SOUND_MUTED: '@ipswitch/sound-muted',
} as const;
