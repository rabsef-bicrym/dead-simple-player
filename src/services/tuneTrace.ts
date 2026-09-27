/**
 * TUNE TRACE — on-device testimony (R28).
 *
 * A ring of the last MAX_TUNES tunes. Every row is routed to the tune that
 * owns it, never to whichever tune happens to be newest:
 *
 *   - `tuneId` (the id `traceTuneStart` returned) routes to that tune;
 *   - `g` (a surface generation bound with `traceBindGeneration`) routes to
 *     the tune of this launch the generation was bound under;
 *   - an untagged row (no tag, or `g` ≤ 0) goes to the newest tune of this
 *     launch;
 *   - a positive tag no tune knows is counted in `dropped`, never filed under
 *     the newest tune (H-L);
 *   - a row with no tune of this launch — none at all, or only revived ones —
 *     opens a synthetic UNTRACED START tune instead of being dropped (NP-10);
 *     nothing this process writes belongs to a previous one.
 *
 * What `g=` on a row means: the surface's generation when the row was
 * written. Only `replaceAsync start/resolve` and the retry's `playerError`
 * carry the generation of the item they describe (they were started for
 * it); `statusChange`, `playingChange`, `first timeUpdate` and
 * `onFirstFrameRender` are stamped with the generation current at arrival,
 * because the shared player's payloads name no item until WP-03 puts one in
 * the native envelope (ff-spec §7) — so an old item's late frame files under
 * the new tune, with the new g, and is told apart by `matched=no`. Item
 * identity on a native row is WP-03's `i=`.
 *
 * Reading a paste: a row for a tune that is not the newest is marked `late`;
 * a row arriving after a tune closed goes to its `after` bucket, so a tune's
 * `events` are the tune and nothing else. Native rows carry the host clock
 * (`nativeT`, ms) and print `(n+<ms>)` relative to the earliest host time
 * among the tune's native rows, `after` included — a judgment call (R52):
 * JS arrival can reorder native rows, and a row delivered after the close
 * may still be the tune's first native row; ff-spec §6.3 anchors n on the
 * first native row to *arrive* instead, which is the owner's to prefer.
 *
 * The ring persists (last MAX_TUNES) one second after a tune ends — first
 * frame, error, leaving; a superseded tune rides the next such write — and
 * on demand (`flushTuneTrace`, wired to the AppState background edge in the
 * root layout); every other mutation only marks the ring dirty for the next
 * write, and hydration schedules one only when such an ending is already
 * waiting on it — never for the tune that opened while the ring was being
 * read. That debounce is the only timer here: it writes storage, never
 * state, and nothing in the first-frame path waits on it (R1).
 *
 * Diagnostics, not telemetry — nothing leaves the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storage';

export interface TuneTraceEvent {
  /** Milliseconds since the owning tune started, JS arrival clock. */
  offsetMs: number;
  name: string;
  detail?: string;
  /** The surface generation current when the row was written (see the header). */
  g?: number;
  /** Host clock (ms) of a native row; `n` is derived from it at print time. */
  nativeT?: number;
  /** A native item id, when the row names one. */
  item?: string;
  /** The row arrived after a newer tune had started. */
  late?: boolean;
}

export type TuneTraceCloseReason = 'first-frame' | 'error-surfaced' | 'superseded' | 'left';
export type TuneTraceWitness = 'present' | 'absent' | 'n/a';

export interface TuneTrace {
  /** Unique across launches (ms epoch of the start, bumped past the last id). */
  id: number;
  channelName: string;
  startedAt: number;
  origin?: string;
  opening?: boolean;
  build?: string;
  witness?: TuneTraceWitness;
  /** Surface generations bound to this tune, in binding order. */
  gens: number[];
  events: TuneTraceEvent[];
  after: TuneTraceEvent[];
  /** Rows a full bucket did not keep; printed after the bucket, never silent. */
  truncated?: { events: number; after: number };
  closed?: { offsetMs: number; reason: TuneTraceCloseReason };
}

export interface TuneTraceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}

export interface TuneTraceTag {
  /** The id `traceTuneStart` returned; `null` is no tag, so a ref passes as it is. */
  tuneId?: number | null;
  g?: number;
  nativeT?: number;
  item?: string;
}

export const MAX_TUNES = 20;
export const MAX_EVENTS = 200;
export const MAX_AFTER = 60;
export const PERSIST_DEBOUNCE_MS = 1000;
const UNTRACED_START = 'UNTRACED START';

let now: () => number = Date.now;
let tunes: TuneTrace[] = [];
// Tunes opened in this launch. Surface generations restart at 1 every
// launch, so a generation routes only among these; a revived tune keeps its
// `gens` for the header and can never receive a live row by generation.
let launched = new WeakSet<TuneTrace>();
let lastId = 0;
let dropped = 0;
let build: string | undefined;
let storage: TuneTraceStorage | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistWanted = false;
// An ending (not a supersession) closed a tune and its write has not landed.
let closePending = false;

function nextId(): number {
  lastId = Math.max(now(), lastId + 1);
  return lastId;
}

function openTune(channelName: string, meta?: { origin?: string; opening?: boolean }): TuneTrace {
  const previous = tunes[0];
  if (previous && !previous.closed) closeTune(previous, 'superseded');
  const startedAt = now();
  const tune: TuneTrace = {
    id: nextId(),
    channelName,
    startedAt,
    origin: meta?.origin,
    opening: meta?.opening,
    build,
    gens: [],
    events: [],
    after: [],
  };
  tunes.unshift(tune);
  launched.add(tune);
  if (tunes.length > MAX_TUNES) tunes.length = MAX_TUNES;
  persistWanted = true;
  return tune;
}

function closeTune(tune: TuneTrace, reason: TuneTraceCloseReason): void {
  if (tune.closed) return;
  tune.closed = { offsetMs: Math.max(0, now() - tune.startedAt), reason };
  persistWanted = true;
  // A superseded close happens inside the next TUNE START; a write a second
  // later would land in that tune's first-frame window. It rides the next
  // ending's write, or the flush.
  if (reason === 'superseded') return;
  closePending = true;
  schedulePersist();
}

/** A generation that names something: `g` ≤ 0 is no tag (ff-spec §6.3). */
function taggedGeneration(tag?: TuneTraceTag): number | undefined {
  return tag?.g != null && tag.g > 0 ? tag.g : undefined;
}

/** The tune a tag names, or null when the tag names nothing the ring knows. */
function locate(tag?: TuneTraceTag): TuneTrace | null | undefined {
  if (tag?.tuneId != null) return tunes.find((tune) => tune.id === tag.tuneId) ?? null;
  const g = taggedGeneration(tag);
  if (g != null) return tunes.find((tune) => launched.has(tune) && tune.gens.includes(g)) ?? null;
  return undefined;
}

/**
 * The newest tune of this launch, or a synthetic UNTRACED START opened for
 * the row that had none. A revived tune is never it (see `launched`).
 */
function newestTune(): TuneTrace {
  const newest = tunes[0];
  if (newest && launched.has(newest)) return newest;
  const tune = openTune(UNTRACED_START, { origin: 'untraced' });
  tune.events.push({ offsetMs: 0, name: UNTRACED_START });
  return tune;
}

/** Start a tune. Closes the newest tune as superseded if it is still open. */
export function traceTuneStart(channelName: string, meta?: { origin?: string; opening?: boolean }): number {
  const tune = openTune(channelName, meta);
  tune.events.push({ offsetMs: 0, name: 'TUNE START', detail: channelName });
  return tune.id;
}

/** Bind a surface generation to this launch's newest tune (idempotent). */
export function traceBindGeneration(g: number): void {
  if (!(g > 0)) return;
  const tune = newestTune();
  if (!tune.gens.includes(g)) {
    tune.gens.push(g);
    persistWanted = true;
  }
}

export function traceEvent(name: string, detail?: string, tag?: TuneTraceTag): void {
  const located = locate(tag);
  if (located === null) {
    dropped += 1;
    return;
  }
  const tune = located ?? newestTune();
  const closed = tune.closed != null;
  const bucket = closed ? tune.after : tune.events;
  if (bucket.length >= (closed ? MAX_AFTER : MAX_EVENTS)) {
    // A full bucket still counts, so the paste reads "+N not kept", not silence.
    const truncated = tune.truncated ?? (tune.truncated = { events: 0, after: 0 });
    truncated[closed ? 'after' : 'events'] += 1;
    persistWanted = true;
    return;
  }
  const row: TuneTraceEvent = { offsetMs: Math.max(0, now() - tune.startedAt), name };
  if (detail !== undefined) row.detail = detail;
  const g = taggedGeneration(tag);
  if (g != null) row.g = g;
  if (tag?.nativeT != null) row.nativeT = tag.nativeT;
  if (tag?.item != null) row.item = tag.item;
  if (tune !== tunes[0]) row.late = true;
  bucket.push(row);
  persistWanted = true;
}

/** Record which witness the surface saw; the first sighting per tune stands. */
export function traceTuneWitness(witness: TuneTraceWitness, tag?: TuneTraceTag): void {
  const located = locate(tag);
  if (located === null) return;
  const tune = located ?? newestTune();
  if (tune.witness) return;
  tune.witness = witness;
  persistWanted = true;
}

export function traceCloseTune(tuneId: number, reason: TuneTraceCloseReason): void {
  const tune = tunes.find((candidate) => candidate.id === tuneId);
  if (tune) closeTune(tune, reason);
}

/** Stamp every tune started from now on with the app's build. */
export function setTuneTraceBuild(next: string | undefined): void {
  build = next;
}

/** Rows that carried a tag no tune knew; printed on the paste when non-zero. */
export function getTuneTraceDroppedCount(): number {
  return dropped;
}

/** A detached snapshot for the service panel; tracing never drives renders. */
export function getTuneTraceSnapshot(limit: number = MAX_TUNES): TuneTrace[] {
  return tunes.slice(0, limit).map((tune) => ({
    ...tune,
    gens: [...tune.gens],
    events: tune.events.map((event) => ({ ...event })),
    after: tune.after.map((event) => ({ ...event })),
    truncated: tune.truncated ? { ...tune.truncated } : undefined,
    closed: tune.closed ? { ...tune.closed } : undefined,
  }));
}

// ── Serialisation (the card and COPY print exactly this) ──

function formatRow(event: TuneTraceEvent, nativeT0: number | null): string {
  let line = `+${event.offsetMs}ms ${event.name}`;
  if (event.detail) line += ` ${event.detail}`;
  if (event.late) line += ' late';
  if (event.g != null) line += ` g=${event.g}`;
  if (event.item != null) line += ` i=${event.item}`;
  if (event.nativeT != null && nativeT0 != null) line += ` (n+${Math.round(event.nativeT - nativeT0)})`;
  return line;
}

/** The header's tail: everything after `TUNE <name>`. */
export function describeTuneTrace(tune: TuneTrace): string {
  let meta = `@ ${new Date(tune.startedAt).toISOString()}`;
  if (tune.origin) meta += ` origin=${tune.origin}`;
  if (tune.opening != null) meta += ` opening=${tune.opening ? 'yes' : 'no'}`;
  if (tune.build) meta += ` build=${tune.build}`;
  if (tune.witness) meta += ` witness=${tune.witness}`;
  if (tune.gens.length) meta += ` gens=[${tune.gens.join(',')}]`;
  return meta;
}

function describeNotKept(count: number): string {
  return `-- +${count} rows not kept --`;
}

/** The rows, the closed marker, then the after bucket — no indentation. */
export function serializeTuneTraceRows(tune: TuneTrace): string[] {
  const nativeRows = [...tune.events, ...tune.after].filter((event) => event.nativeT != null);
  const nativeT0 = nativeRows.length
    ? Math.min(...nativeRows.map((event) => event.nativeT as number))
    : null;
  const lines = tune.events.map((event) => formatRow(event, nativeT0));
  if (tune.truncated?.events) lines.push(describeNotKept(tune.truncated.events));
  if (tune.closed) {
    lines.push(`-- closed: ${tune.closed.reason} @ +${tune.closed.offsetMs}ms --`);
    lines.push(...tune.after.map((event) => formatRow(event, nativeT0)));
    if (tune.truncated?.after) lines.push(describeNotKept(tune.truncated.after));
  }
  return lines;
}

export function serializeTuneTrace(tune: TuneTrace): string {
  return [
    `TUNE ${tune.channelName} ${describeTuneTrace(tune)}`,
    ...serializeTuneTraceRows(tune).map((line) => `  ${line}`),
  ].join('\n');
}

/** The line above the tunes when rows were dropped; the card and COPY print exactly this. */
export function describeTuneTraceDropped(count: number): string {
  return `-- dropped: ${count} rows carried a tag no tune knows --`;
}

export function serializeTuneTraces(traces: TuneTrace[], droppedCount = 0): string {
  const blocks = traces.map(serializeTuneTrace);
  if (droppedCount > 0) blocks.unshift(describeTuneTraceDropped(droppedCount));
  return blocks.join('\n\n');
}

// ── Persistence ──

/** Callers mark the ring dirty themselves; this only sets the clock. */
function schedulePersist(): void {
  if (!storage) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

async function persistNow(): Promise<void> {
  if (!storage || !persistWanted) return;
  persistWanted = false;
  closePending = false;
  try {
    await storage.setItem(STORAGE_KEYS.TUNE_TRACE, JSON.stringify(tunes));
  } catch {
    // A failed write costs a paste, never a picture.
  }
}

/** Write the ring now (the AppState background edge). */
export function flushTuneTrace(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  return persistNow();
}

const CLOSE_REASONS: readonly TuneTraceCloseReason[] = ['first-frame', 'error-surfaced', 'superseded', 'left'];

function isCloseReason(value: unknown): value is TuneTraceCloseReason {
  return (CLOSE_REASONS as readonly unknown[]).includes(value);
}

function isRow(value: unknown): value is TuneTraceEvent {
  return typeof value === 'object' && value !== null
    && typeof (value as TuneTraceEvent).offsetMs === 'number'
    && typeof (value as TuneTraceEvent).name === 'string';
}

function reviveTune(value: unknown): TuneTrace | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<TuneTrace>;
  if (typeof raw.id !== 'number' || typeof raw.startedAt !== 'number' || typeof raw.channelName !== 'string') return null;
  const events = Array.isArray(raw.events) ? raw.events.filter(isRow) : [];
  const after = Array.isArray(raw.after) ? raw.after.filter(isRow) : [];
  const tune: TuneTrace = {
    id: raw.id,
    channelName: raw.channelName,
    startedAt: raw.startedAt,
    origin: typeof raw.origin === 'string' ? raw.origin : undefined,
    opening: typeof raw.opening === 'boolean' ? raw.opening : undefined,
    build: typeof raw.build === 'string' ? raw.build : undefined,
    witness: raw.witness === 'present' || raw.witness === 'absent' || raw.witness === 'n/a' ? raw.witness : undefined,
    gens: Array.isArray(raw.gens) ? raw.gens.filter((g): g is number => typeof g === 'number') : [],
    events,
    after,
  };
  if (raw.truncated && typeof raw.truncated.events === 'number' && typeof raw.truncated.after === 'number') {
    tune.truncated = { events: raw.truncated.events, after: raw.truncated.after };
  }
  if (raw.closed && typeof raw.closed.offsetMs === 'number' && isCloseReason(raw.closed.reason)) {
    tune.closed = { offsetMs: raw.closed.offsetMs, reason: raw.closed.reason };
  } else {
    // The app went away with this tune open; the record ends where its rows end.
    const last = events[events.length - 1];
    tune.closed = { offsetMs: last?.offsetMs ?? 0, reason: 'left' };
  }
  return tune;
}

/**
 * Read the persisted ring and merge it under this launch's tunes (by id, no
 * duplicates); install persistence. Tunes started before this resolves are
 * kept and stay newest.
 */
export async function hydrateTuneTrace(store: TuneTraceStorage = AsyncStorage): Promise<void> {
  let persisted: TuneTrace[] = [];
  try {
    const raw = await store.getItem(STORAGE_KEYS.TUNE_TRACE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      persisted = parsed.map(reviveTune).filter((tune): tune is TuneTrace => tune !== null);
    }
  } catch {
    persisted = [];
  }
  const known = new Set(tunes.map((tune) => tune.id));
  for (const tune of persisted) {
    if (known.has(tune.id)) continue;
    known.add(tune.id);
    tunes.push(tune);
    lastId = Math.max(lastId, tune.id);
  }
  if (tunes.length > MAX_TUNES) tunes.length = MAX_TUNES;
  storage = store;
  // An ending that closed before the read finished is waiting on this. An
  // open tune is not: on the console the power tune opens while the ring is
  // read, and a write a second later would land inside its own first-frame
  // window; its ending schedules one.
  if (closePending) schedulePersist();
}

/** Tests only: a fresh ring, an injected clock, no storage. */
export function __resetTuneTraceForTests(clock: () => number = Date.now): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  persistWanted = false;
  closePending = false;
  storage = null;
  tunes = [];
  launched = new WeakSet();
  lastId = 0;
  dropped = 0;
  build = undefined;
  now = clock;
}
