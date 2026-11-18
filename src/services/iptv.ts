import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
  getAllKeys(): Promise<readonly string[]>;
  removeItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<unknown>;
}

const EMPTY_EPG: EpgData = { channels: [], programmes: [] };
const MAX_WEB_GUIDE_CACHE_CHARS = 3_000_000;
let guideCacheWritesDisabled = false;
let guideCacheWarningLogged = false;

/**
 * The last guide parsed, beside the exact text it was parsed from.
 *
 * The station's schedule changes a few times a day; the set asks for it
 * every half hour, and again whenever it returns to the foreground. When
 * the answer is the text already held, the guide already parsed is handed
 * back: the very same object, so React sees no change and nothing under a
 * playing programme is re-rendered, and nothing is parsed or written.
 * Comparing two 3.5 MB strings is a memory compare (about a millisecond);
 * hashing them in JS would cost the thread more than the parse it saves.
 *
 * The price is the text itself staying in memory (3.5 MB of characters).
 */
interface GuideMemo {
  cacheKey: string;
  text: string;
  epg: EpgData;
  /** The storage `cacheGuide` has finished with for this text, if any… */
  storage: GuideStorage | null;
  /** …and whether that storage now holds the text under `cacheKey`. */
  cached: boolean;
}
let guideMemo: GuideMemo | null = null;

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

async function guideCacheKeys(storage: GuideStorage): Promise<readonly string[]> {
  const keys = await storage.getAllKeys();
  return keys.filter((key) => key.startsWith(STORAGE_KEYS.GUIDE_CACHE_PREFIX));
}

async function evictGuideCaches(storage: GuideStorage, keepKey?: string): Promise<void> {
  const keys = await guideCacheKeys(storage);
  await Promise.all(keys.filter((key) => key !== keepKey).map((key) => storage.removeItem(key)));
}

/** Resolves to whether `storage` now holds `xmltvText` under `cacheKey`. */
async function cacheGuide(storage: GuideStorage, cacheKey: string, xmltvText: string): Promise<boolean> {
  if (guideCacheWritesDisabled) return false;

  try {
    if (Platform.OS === 'web' && xmltvText.length > MAX_WEB_GUIDE_CACHE_CHARS) {
      await evictGuideCaches(storage);
      return false;
    }
    await evictGuideCaches(storage, cacheKey);
    await storage.setItem(cacheKey, xmltvText);
    return true;
  } catch (error) {
    guideCacheWritesDisabled = true;
    if (!guideCacheWarningLogged) {
      guideCacheWarningLogged = true;
      console.warn('[iptv] guide cache disabled after a storage failure', error);
    }
    try {
      await evictGuideCaches(storage);
    } catch {
      // Storage may remain unavailable; the live guide is still usable.
    }
    return false;
  }
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
    let memo = guideMemo;
    if (memo === null || memo.cacheKey !== cacheKey || memo.text !== xmltvText) {
      // Remembered before the cache write is awaited, so a second request
      // landing meanwhile (launch and a foreground event can overlap) is
      // handed this guide rather than parsing its own.
      memo = { cacheKey, text: xmltvText, epg: parseGuide(xmltvText, config), storage: null, cached: false };
      guideMemo = memo;
    }
    if (memo.storage !== storage) {
      memo.cached = await cacheGuide(storage, cacheKey, xmltvText);
      memo.storage = storage;
    }
    return { epg: memo.epg, state: 'fresh' };
  } catch (error) {
    const errorText = errorMessage(error);
    // The cache holds the text this guide was parsed from: reading 3.5 MB
    // back and parsing it again would arrive at the guide already in hand.
    const memo = guideMemo;
    if (memo !== null && memo.cacheKey === cacheKey && memo.storage === storage && memo.cached) {
      return { epg: memo.epg, state: 'cached', error: errorText };
    }
    const cached = await readGuideCache(config, storage);
    if (cached) return { epg: cached, state: 'cached', error: errorText };
    return { epg: EMPTY_EPG, state: 'unavailable', error: errorText };
  }
}

/** The guide cached for this server, parsed and remembered; null when there is none. */
async function readGuideCache(config: ServerConfig, storage: GuideStorage): Promise<EpgData | null> {
  const cacheKey = guideCacheKey(config);
  try {
    const cached = await storage.getItem(cacheKey);
    if (!cached) return null;
    // A fresh guide may have arrived while storage was being read; the
    // older text must not displace it.
    const newer = guideMemo;
    if (newer !== null && newer.cacheKey === cacheKey && newer.text !== cached) return newer.epg;
    if (newer !== null && newer.cacheKey === cacheKey) {
      newer.storage = storage;
      newer.cached = true;
      return newer.epg;
    }
    const epg = parseGuide(cached, config);
    guideMemo = { cacheKey, text: cached, epg, storage, cached: true };
    return epg;
  } catch {
    // A malformed or unreadable cache is the same as no guide at all.
    return null;
  }
}

/**
 * The last guide known for this server, without asking the network: the
 * one in memory if this server's was the last parsed, otherwise the one in
 * storage. Null when there is neither.
 *
 * For painting Home at once on a cold start while `fetchIptvGuide` is still
 * on the wire. When the network then answers with the same text, that call
 * returns this same guide object, so showing it first costs no second parse
 * and no second render.
 */
export async function readCachedGuide(
  config: ServerConfig,
  storage: GuideStorage = AsyncStorage,
): Promise<IptvGuide | null> {
  const memo = guideMemo;
  if (memo !== null && memo.cacheKey === guideCacheKey(config)) return { epg: memo.epg, state: 'cached' };
  const epg = await readGuideCache(config, storage);
  return epg ? { epg, state: 'cached' } : null;
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
