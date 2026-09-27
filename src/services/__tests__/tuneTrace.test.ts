import { STORAGE_KEYS } from '../../constants/storage';
import {
  MAX_AFTER,
  MAX_EVENTS,
  MAX_TUNES,
  PERSIST_DEBOUNCE_MS,
  __resetTuneTraceForTests,
  describeTuneTrace,
  describeTuneTraceDropped,
  flushTuneTrace,
  getTuneTraceDroppedCount,
  getTuneTraceSnapshot,
  hydrateTuneTrace,
  serializeTuneTrace,
  serializeTuneTraceRows,
  serializeTuneTraces,
  setTuneTraceBuild,
  traceBindGeneration,
  traceCloseTune,
  traceEvent,
  traceTuneStart,
  traceTuneWitness,
  type TuneTraceStorage,
} from '../tuneTrace';

/** A clock the tests wind by hand; every id and offset descends from it. */
function makeClock(start: number) {
  let t = start;
  return {
    now: () => t,
    set: (next: number) => { t = next; },
    advance: (ms: number) => { t += ms; },
  };
}

function memoryStorage(initial: Record<string, string> = {}): TuneTraceStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

const T0 = Date.parse('2026-09-27T04:27:15.472Z');

describe('tuneTrace routing', () => {
  let clock: ReturnType<typeof makeClock>;
  beforeEach(() => {
    clock = makeClock(T0);
    __resetTuneTraceForTests(clock.now);
  });

  it('(a) a superseded generation\'s resolve lands under its own tune, late, after the close', () => {
    const id1 = traceTuneStart('Oddities', { origin: 'remote', opening: true });
    clock.advance(20);
    traceBindGeneration(1);
    traceEvent('replaceAsync start', 'http://a/5.m3u8', { g: 1 });
    clock.advance(400);
    const id2 = traceTuneStart('Music', { origin: 'remote', opening: false });
    clock.advance(20);
    traceBindGeneration(2);
    clock.advance(700);
    traceEvent('replaceAsync resolve', 'http://a/5.m3u8', { g: 1 });
    traceEvent('replaceAsync start', 'http://a/6.m3u8', { g: 2 });

    const [tune2, tune1] = getTuneTraceSnapshot();
    expect(tune1.id).toBe(id1);
    expect(tune2.id).toBe(id2);
    expect(tune1.closed).toEqual({ offsetMs: 420, reason: 'superseded' });
    expect(tune1.events.map((e) => e.name)).toEqual(['TUNE START', 'replaceAsync start']);
    expect(tune1.after).toEqual([
      { offsetMs: 1140, name: 'replaceAsync resolve', detail: 'http://a/5.m3u8', g: 1, late: true },
    ]);
    expect(tune2.events.map((e) => e.name)).toEqual(['TUNE START', 'replaceAsync start']);
    expect(tune2.events[1].late).toBeUndefined();
    expect(serializeTuneTrace(tune1)).toBe([
      'TUNE Oddities @ 2026-09-27T04:27:15.472Z origin=remote opening=yes gens=[1]',
      '  +0ms TUNE START Oddities',
      '  +20ms replaceAsync start http://a/5.m3u8 g=1',
      '  -- closed: superseded @ +420ms --',
      '  +1140ms replaceAsync resolve http://a/5.m3u8 late g=1',
    ].join('\n'));
  });

  it('(a\') a tuneId routes to its own tune and is not reprinted on the row', () => {
    const id1 = traceTuneStart('Oddities');
    clock.advance(100);
    traceTuneStart('Music');
    clock.advance(100);
    traceEvent('sourceReady set', undefined, { tuneId: id1 });
    const [tune2, tune1] = getTuneTraceSnapshot();
    expect(tune1.after).toEqual([{ offsetMs: 200, name: 'sourceReady set', late: true }]);
    expect(tune2.events).toHaveLength(1);
    expect(serializeTuneTrace(tune1)).toContain('  +200ms sourceReady set late');
    expect(serializeTuneTrace(tune1)).not.toContain('tuneId');
  });

  it('(a\'\') a generation of 0 or less is no tag: the row goes to the newest tune and prints no g=', () => {
    traceTuneStart('Oddities');
    traceBindGeneration(1);
    clock.advance(100);
    traceTuneStart('Music');
    clock.advance(5);
    // The surface's listeners after its cleanup, and native rows before any expectation.
    traceEvent('statusChange', 'idle', { g: 0 });
    traceEvent('N attach', 'rate=0', { g: -1, nativeT: 100 });
    const [tune2, tune1] = getTuneTraceSnapshot();
    expect(tune2.events.slice(1)).toEqual([
      { offsetMs: 5, name: 'statusChange', detail: 'idle' },
      { offsetMs: 5, name: 'N attach', detail: 'rate=0', nativeT: 100 },
    ]);
    expect(tune1.after).toEqual([]);
    expect(serializeTuneTrace(tune2)).not.toContain('g=');
    expect(getTuneTraceDroppedCount()).toBe(0);
  });

  it('(b) a row before any tune opens an UNTRACED START tune instead of vanishing', () => {
    traceEvent('sourceReady set');
    clock.advance(5);
    traceEvent('static unmount', 'tuning cleared');
    const [tune] = getTuneTraceSnapshot();
    expect(tune.channelName).toBe('UNTRACED START');
    expect(tune.origin).toBe('untraced');
    expect(tune.events.map((e) => e.name)).toEqual(['UNTRACED START', 'sourceReady set', 'static unmount']);
    expect(getTuneTraceSnapshot()).toHaveLength(1);
  });

  it('(b\') binding a generation with no tune opens the synthetic tune and binds it', () => {
    traceBindGeneration(7);
    traceEvent('replaceAsync start', 'http://a/1.m3u8', { g: 7 });
    const [tune] = getTuneTraceSnapshot();
    expect(tune.channelName).toBe('UNTRACED START');
    expect(tune.gens).toEqual([7]);
    expect(tune.events[1]).toMatchObject({ name: 'replaceAsync start', g: 7 });
  });

  it('(c) rows after close go to `after`, capped, and the cap is printed', () => {
    const id = traceTuneStart('Movies');
    clock.advance(1200);
    traceEvent('sourceReady set', undefined, { tuneId: id });
    traceCloseTune(id, 'first-frame');
    traceCloseTune(id, 'left');
    for (let i = 0; i < MAX_AFTER + 10; i += 1) {
      clock.advance(1);
      traceEvent('playingChange', String(i % 2 === 0));
    }
    const [tune] = getTuneTraceSnapshot();
    expect(tune.closed).toEqual({ offsetMs: 1200, reason: 'first-frame' });
    expect(tune.events.map((e) => e.name)).toEqual(['TUNE START', 'sourceReady set']);
    expect(tune.after).toHaveLength(MAX_AFTER);
    expect(tune.after[0]).toEqual({ offsetMs: 1201, name: 'playingChange', detail: 'true' });
    expect(tune.after[0].late).toBeUndefined();
    expect(tune.truncated).toEqual({ events: 0, after: 10 });
    const lines = serializeTuneTraceRows(tune);
    expect(lines).toHaveLength(2 + 1 + MAX_AFTER + 1);
    expect(lines[lines.length - 1]).toBe('-- +10 rows not kept --');
  });

  it('(c\') events are capped too, and the cap sits before the closed marker', () => {
    const id = traceTuneStart('Movies');
    for (let i = 0; i < MAX_EVENTS + 10; i += 1) traceEvent('statusChange', 'loading');
    traceCloseTune(id, 'left');
    const [tune] = getTuneTraceSnapshot();
    expect(tune.events).toHaveLength(MAX_EVENTS);
    // TUNE START holds one slot, so 1 + (MAX_EVENTS + 10) rows leave 11 out.
    expect(tune.truncated).toEqual({ events: 11, after: 0 });
    expect(serializeTuneTraceRows(tune).slice(MAX_EVENTS)).toEqual([
      '-- +11 rows not kept --',
      '-- closed: left @ +0ms --',
    ]);
  });

  it('(c\'\') a tune with room prints no cap line', () => {
    traceTuneStart('Movies');
    traceEvent('statusChange', 'loading');
    const [tune] = getTuneTraceSnapshot();
    expect(tune.truncated).toBeUndefined();
    expect(serializeTuneTrace(tune)).not.toContain('not kept');
  });

  it('(d) the ring holds MAX_TUNES, newest first', () => {
    const ids: number[] = [];
    for (let i = 0; i < MAX_TUNES + 5; i += 1) {
      clock.advance(1000);
      ids.push(traceTuneStart(`CHANNEL ${i + 1}`));
    }
    const snapshot = getTuneTraceSnapshot();
    expect(snapshot).toHaveLength(MAX_TUNES);
    expect(snapshot[0].channelName).toBe(`CHANNEL ${MAX_TUNES + 5}`);
    expect(snapshot[MAX_TUNES - 1].channelName).toBe('CHANNEL 6');
    expect(new Set(ids).size).toBe(ids.length);
    // Every tune but the newest was superseded by the next.
    expect(snapshot.slice(1).every((t) => t.closed?.reason === 'superseded')).toBe(true);
    expect(snapshot[0].closed).toBeUndefined();
  });

  it('(d\') an evicted tune\'s row is counted as dropped, never filed under the newest tune', () => {
    const first = traceTuneStart('CHANNEL 1');
    traceBindGeneration(1);
    for (let i = 0; i < MAX_TUNES; i += 1) {
      clock.advance(1000);
      traceTuneStart(`CHANNEL ${i + 2}`);
    }
    traceEvent('replaceAsync resolve', 'x', { tuneId: first });
    traceEvent('statusChange', 'idle', { g: 1 });
    traceEvent('statusChange', 'idle', { g: 999 });
    expect(getTuneTraceDroppedCount()).toBe(3);
    expect(getTuneTraceSnapshot()[0].events).toHaveLength(1);
    expect(describeTuneTraceDropped(3)).toBe('-- dropped: 3 rows carried a tag no tune knows --');
    expect(serializeTuneTraces(getTuneTraceSnapshot(1), getTuneTraceDroppedCount()))
      .toMatch(/^-- dropped: 3 rows carried a tag no tune knows --\n\nTUNE CHANNEL 21/);
  });

  it('(e) native rows print n relative to the tune\'s first native row', () => {
    traceTuneStart('Ghibli');
    traceBindGeneration(3);
    clock.advance(70);
    traceEvent('N item', 'status=unknown', { g: 3, nativeT: 5000.4, item: 'I1' });
    clock.advance(30);
    traceEvent('N tcs', 'waiting reason=toMinimizeStalls', { g: 3, nativeT: 5123.7, item: 'I1' });
    clock.advance(10);
    // JS arrival may reorder native rows; n still comes from the earliest host time.
    traceEvent('N attach', 'rate=0', { g: 3, nativeT: 4990.0 });
    traceEvent('statusChange', 'loading', { g: 3 });
    const [tune] = getTuneTraceSnapshot();
    expect(tune.events.slice(1).map((e) => e.nativeT)).toEqual([5000.4, 5123.7, 4990, undefined]);
    expect(serializeTuneTrace(tune).split('\n').slice(2)).toEqual([
      '  +70ms N item status=unknown g=3 i=I1 (n+10)',
      '  +100ms N tcs waiting reason=toMinimizeStalls g=3 i=I1 (n+134)',
      '  +110ms N attach rate=0 g=3 (n+0)',
      '  +110ms statusChange loading g=3',
    ]);
  });

  it('binding is idempotent and the header lists every generation once', () => {
    traceTuneStart('Television', { origin: 'swipe', opening: false });
    traceBindGeneration(4);
    traceBindGeneration(4);
    traceBindGeneration(5);
    traceBindGeneration(0);
    expect(getTuneTraceSnapshot()[0].gens).toEqual([4, 5]);
    expect(describeTuneTrace(getTuneTraceSnapshot()[0]))
      .toBe('@ 2026-09-27T04:27:15.472Z origin=swipe opening=no gens=[4,5]');
  });

  it('the witness is recorded once per tune and printed in the header', () => {
    setTuneTraceBuild('1.0.0 (20)');
    const id = traceTuneStart('Oddities', { origin: 'power', opening: true });
    traceBindGeneration(1);
    traceTuneWitness('absent', { g: 1 });
    traceTuneWitness('present', { g: 1 });
    traceTuneWitness('present', { tuneId: id });
    expect(getTuneTraceSnapshot()[0].witness).toBe('absent');
    expect(serializeTuneTrace(getTuneTraceSnapshot()[0]).split('\n')[0])
      .toBe('TUNE Oddities @ 2026-09-27T04:27:15.472Z origin=power opening=yes build=1.0.0 (20) witness=absent gens=[1]');
    traceTuneWitness('present', { g: 42 });
    expect(getTuneTraceDroppedCount()).toBe(0);
  });

  it('the snapshot is detached and honours its limit', () => {
    for (let i = 0; i < 7; i += 1) {
      clock.advance(10);
      traceTuneStart(`CHANNEL ${i + 1}`);
    }
    const five = getTuneTraceSnapshot(5);
    expect(five).toHaveLength(5);
    five[0].events.push({ offsetMs: 1, name: 'tamper' });
    five[0].gens.push(99);
    expect(getTuneTraceSnapshot()[0].events).toHaveLength(1);
    expect(getTuneTraceSnapshot()[0].gens).toEqual([]);
    expect(getTuneTraceSnapshot()).toHaveLength(7);
  });

  it('closing an unknown id is a no-op', () => {
    traceTuneStart('Movies');
    traceCloseTune(12345, 'left');
    expect(getTuneTraceSnapshot()[0].closed).toBeUndefined();
  });
});

describe('tuneTrace persistence', () => {
  let clock: ReturnType<typeof makeClock>;
  beforeEach(() => {
    jest.useFakeTimers();
    clock = makeClock(T0);
    __resetTuneTraceForTests(clock.now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes one second after a close, once, and at once on flush', async () => {
    const storage = memoryStorage();
    await hydrateTuneTrace(storage);
    expect(storage.setItem).not.toHaveBeenCalled();

    const id = traceTuneStart('Movies');
    clock.advance(900);
    traceCloseTune(id, 'first-frame');
    expect(storage.setItem).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS - 1);
    expect(storage.setItem).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.TUNE_TRACE, expect.any(String));
    const written = JSON.parse(storage.values.get(STORAGE_KEYS.TUNE_TRACE) as string);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ id, channelName: 'Movies', closed: { offsetMs: 900, reason: 'first-frame' } });

    // Nothing new: a flush writes nothing.
    await flushTuneTrace();
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    // A new open tune, then the background edge: written at once, timer cancelled.
    clock.advance(100);
    traceTuneStart('Music');
    await flushTuneTrace();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('a superseded close schedules no write; the next ending\'s write carries both tunes', async () => {
    const storage = memoryStorage();
    await hydrateTuneTrace(storage);
    traceTuneStart('Movies');
    clock.advance(300);
    // The surf: Movies is superseded inside Music's TUNE START. No write
    // lands a second later, inside Music's first-frame window.
    const music = traceTuneStart('Music');
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(storage.setItem).not.toHaveBeenCalled();

    clock.advance(900);
    traceCloseTune(music, 'first-frame');
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const written = JSON.parse(storage.values.get(STORAGE_KEYS.TUNE_TRACE) as string);
    expect(written.map((t: { channelName: string; closed: { reason: string } }) => [t.channelName, t.closed.reason]))
      .toEqual([['Music', 'first-frame'], ['Movies', 'superseded']]);
  });

  it('(f) hydrate merges under this launch\'s tunes, by id, without duplicates; twice is the same', async () => {
    // A previous launch left two tunes, the newer one still open.
    const older = { id: T0 - 60000, channelName: 'Ghibli', startedAt: T0 - 60000, gens: [3], events: [{ offsetMs: 0, name: 'TUNE START', detail: 'Ghibli' }, { offsetMs: 800, name: 'sourceReady set' }], after: [], truncated: { events: 0, after: 3 }, closed: { offsetMs: 800, reason: 'first-frame' } };
    const open = { id: T0 - 30000, channelName: 'Movies', startedAt: T0 - 30000, gens: [4], events: [{ offsetMs: 0, name: 'TUNE START', detail: 'Movies' }, { offsetMs: 90, name: 'replaceAsync start', detail: 'x', g: 4 }], after: [] };
    const storage = memoryStorage({ [STORAGE_KEYS.TUNE_TRACE]: JSON.stringify([open, older, { junk: true }, null]) });

    // The console powered on before hydration finished.
    const live = traceTuneStart('Oddities', { origin: 'power', opening: true });
    await hydrateTuneTrace(storage);
    let snapshot = getTuneTraceSnapshot();
    expect(snapshot.map((t) => t.channelName)).toEqual(['Oddities', 'Movies', 'Ghibli']);
    expect(snapshot[0].id).toBe(live);
    expect(snapshot[1].closed).toEqual({ offsetMs: 90, reason: 'left' });
    expect(snapshot[2].closed).toEqual({ offsetMs: 800, reason: 'first-frame' });
    expect(snapshot[2].truncated).toEqual({ events: 0, after: 3 });
    expect(serializeTuneTraceRows(snapshot[2]).slice(-1)).toEqual(['-- +3 rows not kept --']);

    // Generations restart every launch: a live row wearing a revived tune's
    // number is dropped, never filed under Movies; the header still prints it.
    traceEvent('statusChange', 'idle', { g: 4 });
    expect(getTuneTraceDroppedCount()).toBe(1);
    expect(getTuneTraceSnapshot()[1].after).toEqual([]);
    expect(describeTuneTrace(getTuneTraceSnapshot()[1])).toContain('gens=[4]');

    await hydrateTuneTrace(storage);
    snapshot = getTuneTraceSnapshot();
    expect(snapshot).toHaveLength(3);
    expect(new Set(snapshot.map((t) => t.id)).size).toBe(3);

    // Ids keep climbing past everything persisted, whatever the clock says.
    clock.set(T0 - 120000);
    const next = traceTuneStart('Music');
    expect(next).toBeGreaterThan(live);
    expect(getTuneTraceSnapshot().map((t) => t.channelName)).toEqual(['Music', 'Oddities', 'Movies', 'Ghibli']);

    // A round trip through storage reproduces the ring on the next launch.
    await flushTuneTrace();
    const written = storage.values.get(STORAGE_KEYS.TUNE_TRACE) as string;
    __resetTuneTraceForTests(clock.now);
    await hydrateTuneTrace(memoryStorage({ [STORAGE_KEYS.TUNE_TRACE]: written }));
    expect(getTuneTraceSnapshot().map((t) => t.channelName)).toEqual(['Music', 'Oddities', 'Movies', 'Ghibli']);
    expect(getTuneTraceSnapshot()[0].closed).toEqual({ offsetMs: 0, reason: 'left' });
    expect(getTuneTraceSnapshot()[1].closed).toEqual({ offsetMs: 0, reason: 'superseded' });
  });

  it('a write before hydration waits for it, so the persisted ring is never clobbered', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.TUNE_TRACE]: JSON.stringify([{ id: T0 - 5000, channelName: 'Ghibli', startedAt: T0 - 5000, gens: [], events: [{ offsetMs: 0, name: 'TUNE START', detail: 'Ghibli' }], after: [], closed: { offsetMs: 1, reason: 'first-frame' } }]) });
    const id = traceTuneStart('Movies');
    traceCloseTune(id, 'first-frame');
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(storage.setItem).not.toHaveBeenCalled();
    await hydrateTuneTrace(storage);
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const written = JSON.parse(storage.values.get(STORAGE_KEYS.TUNE_TRACE) as string);
    expect(written.map((t: { channelName: string }) => t.channelName)).toEqual(['Movies', 'Ghibli']);
  });

  it('a broken store neither throws nor loses the ring', async () => {
    const broken: TuneTraceStorage = {
      getItem: async () => '{not json',
      setItem: async () => { throw new Error('disk full'); },
    };
    const id = traceTuneStart('Movies');
    await expect(hydrateTuneTrace(broken)).resolves.toBeUndefined();
    traceCloseTune(id, 'left');
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    await expect(flushTuneTrace()).resolves.toBeUndefined();
    expect(getTuneTraceSnapshot()).toHaveLength(1);
  });
});

describe('tuneTrace serialisation', () => {
  it('(g) replays the build-19 paste byte for byte', () => {
    const clock = makeClock(T0);
    __resetTuneTraceForTests(clock.now);
    const uri = 'http://100.85.152.35:8409/iptv/channel/5.m3u8?mode=segmenter';
    const paste = [
      'TUNE Oddities @ 2026-09-27T04:27:15.472Z',
      '  +0ms TUNE START Oddities',
      `  +68ms replaceAsync start ${uri}`,
      '  +76ms statusChange loading',
      `  +1159ms replaceAsync resolve ${uri}`,
      '  +1178ms statusChange idle',
      `  +1179ms first timeUpdate 0.000s · ${uri}`,
      '  +1183ms statusChange loading',
      `  +1276ms onFirstFrameRender sourceUri=${uri} · matched=yes`,
      '  +1276ms sourceReady set',
      '  +1281ms static unmount tuning cleared',
    ].join('\n');

    traceTuneStart('Oddities');
    const replay: Array<[number, string, string | undefined]> = [
      [68, 'replaceAsync start', uri],
      [76, 'statusChange', 'loading'],
      [1159, 'replaceAsync resolve', uri],
      [1178, 'statusChange', 'idle'],
      [1179, 'first timeUpdate', `0.000s · ${uri}`],
      [1183, 'statusChange', 'loading'],
      [1276, 'onFirstFrameRender', `sourceUri=${uri} · matched=yes`],
      [1276, 'sourceReady set', undefined],
      [1281, 'static unmount', 'tuning cleared'],
    ];
    for (const [offset, name, detail] of replay) {
      clock.set(T0 + offset);
      traceEvent(name, detail);
    }
    expect(serializeTuneTraces(getTuneTraceSnapshot())).toBe(paste);
  });

  it('separates tunes with a blank line, newest first', () => {
    const clock = makeClock(T0);
    __resetTuneTraceForTests(clock.now);
    traceTuneStart('A');
    clock.advance(1000);
    traceTuneStart('B');
    const text = serializeTuneTraces(getTuneTraceSnapshot());
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text.startsWith('TUNE B @ 2026-09-27T04:27:16.472Z')).toBe(true);
    expect(text).toContain('TUNE A @ 2026-09-27T04:27:15.472Z\n  +0ms TUNE START A\n  -- closed: superseded @ +1000ms --');
  });
});
