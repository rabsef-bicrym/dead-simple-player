import { parseM3U } from '../parsers/m3u';
import { parseXMLTV } from '../parsers/xmltv';
import type { Channel, EpgData, ServerConfig } from '../types';

const DEFAULT_TIMEOUT_MS = 10000;

/** Data bundle fetched from an ErsatzTV server. */
export interface IptvData {
  channels: Channel[];
  epg: EpgData;
}

/** Build a normalized http URL for a server + path. */
function buildServerUrl(config: ServerConfig, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `http://${config.host}:${config.port}${cleanPath}`;
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

/** Fetch and parse both playlist and XMLTV guide data for a server. */
export async function fetchIptvData(config: ServerConfig): Promise<IptvData> {
  const m3uUrl = buildServerUrl(config, '/iptv/channels.m3u');
  const xmltvUrl = buildServerUrl(config, '/iptv/xmltv.xml');

  const [m3uText, xmltvText] = await Promise.all([
    fetchTextWithTimeout(m3uUrl, 'M3U'),
    fetchTextWithTimeout(xmltvUrl, 'XMLTV'),
  ]);

  return {
    channels: parseM3U(m3uText, config.host, config.port),
    epg: parseXMLTV(xmltvText, config.host, config.port),
  };
}
