/** A single channel parsed from the M3U playlist. */
export interface Channel {
  /** Channel number from tvg-chno */
  number: number;
  /** Display name */
  name: string;
  /** Channel ID matching XMLTV channel attribute (e.g. "C1.145.ersatztv.org") */
  id: string;
  /** Logo/icon URL, if present */
  logo?: string;
  /** MPEG-TS stream URL */
  streamUrl: string;
}

/** A single programme parsed from XMLTV. */
export interface Programme {
  /** Channel ID matching Channel.id */
  channelId: string;
  /** Programme start time (Date object, UTC-adjusted) */
  start: Date;
  /** Programme end time (Date object, UTC-adjusted) */
  stop: Date;
  /** Programme title */
  title: string;
  /** Episode/sub-title, if present */
  subtitle?: string;
  /** Description text */
  description?: string;
  /** Programme icon URL, if present */
  icon?: string;
  /** Genre/category tags (e.g. "Series", "Drama", "Science Fiction") */
  categories: string[];
  /** Onscreen episode number (e.g. "S01E16"), if present */
  episodeNum?: string;
  /** Production year from <date> element, if present */
  year?: string;
  /** Whether this is a rerun/repeat */
  previouslyShown: boolean;
}

/** XMLTV channel metadata (separate from M3U channel). */
export interface XmltvChannel {
  id: string;
  displayName: string;
  icon?: string;
}

/** Full parsed EPG data. */
export interface EpgData {
  channels: XmltvChannel[];
  programmes: Programme[];
}

/** Server configuration stored in AsyncStorage. */
export interface ServerConfig {
  /** Host address (ip or hostname, no protocol) */
  host: string;
  /** Port number */
  port: number;
}

/** A saved ErsatzTV server configuration with metadata for multi-server management. */
export interface SavedServer {
  /** Unique identifier for this server entry */
  id: string;
  /** User-friendly display name (e.g. "Living Room ETV") */
  name: string;
  /** Host address (IP or hostname, no protocol) */
  host: string;
  /** Port number */
  port: number;
  /** Timestamp (ms since epoch) of last time this server was selected */
  lastUsed: number;
}
