import * as fs from 'fs';
import * as path from 'path';
import { CURSOR_HOME, ROWS_DS6, ROWS_DS8M, pageScroll, stepCursor, wrapIndex } from '../board';
import type { Command } from '../commands';
import {
  CABINETS,
  CABINET_NAMES,
  DECISIONS,
  DIAL_ROWS,
  INPUT_ROWS,
  INVARIANTS,
  KEY_ROWS,
  MODES,
  MODE_NAMES,
  REACHABLE,
  STATION_ROWS,
  UNREACHABLE,
  allTags,
  decisionOf,
  surfacesToday,
  type InputRow,
  type MatrixEvent,
  type Scene,
  type StationRow,
} from '../matrix';
import { REMOTE_KEYS, SWIPE_THRESHOLD, keyToCommand, mediaSessionToCommand, stepIndex, swipeToCommand } from '../remote';
import { sameChannelArrival, sameChannelArrivalRuled16, stopAccepted, type ArrivalScene } from '../transitions';

const withCabinet = (row: InputRow): [string, InputRow] => [row.id, row];

function answer(row: InputRow): Command | null {
  const cabinet = CABINETS[row.cabinet];
  if ('key' in row.input) return keyToCommand(row.mode, row.input.key, cabinet);
  if ('swipe' in row.input) return swipeToCommand(row.mode, row.input.swipe, cabinet);
  return mediaSessionToCommand(row.mode, row.input.media);
}

describe('the net is well-formed', () => {
  it('cites a decision in 04-decisions.md for every ruled: tag', () => {
    for (const tag of allTags()) {
      expect(tag).toMatch(/^(asis|ruled:\d+|fix:[A-Z]{2}-\d{2})$/);
      const n = decisionOf(tag);
      if (n !== null) expect(DECISIONS[n]).toBeDefined();
    }
    expect(Object.keys(DECISIONS)).toHaveLength(18);
  });

  it('mirrors the numbering of 04-decisions.md when the reviews tree is reachable (DSP_REVIEWS_DIR)', () => {
    const dir = process.env.DSP_REVIEWS_DIR;
    if (!dir) return; // the tree lives outside the repo; the mirror is dated in matrix.ts
    const text = fs.readFileSync(path.join(dir, '04-decisions.md'), 'utf8');
    const numbered = [...text.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbered).toEqual(Object.keys(DECISIONS).map(Number));
  });

  it('records today’s outcome on every row a decision or a fix changes', () => {
    for (const row of [...INPUT_ROWS, ...STATION_ROWS]) {
      if (row.tag === 'asis') expect(row.today).toBeUndefined();
      else expect(row.today).toBeDefined();
    }
  });

  it('gives every row a unique id and a cite', () => {
    const ids = [...INPUT_ROWS, ...DIAL_ROWS, ...STATION_ROWS, ...REACHABLE, ...UNREACHABLE].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of [...INPUT_ROWS, ...DIAL_ROWS, ...STATION_ROWS, ...UNREACHABLE]) expect(row.cite.length).toBeGreaterThan(0);
  });

  it('covers every mode × cabinet × remote key', () => {
    for (const mode of MODE_NAMES) {
      for (const cabinet of CABINET_NAMES) {
        for (const key of REMOTE_KEYS) {
          expect(KEY_ROWS.find((r) => r.id === `K-${mode}-${cabinet}-${key}`)).toBeDefined();
        }
      }
    }
  });

  it('numbers the fifteen invariants', () => {
    expect(INVARIANTS.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe('the key table (watch.tsx:914-1023; rulings table 1.3)', () => {
  it.each(KEY_ROWS.map(withCabinet))('%s', (_id, row) => {
    expect(answer(row)).toEqual(row.today ?? row.expect);
  });
});

describe('the gesture table (watch.tsx:737-821)', () => {
  it.each(INPUT_ROWS.filter((r) => 'swipe' in r.input).map(withCabinet))('%s', (_id, row) => {
    expect(answer(row)).toEqual(row.today ?? row.expect);
  });

  it('flips exactly the two portrait-board rows under decision 11', () => {
    const ruled = INPUT_ROWS.filter((r) => r.tag === 'ruled:11');
    expect(ruled.map((r) => r.id).sort()).toEqual(['G-phoneP-board-D', 'G-phoneP-board-U']);
    for (const row of ruled) {
      expect(row.today).not.toEqual(row.expect);
      expect(row.expect?.type).toBe('BOARD_PAGE');
    }
  });
});

describe('the lock-screen keys (watch.tsx:1059-1066)', () => {
  it.each(INPUT_ROWS.filter((r) => 'media' in r.input).map(withCabinet))('%s', (_id, row) => {
    expect(answer(row)).toEqual(row.today ?? row.expect);
  });
});

describe('dial ends by input site (decision 9)', () => {
  it.each(DIAL_ROWS.map((r) => [r.id, r] as const))('%s', (_id, row) => {
    expect(stepIndex(row.i, row.dir, row.n, row.origin)).toBe(row.expect);
  });
});

// ── Station rows a pure helper can answer today ──

function arrival(given: Scene, event: MatrixEvent | null): ArrivalScene {
  if (!event) throw new Error('not an arrival: a sequence');
  if (event.type !== 'TUNE' && event.type !== 'LINK') throw new Error(`not an arrival: ${event.type}`);
  const picture = given.picture ?? 'live';
  return {
    playbackActive: given.base === 'watching',
    sameIndex: event.index === (given.index ?? 3),
    tuning: picture.startsWith('static'),
    sourceReady: picture.startsWith('live'),
    playerError: picture.endsWith('-error') ? 'error' : null,
    origin: event.type === 'LINK' ? 'link' : event.origin,
  };
}

/** One event, or null for a sequence (the reducer's, WP-07). */
const single = (row: StationRow): MatrixEvent | null => (Array.isArray(row.event) ? null : row.event);

describe('gap §4 — a same-channel arrival by picture state × origin', () => {
  const asis = STATION_ROWS.filter((r) => r.section === 'gap §4 same-channel arrival' && r.tag === 'asis');
  const ruled = STATION_ROWS.filter((r) => r.section === 'gap §4 same-channel arrival' && r.tag === 'ruled:16');

  it('has the 4 × 6 matrix and its four ruled siblings', () => {
    expect(asis).toHaveLength(24);
    expect(ruled).toHaveLength(4);
  });

  it.each(asis.map((r) => [r.id, r] as const))('%s (today)', (_id, row) => {
    const result = sameChannelArrival(arrival(row.given, single(row)));
    expect(result.kind).toBe(row.expect.retune ? 'full-tune' : 'chrome-only');
    expect(result.flash).toBe(row.expect.flash);
  });

  it.each(ruled.map((r) => [r.id, r] as const))('%s (today vs. decision 16)', (_id, row) => {
    const s = arrival(row.given, single(row));
    expect(sameChannelArrival(s).kind).toBe(row.today?.retune ? 'full-tune' : 'chrome-only');
    expect(sameChannelArrivalRuled16(s).kind).toBe(row.expect.retune ? 'full-tune' : 'chrome-only');
  });
});

describe('board arithmetic rows (WS-08)', () => {
  const rows = STATION_ROWS.filter((r) => r.section === 'board arithmetic' || r.section === 'dial');

  it.each(rows.map((r) => [r.id, r] as const))('%s', (_id, row) => {
    const event = single(row);
    if (!event) return; // a sequence: the reducer's (WP-07)
    const g = row.given;
    const console = (g.cabinet ?? 'console') === 'console';
    const rowsToday = ROWS_DS6;
    const rowsRuled = console ? ROWS_DS6 : ROWS_DS8M;
    switch (event.type) {
      case 'BOARD_CURSOR': {
        const today = stepCursor(g.cursor ?? CURSOR_HOME, g.scroll ?? 0, event.dir, rowsToday);
        expect(today).toEqual({ cursor: (row.today ?? row.expect).cursor, scroll: (row.today ?? row.expect).scroll });
        const ruled = stepCursor(g.cursor ?? CURSOR_HOME, g.scroll ?? 0, event.dir, rowsRuled);
        expect(ruled).toEqual({ cursor: row.expect.cursor, scroll: row.expect.scroll });
        return;
      }
      case 'BOARD_PAGE':
        expect(pageScroll(g.scroll ?? 0, event.dir)).toBe(row.expect.scroll);
        return;
      case 'BOARD_CHANNEL':
        expect(wrapIndex((g.boardIndex ?? 7) + event.dir, g.count ?? 10)).toBe(row.expect.boardIndex);
        expect(row.expect.scroll).toBe(0);
        if (console) expect(row.expect.cursor).toBe(CURSOR_HOME);
        return;
      case 'BOARD_SELECT':
      case 'OPEN_BOARD':
        expect(row.expect.boardIndex).toBe(event.index);
        expect(row.expect.scroll).toBe(0);
        if (console) expect(row.expect.cursor).toBe(CURSOR_HOME);
        return;
      case 'DIAL':
        expect(wrapIndex((g.dial ?? 5) + event.dir, g.count ?? 10)).toBe(row.expect.dial);
        return;
      case 'GATE':
        expect(row.expect.dial).toBe(event.index);
        return;
      default:
        return; // the reducer's (WP-07)
    }
  });
});

describe('the stop guard rows (watch.tsx:842)', () => {
  it('WS01-04: a second STOP during the collapse is refused', () => {
    const row = STATION_ROWS.find((r) => r.id === 'WS01-04');
    expect(row?.tag).toBe('asis');
    expect(stopAccepted({ playbackActive: false, stopping: true })).toBe(false);
    expect(row?.expect.stopping).toBe(true);
  });
});

describe('rows exported for the station reducer (WP-07)', () => {
  it('carry every register sequence the reducer must replay', () => {
    const ids = STATION_ROWS.map((r) => r.id);
    for (const id of ['S1-01', 'S2-03', 'S2-05', 'WS01-01', 'WS01-02', 'WS22-01', 'WS11-01', 'WS03-01', 'B2-R13-web', 'BD-10']) {
      expect(ids).toContain(id);
    }
    const fixes = STATION_ROWS.filter((r) => r.tag.startsWith('fix:')).map((r) => r.tag);
    expect(new Set(fixes)).toEqual(new Set(['fix:WS-01', 'fix:WS-02', 'fix:WS-08', 'fix:WS-11', 'fix:WS-16', 'fix:WS-22', 'fix:WS-24']));
    const ruled = STATION_ROWS.filter((r) => r.tag.startsWith('ruled:')).map((r) => r.tag);
    expect(new Set(ruled)).toEqual(new Set(['ruled:4', 'ruled:16']));
  });

  it('describe a sequence in order, by offset', () => {
    for (const row of STATION_ROWS) {
      if (!Array.isArray(row.event)) continue;
      expect(row.event.length).toBeGreaterThan(1);
      for (let i = 1; i < row.event.length; i += 1) expect(row.event[i].at).toBeGreaterThan(row.event[i - 1].at);
    }
  });
});

// ── watch-state §b.2 / §b.3 / §g.3 ──

describe('reachable combinations show what the JSX guards show (watch-state.md §b.2)', () => {
  it.each(REACHABLE.map((r) => [r.id, r] as const))('%s — %s', (_id, r) => {
    const s = surfacesToday(r.view);
    for (const [k, v] of Object.entries(r.surfaces)) expect([r.id, k, s[k as keyof typeof s]]).toEqual([r.id, k, v]);
  });

  it.each(REACHABLE.map((r) => [r.id, r] as const))('%s — invariants hold except where the map marks them', (_id, r) => {
    for (const inv of INVARIANTS) {
      if (!inv.check) continue;
      const holds = inv.check(r.view);
      if (r.violates.includes(inv.n)) expect([r.id, inv.n, holds]).toEqual([r.id, inv.n, false]);
      else expect([r.id, inv.n, holds]).toEqual([r.id, inv.n, true]);
    }
  });

  it('never shows a meaningless combination on an as-is view, and shows exactly the known ones on the bugs', () => {
    for (const r of REACHABLE) {
      const present = UNREACHABLE.filter((u) => u.present(r.view)).map((u) => u.id);
      if (r.tag === 'asis') expect([r.id, present]).toEqual([r.id, []]);
    }
    const r13c = REACHABLE.find((r) => r.id === 'R13c')!;
    expect(UNREACHABLE.filter((u) => u.present(r13c.view)).map((u) => u.id)).toEqual(['U-06']);
    const signoffLink = REACHABLE.find((r) => r.id === 'R-signoff-link')!;
    expect(UNREACHABLE.filter((u) => u.present(signoffLink.view)).map((u) => u.id)).toEqual(['U-13']);
  });

  it('marks the unguarded combinations as the register does', () => {
    expect(UNREACHABLE.filter((u) => u.guard === 'unguarded').map((u) => u.id)).toEqual(['U-06', 'U-09']);
    expect(UNREACHABLE.filter((u) => u.guard === 'allowed').map((u) => u.id)).toEqual(['U-10']);
  });
});

// ── Drift guards against app/watch.tsx itself ──

describe('watch.tsx has not drifted from the tables', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'watch.tsx'), 'utf8');

  it('uses the same swipe threshold', () => {
    const local = /const SWIPE_THRESHOLD = (\d+);/.exec(source);
    if (local) expect(Number(local[1])).toBe(SWIPE_THRESHOLD);
    else expect(source).toMatch(/SWIPE_THRESHOLD[^\n]*from '\.\.\/src\/station\/remote'/);
  });

  it('takes the board literals from board.ts', () => {
    expect(source).toMatch(/from '\.\.\/src\/station\/board'/);
    expect(source).not.toMatch(/Math\.min\(s \+ 1, 30\)/);
    expect(source).not.toMatch(/Math\.max\(s - 1, -8\)/);
    expect(source).not.toMatch(/boardCursor < 7\b/);
    expect(source).not.toMatch(/setBoardCursor\(2\)/);
    expect(source).not.toMatch(/setBoardCursor\] = useState\(2\)/);
  });

  it('keeps the keys the table transcribes', () => {
    const handler = source.slice(source.indexOf('Keyboard remote'), source.indexOf("window.addEventListener('keydown'"));
    for (const key of REMOTE_KEYS) expect(handler).toContain(`case '${key}':`);
  });

  it('keeps the modes the table routes by, in order', () => {
    const handler = source.slice(source.indexOf('Keyboard remote'), source.indexOf("window.addEventListener('keydown'"));
    const notes = handler.indexOf("detailProgramme && e.key.startsWith('Arrow')");
    const board = handler.indexOf('if (boardVisible) {');
    const home = handler.indexOf('if (homeVisible) {');
    expect(notes).toBeGreaterThan(-1);
    expect(board).toBeGreaterThan(notes);
    expect(home).toBeGreaterThan(board);
  });
});

describe('the net has teeth', () => {
  it('pins at least sixty cases in data alone', () => {
    expect(INPUT_ROWS.length + DIAL_ROWS.length + STATION_ROWS.length).toBeGreaterThanOrEqual(60);
  });

  it('has a mode fixture for every mode name', () => {
    for (const name of MODE_NAMES) expect(MODES[name]).toBeDefined();
  });
});
