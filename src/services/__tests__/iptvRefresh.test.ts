jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { STORAGE_KEYS } from '../../constants/storage';
import type * as Iptv from '../iptv';

/**
 * The half-hourly refresh: an unchanged feed must cost nothing downstream.
 *
 * "Nothing" is checked by identity. watch.tsx hands `guide.epg.programmes`
 * to a React state setter, which ignores a value that is the same object;
 * so the same array back means no re-render, and it can only be the same
 * array if nothing was parsed.
 */

const config = { host: 'tv.local', port: 8409 };
const cacheKey = `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}tv.local:8409`;

function guideXml(title: string): string {
  return `<?xml version="1.0"?><tv><channel id="one"><display-name>One</display-name></channel>`
    + `<programme start="20260803120000 -0700" stop="20260803130000 -0700" channel="one"><title>${title}</title></programme></tv>`;
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

/** The station answers each request with the next body; a number is an HTTP failure. */
function station(...answers: Array<string | number>): jest.Mock {
  const queue = [...answers];
  const fetchMock = jest.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('station() ran out of answers');
    return typeof next === 'number' ? response('offline', next) : response(next);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('guide refresh', () => {
  const originalFetch = global.fetch;
  let iptv: typeof Iptv;

  beforeEach(() => {
    // The remembered guide is module state; every test starts a fresh set.
    jest.resetModules();
    iptv = require('../iptv');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hands back the very same guide when the feed has not changed', async () => {
    const storage = memoryStorage();
    // Two distinct string objects with equal contents, as two downloads are.
    station(guideXml('Matinee'), ['<?xml version="1.0"?>', guideXml('Matinee').slice(21)].join(''));

    const first = await iptv.fetchIptvGuide(config, storage);
    const second = await iptv.fetchIptvGuide(config, storage);

    expect(first.state).toBe('fresh');
    expect(second.state).toBe('fresh');
    expect(second.error).toBeUndefined();
    expect(second.epg).toBe(first.epg);
    expect(second.epg.programmes).toBe(first.epg.programmes);
    // Nothing was written the second time either: the cache already holds it.
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getAllKeys).toHaveBeenCalledTimes(1);
    expect(storage.values.get(cacheKey)).toBe(guideXml('Matinee'));
  });

  it('parses and caches again when the feed changes, and when it changes back', async () => {
    const storage = memoryStorage();
    station(guideXml('Matinee'), guideXml('Late Show'), guideXml('Matinee'));

    const first = await iptv.fetchIptvGuide(config, storage);
    const second = await iptv.fetchIptvGuide(config, storage);
    const third = await iptv.fetchIptvGuide(config, storage);

    expect(second.epg).not.toBe(first.epg);
    expect(second.epg.programmes[0].title).toBe('Late Show');
    expect(storage.values.get(cacheKey)).toBe(guideXml('Matinee'));
    expect(third.epg).not.toBe(second.epg);
    expect(third.epg.programmes[0].title).toBe('Matinee');
    expect(storage.setItem).toHaveBeenCalledTimes(3);
  });

  it('serves the guide in hand when the station goes quiet, without reading it back', async () => {
    const storage = memoryStorage();
    station(guideXml('Matinee'), 503, 503);

    const fresh = await iptv.fetchIptvGuide(config, storage);
    const quiet = await iptv.fetchIptvGuide(config, storage);
    const stillQuiet = await iptv.fetchIptvGuide(config, storage);

    expect(quiet.state).toBe('cached');
    expect(quiet.error).toBe('XMLTV request failed (503)');
    expect(quiet.epg).toBe(fresh.epg);
    expect(stillQuiet.epg).toBe(fresh.epg);
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('serves the guide in hand when the station answers with something that is not a guide', async () => {
    const storage = memoryStorage();
    station(guideXml('Matinee'), '<html>502 Bad Gateway</html>');

    const fresh = await iptv.fetchIptvGuide(config, storage);
    const broken = await iptv.fetchIptvGuide(config, storage);

    expect(broken.state).toBe('cached');
    expect(broken.error).toBe('XMLTV data was invalid');
    expect(broken.epg).toBe(fresh.epg);
    // The bad answer displaced nothing.
    expect(storage.values.get(cacheKey)).toBe(guideXml('Matinee'));
  });

  it('reads storage once after a relaunch with the station quiet, then remembers', async () => {
    const storage = memoryStorage();
    storage.values.set(cacheKey, guideXml('Yesterday'));
    station(503, 503, guideXml('Yesterday'));

    const first = await iptv.fetchIptvGuide(config, storage);
    const second = await iptv.fetchIptvGuide(config, storage);
    const back = await iptv.fetchIptvGuide(config, storage);

    expect(first.state).toBe('cached');
    expect(first.epg.programmes[0].title).toBe('Yesterday');
    expect(second.epg).toBe(first.epg);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    // The station returns with what the cache held: same guide, now fresh, nothing rewritten.
    expect(back.state).toBe('fresh');
    expect(back.epg).toBe(first.epg);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not vouch for a cache it could not write', async () => {
    const storage = memoryStorage();
    storage.setItem.mockRejectedValue(new Error('disk full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    station(guideXml('Matinee'), 503);

    const fresh = await iptv.fetchIptvGuide(config, storage);
    const quiet = await iptv.fetchIptvGuide(config, storage);

    expect(fresh.state).toBe('fresh');
    // As before this change: with nothing in storage the guide is unavailable.
    expect(quiet.state).toBe('unavailable');
    expect(quiet.epg.programmes).toEqual([]);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('keeps servers apart', async () => {
    const storage = memoryStorage();
    const other = { host: 'other.local', port: 8409 };
    const otherKey = `${STORAGE_KEYS.GUIDE_CACHE_PREFIX}other.local:8409`;
    // The same text from two servers: the icon rewrite makes the guides differ.
    const xml = guideXml('Matinee').replace('<display-name>', '<icon src="http://localhost:8409/logo.png"/><display-name>');
    station(xml, xml, 503, 503);

    const here = await iptv.fetchIptvGuide(config, storage);
    const there = await iptv.fetchIptvGuide(other, storage);

    expect(there.epg).not.toBe(here.epg);
    expect(here.epg.channels[0].icon).toBe('http://tv.local:8409/logo.png');
    expect(there.epg.channels[0].icon).toBe('http://other.local:8409/logo.png');
    // One cache at a time, as before: the second server's write evicted the first's.
    expect([...storage.values.keys()]).toEqual([otherKey]);

    // Back on the first server with its station quiet: its cache is gone, and
    // the other server's guide must not be offered in its place.
    const hereQuiet = await iptv.fetchIptvGuide(config, storage);
    expect(hereQuiet.state).toBe('unavailable');
    const thereQuiet = await iptv.fetchIptvGuide(other, storage);
    expect(thereQuiet.state).toBe('cached');
    expect(thereQuiet.epg).toBe(there.epg);
  });

  it('writes the cache again when asked to use a different storage', async () => {
    const one = memoryStorage();
    const two = memoryStorage();
    station(guideXml('Matinee'), guideXml('Matinee'), 503);

    const first = await iptv.fetchIptvGuide(config, one);
    const second = await iptv.fetchIptvGuide(config, two);

    expect(second.epg).toBe(first.epg);
    expect(two.setItem).toHaveBeenCalledTimes(1);
    // …and only the storage last written is trusted to hold it.
    const quiet = await iptv.fetchIptvGuide(config, one);
    expect(quiet.state).toBe('cached');
    expect(one.getItem).toHaveBeenCalledTimes(1);
  });

  it('gives two overlapping requests one guide', async () => {
    const storage = memoryStorage();
    station(guideXml('Matinee'), guideXml('Matinee'));

    const [a, b] = await Promise.all([iptv.fetchIptvGuide(config, storage), iptv.fetchIptvGuide(config, storage)]);

    expect(a.state).toBe('fresh');
    expect(b.epg).toBe(a.epg);
    expect(storage.values.get(cacheKey)).toBe(guideXml('Matinee'));
  });

  describe('readCachedGuide', () => {
    it('is null when nothing is known', async () => {
      const storage = memoryStorage();
      expect(await iptv.readCachedGuide(config, storage)).toBeNull();
    });

    it('is null when the cache is unreadable or is not a guide', async () => {
      const broken = memoryStorage();
      broken.getItem.mockRejectedValue(new Error('unreadable'));
      expect(await iptv.readCachedGuide(config, broken)).toBeNull();

      const junk = memoryStorage();
      junk.values.set(cacheKey, 'not a guide');
      expect(await iptv.readCachedGuide(config, junk)).toBeNull();
    });

    it('paints from storage first; the same feed from the network is then the same guide', async () => {
      const storage = memoryStorage();
      storage.values.set(cacheKey, guideXml('Matinee'));
      const fetchMock = station(guideXml('Matinee'));

      const cached = await iptv.readCachedGuide(config, storage);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cached?.state).toBe('cached');
      expect(cached?.epg.programmes[0].title).toBe('Matinee');

      const fresh = await iptv.fetchIptvGuide(config, storage);
      expect(fresh.state).toBe('fresh');
      expect(fresh.epg).toBe(cached?.epg);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('paints from storage first; a changed feed then replaces it', async () => {
      const storage = memoryStorage();
      storage.values.set(cacheKey, guideXml('Yesterday'));
      station(guideXml('Today'));

      const cached = await iptv.readCachedGuide(config, storage);
      const fresh = await iptv.fetchIptvGuide(config, storage);

      expect(cached?.epg.programmes[0].title).toBe('Yesterday');
      expect(fresh.epg.programmes[0].title).toBe('Today');
      expect(storage.values.get(cacheKey)).toBe(guideXml('Today'));
    });

    it('answers from memory, without storage, once a guide has been fetched', async () => {
      const storage = memoryStorage();
      station(guideXml('Matinee'));

      const fresh = await iptv.fetchIptvGuide(config, storage);
      const again = await iptv.readCachedGuide(config, storage);

      expect(again?.state).toBe('cached');
      expect(again?.epg).toBe(fresh.epg);
      expect(storage.getItem).not.toHaveBeenCalled();
    });

    it('does not let an old cache displace a fresh guide that arrived while it was being read', async () => {
      const storage = memoryStorage();
      storage.values.set(cacheKey, guideXml('Yesterday'));
      station(guideXml('Today'));
      // Storage is slow: the read resolves only when released.
      let release: (value: string) => void = () => {};
      storage.getItem.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));

      const reading = iptv.readCachedGuide(config, storage);
      const fresh = await iptv.fetchIptvGuide(config, storage);
      release(guideXml('Yesterday'));
      const cached = await reading;

      expect(cached?.epg).toBe(fresh.epg);
      expect(cached?.epg.programmes[0].title).toBe('Today');
      // The remembered guide is still today's: the same feed again parses nothing.
      station(guideXml('Today'));
      expect((await iptv.fetchIptvGuide(config, storage)).epg).toBe(fresh.epg);
    });

    it('does not answer for a different server', async () => {
      const storage = memoryStorage();
      station(guideXml('Matinee'));
      await iptv.fetchIptvGuide(config, storage);

      expect(await iptv.readCachedGuide({ host: 'other.local', port: 8409 }, storage)).toBeNull();
    });
  });
});
