/** AsyncStorage keys. */
export const STORAGE_KEYS = {
  /** @deprecated Migrated to SAVED_SERVERS + ACTIVE_SERVER_ID */
  SERVER_CONFIG: '@ipswitch/server-config',
  /** JSON array of SavedServer objects */
  SAVED_SERVERS: '@ipswitch/saved-servers',
  /** ID string of the currently active server */
  ACTIVE_SERVER_ID: '@ipswitch/active-server-id',
  /** Stable tvg-id of the last-watched channel — a TV remembers where it was */
  LAST_CHANNEL_ID: '@ipswitch/last-channel-id',
  /** @deprecated Migrated to LAST_CHANNEL_ID */
  LAST_CHANNEL_INDEX: '@ipswitch/last-channel-index',
  /** Tune-in plate dwell: 'brief' | 'six' (seconds on screen) */
  FLASH_STYLE: '@ipswitch/flash-style',
  /** '1' when the set is silent (no detent, no clatter) */
  SOUND_MUTED: '@ipswitch/sound-muted',
  /** What upright shows while watching: 'shift' (column shift) | 'picture' (the reading orientation) */
  UPRIGHT_MODE: '@ipswitch/upright-mode',
  /** Sign-off tone: 'soft' (1 kHz, softly) | 'silent' */
  SIGNOFF_TONE: '@ipswitch/signoff-tone',
} as const;
