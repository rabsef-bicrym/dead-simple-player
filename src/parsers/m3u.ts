import type { Channel } from '../types';

/**
 * Parse an ErsatzTV M3U playlist into Channel objects.
 *
 * ETV M3U format:
 *   #EXTM3U url-tvg="..." x-tvg-url="..."
 *   #EXTINF:0 tvg-id="C1.145.ersatztv.org" tvg-chno="1" tvg-name="The Prisoner" tvg-logo="http://..." ..., The Prisoner
 *   http://host:port/iptv/channel/1.ts
 *
 * Each channel is a pair of lines: #EXTINF metadata + stream URL.
 * The stream URL uses localhost — we rewrite it to the actual server host.
 */
export function parseM3U(raw: string, serverHost: string, serverPort: number): Channel[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const channels: Channel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF:')) continue;

    // Next non-comment line is the stream URL
    const streamLine = lines[i + 1];
    if (!streamLine || streamLine.startsWith('#')) continue;

    const id = extractAttr(line, 'tvg-id');
    const name = extractAttr(line, 'tvg-name') || extractDisplayName(line);
    const chno = extractAttr(line, 'tvg-chno');
    const logo = extractAttr(line, 'tvg-logo');

    if (!id || !name) continue;

    // Rewrite localhost URLs to the actual server address
    const streamUrl = rewriteUrl(streamLine, serverHost, serverPort);
    const logoUrl = logo ? rewriteUrl(logo, serverHost, serverPort) : undefined;

    channels.push({
      number: chno ? parseInt(chno, 10) : 0,
      name,
      id,
      logo: logoUrl,
      streamUrl,
    });
  }

  // Sort by channel number
  channels.sort((a, b) => a.number - b.number);
  return channels;
}

/**
 * Extract a quoted attribute value from an EXTINF line.
 * Matches: key="value"
 */
function extractAttr(line: string, key: string): string | undefined {
  const regex = new RegExp(`${key}="([^"]*)"`, 'i');
  const match = line.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Extract the display name from the end of an EXTINF line.
 * Format: #EXTINF:duration attrs, DisplayName
 */
function extractDisplayName(line: string): string {
  const commaIdx = line.lastIndexOf(',');
  if (commaIdx === -1) return '';
  return line.slice(commaIdx + 1).trim();
}

/**
 * Rewrite a URL from localhost:8409 to the actual server address.
 * ETV generates URLs with localhost, so we swap in the real host.
 */
function rewriteUrl(url: string, host: string, port: number): string {
  return url.replace(/localhost:\d+/, `${host}:${port}`);
}
