import { XMLParser } from 'fast-xml-parser';
import type { Programme, XmltvChannel, EpgData } from '../types';

/**
 * Parse an ErsatzTV XMLTV document into structured EPG data.
 *
 * Key challenges handled:
 * - Single-line XML (~540KB, zero newlines) — fast-xml-parser handles this natively
 * - Unicode: fullwidth punctuation, smart quotes, emoji, CJK, accented Latin
 * - HTML entities: &#39; &#128136; &amp; etc.
 * - Tiny-duration programmes (0-2 seconds) — kept as-is, layout handles them
 * - Timezone offsets in timestamps: "20260215070314 -0800"
 * - Missing icons on some channels (C1 The Prisoner)
 */

// Configure fast-xml-parser to preserve attributes and handle entities
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Decode HTML numeric entities (&#39; &#128136; etc.)
  htmlEntities: true,
  // Process all tag values as strings, don't coerce numbers
  parseTagValue: false,
  // Ensure arrays for elements that can repeat
  isArray: (name: string) => {
    return ['channel', 'programme', 'display-name', 'category', 'episode-num', 'icon'].includes(name);
  },
  // Handle BOM by trimming
  trimValues: true,
});

/**
 * Parse XMLTV string into EpgData.
 * The input may be a single enormous line — that's fine.
 */
export function parseXMLTV(raw: string, serverHost?: string, serverPort?: number): EpgData {
  // Strip BOM if present
  const cleaned = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  const parsed = parser.parse(cleaned);

  const tv = parsed.tv || parsed['tv'] || {};
  const rawChannels = ensureArray(tv.channel);
  const rawProgrammes = ensureArray(tv.programme);

  const channels = rawChannels.map((ch: any) => parseChannel(ch, serverHost, serverPort));
  const programmes = rawProgrammes.map(parseProgramme);

  return { channels, programmes };
}

/** Parse a single <channel> element. */
function parseChannel(raw: any, serverHost?: string, serverPort?: number): XmltvChannel {
  const id: string = raw['@_id'] || '';

  // display-name can be array; pick the standalone name (no number prefix)
  const displayNames = ensureArray(raw['display-name']);
  // ETV puts three display-names: "1 The Prisoner", "1", "The Prisoner"
  // We want the plain name (last one, or the one without a leading number)
  const name = displayNames.length >= 3
    ? String(displayNames[2])
    : String(displayNames[displayNames.length - 1] || id);

  // Icon may be absent (e.g. C1 The Prisoner)
  const icons = ensureArray(raw['icon']);
  let iconSrc = icons.length > 0 ? icons[0]?.['@_src'] : undefined;
  if (iconSrc && serverHost && serverPort) {
    iconSrc = rewriteUrl(iconSrc, serverHost, serverPort);
  }

  return { id, displayName: name, icon: iconSrc };
}

/** Parse a single <programme> element. */
function parseProgramme(raw: any): Programme {
  const channelId: string = raw['@_channel'] || '';
  const start = parseXmltvTimestamp(raw['@_start'] || '');
  const stop = parseXmltvTimestamp(raw['@_stop'] || '');

  // Title: may be string or object with #text and @_lang
  const titleRaw = ensureArray(raw['title']);
  const title = extractText(titleRaw[0]) || 'Untitled';

  // Sub-title (episode name)
  const subRaw = ensureArray(raw['sub-title']);
  const subtitle = subRaw.length > 0 ? extractText(subRaw[0]) : undefined;

  // Description
  const descRaw = ensureArray(raw['desc']);
  const description = descRaw.length > 0 ? extractText(descRaw[0]) : undefined;

  // Icon (may not exist on some channels)
  const icons = ensureArray(raw['icon']);
  const icon = icons.length > 0 ? icons[0]?.['@_src'] : undefined;

  // Categories — collect all <category> text values
  const catRaw = ensureArray(raw['category']);
  const categories = catRaw.map((c: any) => extractText(c)).filter((c): c is string => !!c);

  // Episode number — prefer "onscreen" format (e.g. "S01E16") over xmltv_ns
  const epNums = ensureArray(raw['episode-num']);
  let episodeNum: string | undefined;
  for (const ep of epNums) {
    if (typeof ep === 'object' && ep['@_system'] === 'onscreen') {
      episodeNum = extractText(ep);
      break;
    }
  }

  // Year from <date> element (ErsatzTV uses "0" as sentinel for unknown — treat as absent)
  const rawDate = raw['date'] ? String(raw['date']) : undefined;
  const year = rawDate && rawDate !== '0' ? rawDate : undefined;

  // Previously-shown flag — element exists means true (self-closing: <previously-shown/>)
  const previouslyShown = raw['previously-shown'] !== undefined && raw['previously-shown'] !== null;

  return { channelId, start, stop, title, subtitle, description, icon, categories, episodeNum, year, previouslyShown };
}

/**
 * Parse XMLTV timestamp format: "YYYYMMDDHHmmss +/-HHMM"
 * Example: "20260215070314 -0800"
 * Returns a UTC Date object.
 */
export function parseXmltvTimestamp(ts: string): Date {
  const trimmed = ts.trim();
  // Match: 14 digits, optional space, optional timezone offset
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!match) {
    return new Date(0);
  }

  const [, year, month, day, hour, minute, second, tz] = match;

  // Build an ISO-ish string with offset for correct parsing
  // fast-xml-parser preserves these as strings, so we parse manually
  let offsetMinutes = 0;
  if (tz) {
    const sign = tz[0] === '+' ? 1 : -1;
    const tzHours = parseInt(tz.slice(1, 3), 10);
    const tzMins = parseInt(tz.slice(3, 5), 10);
    offsetMinutes = sign * (tzHours * 60 + tzMins);
  }

  // Create Date in UTC, then adjust for the offset
  const utcMs = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );

  // The timestamp is local time + offset, so subtract offset to get UTC
  return new Date(utcMs - offsetMinutes * 60 * 1000);
}

/** Extract text content from a parsed XML element (string or {#text, @_lang}). */
function extractText(el: any): string | undefined {
  if (el === undefined || el === null) return undefined;
  if (typeof el === 'string') return el;
  if (typeof el === 'object' && '#text' in el) return String(el['#text']);
  return String(el);
}

/** Ensure a value is always an array. */
function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

/** Rewrite localhost URLs to real server address. */
function rewriteUrl(url: string, host: string, port: number): string {
  return url.replace(/localhost:\d+/, `${host}:${port}`);
}

/**
 * Get programmes currently airing on a channel.
 * Returns the programme whose start <= now < stop.
 */
export function getNowPlaying(programmes: Programme[], channelId: string, now?: Date): Programme | undefined {
  const t = now || new Date();
  return programmes.find(
    (p) => p.channelId === channelId && p.start <= t && p.stop > t
  );
}

/**
 * Get upcoming programmes for a channel (starting after now).
 * Returns them in chronological order, limited to `count`.
 */
export function getUpcoming(
  programmes: Programme[],
  channelId: string,
  count: number = 10,
  now?: Date
): Programme[] {
  const t = now || new Date();
  return programmes
    .filter((p) => p.channelId === channelId && p.stop > t)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}
