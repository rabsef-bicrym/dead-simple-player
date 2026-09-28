import {
  PREWARM_ABORT_MS,
  PREWARM_DWELL_MS,
  PREWARM_RETOUCH_MS,
  createPrewarmer,
  type PrewarmPort,
} from '../prewarm';

interface Touch { url: string; signal: AbortSignal; aborted: boolean; resolve: () => void; reject: (e: Error) => void }

/** A port over jest's fake timers whose touches settle only when the test says. */
function port() {
  const touches: Touch[] = [];
  const p: PrewarmPort = {
    touch: (url, signal) => new Promise<void>((resolve, reject) => {
      const t: Touch = { url, signal, aborted: false, resolve, reject };
      signal.addEventListener('abort', () => { t.aborted = true; reject(new Error('aborted')); });
      touches.push(t);
    }),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  return { port: p, touches, urls: () => touches.map((t) => t.url) };
}

const flush = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('the pre-warm', () => {
  it(`touches once, after a ${PREWARM_DWELL_MS} ms dwell`, () => {
    const { port: p, urls } = port();
    const w = createPrewarmer(p);
    w.rest('http://etv/iptv/channel/5.m3u8?mode=segmenter');
    jest.advanceTimersByTime(PREWARM_DWELL_MS - 1);
    expect(urls()).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(urls()).toEqual(['http://etv/iptv/channel/5.m3u8?mode=segmenter']);
    jest.advanceTimersByTime(1000);
    expect(urls()).toHaveLength(1);
  });

  it('a move before the dwell cancels it; only the channel the dial settles on is touched', () => {
    const { port: p, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(300);
    w.rest('ch6');
    jest.advanceTimersByTime(300);
    expect(urls()).toEqual([]);
    jest.advanceTimersByTime(100);
    expect(urls()).toEqual(['ch6']);
  });

  it('the same URL is a no-op: neither the dwell nor the re-touch restarts', () => {
    const { port: p, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(300);
    w.rest('ch5');
    jest.advanceTimersByTime(100);
    expect(urls()).toEqual(['ch5']);
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS - 100);
    w.rest('ch5');
    jest.advanceTimersByTime(100);
    expect(urls()).toEqual(['ch5', 'ch5']);
  });

  it(`re-touches every ${PREWARM_RETOUCH_MS} ms from the touch's start while the same URL rests`, async () => {
    const { port: p, touches, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    expect(urls()).toEqual(['ch5']);
    touches[0].resolve();
    await flush();
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS - 1);
    expect(urls()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(urls()).toEqual(['ch5', 'ch5']);
    touches[1].resolve();
    await flush();
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS);
    expect(urls()).toEqual(['ch5', 'ch5', 'ch5']);
  });

  it(`aborts a touch still open after ${PREWARM_ABORT_MS} ms, and the re-touch still comes on time`, () => {
    const { port: p, touches, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    jest.advanceTimersByTime(PREWARM_ABORT_MS - 1);
    expect(touches[0].aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(touches[0].aborted).toBe(true);
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS - PREWARM_ABORT_MS);
    expect(urls()).toEqual(['ch5', 'ch5']);
  });

  it('rest(null) aborts the touch in flight and clears the re-touch; nothing fires afterwards', () => {
    const { port: p, touches, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    expect(touches[0].aborted).toBe(false);
    w.rest(null);
    expect(touches[0].aborted).toBe(true);
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS * 2);
    expect(urls()).toEqual(['ch5']);
    w.rest(null);                                        // idempotent
    expect(urls()).toEqual(['ch5']);
  });

  it('a move to another channel aborts the touch in flight and starts that channel\'s dwell', () => {
    const { port: p, touches, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    w.rest('ch6');
    expect(touches[0].aborted).toBe(true);
    jest.advanceTimersByTime(PREWARM_DWELL_MS - 1);
    expect(urls()).toEqual(['ch5']);
    jest.advanceTimersByTime(1);
    expect(urls()).toEqual(['ch5', 'ch6']);
  });

  it('a touch that rejects (a 404 on a 30 s cold start, a network error) changes nothing: the re-touch still comes', async () => {
    const { port: p, touches, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    touches[0].reject(new Error('404'));
    await flush();
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS);
    expect(urls()).toEqual(['ch5', 'ch5']);
  });

  it('dispose stops everything and forgets the resting URL', () => {
    const { port: p, urls } = port();
    const w = createPrewarmer(p);
    w.rest('ch5');
    w.dispose();
    jest.advanceTimersByTime(PREWARM_RETOUCH_MS);
    expect(urls()).toEqual([]);
    w.rest('ch5');                                        // a rest after dispose starts a fresh dwell
    jest.advanceTimersByTime(PREWARM_DWELL_MS);
    expect(urls()).toEqual(['ch5']);
  });
});
