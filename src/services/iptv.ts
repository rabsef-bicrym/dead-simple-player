import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseM3U } from '../parsers/m3u';
import { parseXMLTV } from '../parsers/xmltv';
import { STORAGE_KEYS } from '../constants/storage';
import type { Channel, EpgData, ServerConfig } from '../types';

const DEFAULT_TIMEOUT_MS = 10000;

/** Data bundle fetched from an ErsatzTV server. */
export interface IptvData {
  channels: Channel[];
  epg: EpgData;
  guideState: GuideState;
  guideError?: string;
}

export type GuideState = 'fresh' | 'cached' | 'unavailable';

export interface IptvGuide {
  epg: EpgData;
  state: GuideState;
  error?: string;
}

interface GuideStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

const EMPTY_EPG: EpgData = { channels: [], programmes: [] };

/** Build a normalized http URL for a server + path. */
function buildServerUrl(config: ServerConfig, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${config.host}:${config.port}${cleanPath}`;
}

function guideCacheKey(config: ServerConfig): string {
  return `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}${config.host}:${config.port}`;
}

function parseGuide(raw: string, config: ServerConfig): EpgData {
  if (!/<tv[\s>]/i.test(raw)) {
    throw new Error('XMLTV data was invalid');
  }
  return parseXMLTV(raw, config.host, config.port);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'XMLTV request failed';
}

/** Fetch text with timeout and endpoint-specific error messages. */
async function fetchTextWithTimeout(url: string, label: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${label} request failed (${response.status})`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} request timed out after ${Math.floor(timeoutMs / 1000)}s`);
    }
    throw error instanceof Error ? error : new Error(`${label} request failed`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Validate that a server is reachable and returns an M3U playlist. */
export async function verifyServerConnection(config: ServerConfig): Promise<void> {
  const playlistUrl = buildServerUrl(config, '/iptv/channels.m3u');
  const m3u = await fetchTextWithTimeout(playlistUrl, 'M3U');

  if (!m3u.includes('#EXTM3U')) {
    throw new Error('Server responded, but playlist data was invalid');
  }
}

/** Fetch the essential playlist. Guide availability never affects this path. */
export async function fetchIptvChannels(config: ServerConfig): Promise<Channel[]> {
  const m3uUrl = buildServerUrl(config, '/iptv/channels.m3u');
  const m3uText = await fetchTextWithTimeout(m3uUrl, 'M3U');
  return parseM3U(m3uText, config.host, config.port);
}

/** Fetch XMLTV, falling back to the last valid guide cached for this server. */
export async function fetchIptvGuide(
  config: ServerConfig,
  storage: GuideStorage = AsyncStorage,
): Promise<IptvGuide> {
  const xmltvUrl = buildServerUrl(config, '/iptv/xmltv.xml');
  const cacheKey = guideCacheKey(config);

  try {
    const xmltvText = await fetchTextWithTimeout(xmltvUrl, 'XMLTV');
    const epg = parseGuide(xmltvText, config);
    await storage.setItem(cacheKey, xmltvText).catch(() => {});
    return { epg, state: 'fresh' };
  } catch (error) {
    const errorText = errorMessage(error);
    try {
      const cached = await storage.getItem(cacheKey);
      if (cached) {
        return { epg: parseGuide(cached, config), state: 'cached', error: errorText };
      }
    } catch {
      // A malformed or unreadable cache is the same as no guide at all.
    }
    return { epg: EMPTY_EPG, state: 'unavailable', error: errorText };
  }
}

/** Fetch both sources resiliently for callers that want a single bundle. */
export async function fetchIptvData(
  config: ServerConfig,
  storage: GuideStorage = AsyncStorage,
): Promise<IptvData> {
  const [channels, guide] = await Promise.all([
    fetchIptvChannels(config),
    fetchIptvGuide(config, storage),
  ]);

  return {
    channels,
    epg: guide.epg,
    guideState: guide.state,
    guideError: guide.error,
  };
}
