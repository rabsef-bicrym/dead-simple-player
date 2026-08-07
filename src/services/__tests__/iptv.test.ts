jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { STORAGE_KEYS } from '../../constants/storage';
import { fetchIptvData, fetchIptvGuide } from '../iptv';

const config = { host: 'tv.local', port: 8409 };
const m3u = `#EXTM3U
#EXTINF:0 tvg-id="channel-one" tvg-chno="1" tvg-name="Channel One", Channel One
http://localhost:8409/iptv/channel/1.ts`;
const xmltv = `<?xml version="1.0"?><tv>
<channel id="channel-one"><display-name>Channel One</display-name></channel>
<programme start="20260803120000 -0700" stop="20260803130000 -0700" channel="channel-one"><title>Matinee</title></programme>
</tv>`;

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    getAllKeys: jest.fn(async () => [...values.keys()]),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe('IPTV guide resilience', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns playable channels when XMLTV and its cache are unavailable', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('channels.m3u')
        ? response(m3u)
        : response('guide offline', 503),
    ) as unknown as typeof fetch;

    const result = await fetchIptvData(config, memoryStorage());

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].streamUrl).toBe('http://tv.local:8409/iptv/channel/1.ts');
    expect(result.epg.programmes).toEqual([]);
    expect(result.guideState).toBe('unavailable');
  });

  it('caches a good guide and uses it after a later XMLTV failure', async () => {
    const storage = memoryStorage();
    const oldCacheKey = `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}old.local:8409`;
    storage.values.set(oldCacheKey, xmltv);
    global.fetch = jest.fn(async () => response(xmltv)) as unknown as typeof fetch;

    const fresh = await fetchIptvGuide(config, storage);
    await Promise.resolve();

    expect(fresh.state).toBe('fresh');
    expect(storage.setItem).toHaveBeenCalledWith(
      `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}tv.local:8409`,
      xmltv,
    );
    expect(storage.removeItem).toHaveBeenCalledWith(oldCacheKey);
    expect(storage.values.has(oldCacheKey)).toBe(false);

    global.fetch = jest.fn(async () => response('guide offline', 503)) as unknown as typeof fetch;
    const cached = await fetchIptvGuide(config, storage);

    expect(cached.state).toBe('cached');
    expect(cached.epg.programmes[0].title).toBe('Matinee');
  });
});
