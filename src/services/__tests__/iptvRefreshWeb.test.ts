jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { STORAGE_KEYS } from '../../constants/storage';
import type * as Iptv from '../iptv';

/**
 * On the web a guide over 3,000,000 characters is not cached at all (it
 * would not fit a browser's storage beside everything else). The station's
 * feed is over that today, so this is the path the living-room TV takes.
 */

const config = { host: 'tv.local', port: 8409 };
const cacheKey = `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}tv.local:8409`;

function guideXml(title: string, padding = 0): string {
  return `<?xml version="1.0"?><tv><channel id="one"><display-name>One</display-name></channel>`
    + `<programme start="20260803120000 -0700" stop="20260803130000 -0700" channel="one"><title>${title}</title>`
    + `<desc>${'essay '.repeat(padding)}</desc></programme></tv>`;
}

function response(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    getAllKeys: jest.fn(async () => [...values.keys()]),
    removeItem: jest.fn(async (key: string) => { values.delete(key); }),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

function station(...answers: Array<string | number>): void {
  const queue = [...answers];
  global.fetch = jest.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('station() ran out of answers');
    return typeof next === 'number' ? response('offline', next) : response(next);
  }) as unknown as typeof fetch;
}

describe('guide refresh on the web', () => {
  const originalFetch = global.fetch;
  let iptv: typeof Iptv;

  beforeEach(() => {
    jest.resetModules();
    iptv = require('../iptv');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('skips the parse for an unchanged oversized feed, and still caches nothing', async () => {
    const storage = memoryStorage();
    const big = guideXml('Matinee', 510_000);
    expect(big.length).toBeGreaterThan(3_000_000);
    storage.values.set(cacheKey, guideXml('An older, smaller guide'));
    station(big, `${big.slice(0, 100)}${big.slice(100)}`, 503);

    const first = await iptv.fetchIptvGuide(config, storage);
    const second = await iptv.fetchIptvGuide(config, storage);

    expect(second.state).toBe('fresh');
    expect(second.epg).toBe(first.epg);
    expect(storage.setItem).not.toHaveBeenCalled();
    // The oversized guide evicted the stale cache, once.
    expect(storage.values.size).toBe(0);
    expect(storage.getAllKeys).toHaveBeenCalledTimes(1);

    // Unchanged from before: with nothing cached, a quiet station means no guide.
    const quiet = await iptv.fetchIptvGuide(config, storage);
    expect(quiet.state).toBe('unavailable');
    expect(quiet.epg.programmes).toEqual([]);
  });

  it('still caches a feed that fits', async () => {
    const storage = memoryStorage();
    station(guideXml('Matinee'), 503);

    const fresh = await iptv.fetchIptvGuide(config, storage);
    const quiet = await iptv.fetchIptvGuide(config, storage);

    expect(storage.values.get(cacheKey)).toBe(guideXml('Matinee'));
    expect(quiet.state).toBe('cached');
    expect(quiet.epg).toBe(fresh.epg);
  });
});
