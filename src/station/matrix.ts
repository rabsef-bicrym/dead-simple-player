/**
 * The behaviour-preservation net, as data.
 *
 * Every row pins something `app/watch.tsx` does at bead381 (`asis`), or
 * states the outcome a decision in `reviews/dsp-polish/04-decisions.md`
 * asks for (`ruled:<n>`) or a register bug's fix requires (`fix:<id>`),
 * with `today` recording what the code does now whenever that differs.
 *
 * Sources, row by row: `01-understand/gap-watch-state-interaction-matrix.md`
 * §1–§4; `01-understand/watch-state.md` §b.2 (reachable), §b.3
 * (meaningless), §e.1 (the command table), §g.3 (the fifteen invariants);
 * the register entries WS-01, WS-02, WS-03, WS-08, WS-11, WS-16, WS-20,
 * WS-21, WS-22, WS-24 in `01-understand/00-MAP.md`.
 *
 * `matrix.test.ts` asserts every row a pure helper can answer today
 * (`remote.ts`, `board.ts`, `transitions.ts`). The station rows are the
 * reducer's characterization suite (WP-07): `asis` rows must hold, `ruled:`
 * and `fix:` rows must show exactly the stated outcome.
 *
 * Line numbers are bead381's (`app/watch.tsx` before this package added
 * one import at :24; read +1 for anything after it).
 */

import { CURSOR_HOME, ROWS_DS6, ROWS_DS8M, SCROLL_MAX, SCROLL_MIN } from './board';
import type { Cabinet, Command, Dir, Entrance, Shell, TuneOrigin } from './commands';
import type { MediaSessionAction, Mode, Swipe, TuneStepOrigin } from './remote';
import { watching } from './transitions';

// ── Tags ──

export type Tag = 'asis' | `ruled:${number}` | `fix:${string}`;

/** `04-decisions.md`, one line each, so a `ruled:<n>` tag can be checked against the file's numbering. */
export const DECISIONS: Readonly<Record<number, string>> = {
  1: 'Auto-PiP on background: keep, never while tuning; subscribe to PiP events',
  2: 'iPad: keep Split View; hide the rotate plate when orientation lock is unsupported',
  3: 'Lock-screen Now Playing: channel-only metadata',
  4: 'Console native cold start: power-on tunes through the static and is traced',
  5: 'Android is not a target',
  6: 'Cold-tune policy: pre-warm under the dial; work_ahead_limit; timeout 60; thin cold playlist',
  7: 'Audio under the Service Panel / hidden web tabs: keep playing; fix the keyboard leak',
  8: 'AirPlay from the iPhone PWA: no; delete the attachTimer engine switch',
  9: 'Dial ends: codify today’s split (bounded on console remote/keyboard; wrapping on board/dial/phone)',
  10: 'TV target: out of scope',
  11: 'Portrait board gestures: down = page back, up = page forward, ring/RETURN closes',
  12: 'MBoard.rollHome clatter: keep',
  13: 'Sub-60 s programmes are never named as "then comes"',
  14: 'Screenshot 3 = dead static canvas; landscape-lock question open',
  15: 'origin/claude/player-buffering-issues-o5pa9z: eyeball, then propose deletion',
  16: 'Links: wake a signed-off set; an arrival on a channel in error re-tunes it',
  17: 'User pauses stay paused; recoveries respect pausedAt',
  18: 'Marks: the lamp everywhere',
};

export function decisionOf(tag: Tag): number | null {
  const m = /^ruled:(\d+)$/.exec(tag);
  return m ? Number(m[1]) : null;
}

// ── Cabinets ──

export type CabinetName = 'console' | 'phone-landscape' | 'phone-portrait';

export const CABINETS: Readonly<Record<CabinetName, Cabinet>> = {
  console: { isPhone: false, landscape: true },
  'phone-landscape': { isPhone: true, landscape: true },
  'phone-portrait': { isPhone: true, landscape: false },
};
export const CABINET_NAMES = Object.keys(CABINETS) as CabinetName[];

// ═══════════════════════════════════════════════════════════════════════
// 1. Input rows — the key table, the gesture table, the lock-screen keys
// ═══════════════════════════════════════════════════════════════════════

export type Input =
  | { key: string }
  | { swipe: Swipe }
  | { media: MediaSessionAction };

export interface InputRow {
  id: string;
  mode: Mode;
  cabinet: CabinetName;
  input: Input;
  /** What the input must resolve to (today, or the ruled outcome). */
  expect: Command | null;
  /** What it resolves to today, when a decision changes it. */
  today?: Command | null;
  tag: Tag;
  cite: string;
  note?: string;
}

/** The indices every mode fixture carries: tuned 3, dial 5, board 7, ten channels. */
export const AT = { index: 3, dial: 5, boardIndex: 7, count: 10 } as const;

export type ModeName =
  | 'board' | 'board+notes' | 'home+board'
  | 'home' | 'home+notes'
  | 'watching' | 'watching+notes' | 'watching+pip'
  | 'stopping' | 'off' | 'signoff';

export const MODES: Readonly<Record<ModeName, Mode>> = {
  board: { base: 'watching', board: true, notes: false, ...AT },
  'board+notes': { base: 'watching', board: true, notes: true, ...AT },
  'home+board': { base: 'home', board: true, notes: false, ...AT },
  home: { base: 'home', board: false, notes: false, ...AT },
  'home+notes': { base: 'home', board: false, notes: true, ...AT },
  watching: { base: 'watching', board: false, notes: false, ...AT },
  'watching+notes': { base: 'watching', board: false, notes: true, ...AT },
  'watching+pip': { base: 'watching', board: false, notes: false, ...AT, pictureOutAvailable: true },
  stopping: { base: 'stopping', board: false, notes: false, ...AT },
  off: { base: 'off', board: false, notes: false, ...AT },
  signoff: { base: 'signoff', board: false, notes: false, ...AT },
};
export const MODE_NAMES = Object.keys(MODES) as ModeName[];

const TUNE_BOARD: Command = { type: 'TUNE', index: AT.boardIndex, origin: 'board' };
const HOME_FROM_BOARD: Command = { type: 'OPEN_HOME', index: AT.boardIndex, entrance: 'none' };
const TUNE_DIAL: Command = { type: 'TUNE_REQUESTED', index: AT.dial, origin: 'remote' };
const BOARD_AT_DIAL: Command = { type: 'OPEN_BOARD', index: AT.dial };
const BOARD_AT_TUNED: Command = { type: 'OPEN_BOARD', index: AT.index };
const UP_ONE: Command = { type: 'TUNE_REQUESTED', index: AT.index + 1, origin: 'remote' };
const DOWN_ONE: Command = { type: 'TUNE_REQUESTED', index: AT.index - 1, origin: 'remote' };
const CLOSE_NOTES: Command = { type: 'NOTES', programme: null };

type KeyMap = Readonly<Record<string, Command | null>>;

const BOARD_KEYS: KeyMap = {
  ArrowRight: { type: 'BOARD_CHANNEL', dir: 1 },
  ArrowLeft: { type: 'BOARD_CHANNEL', dir: -1 },
  ArrowDown: { type: 'BOARD_CURSOR', dir: 1 },
  ArrowUp: { type: 'BOARD_CURSOR', dir: -1 },
  Enter: TUNE_BOARD,
  Escape: { type: 'CLOSE_BOARD' },
  g: { type: 'CLOSE_BOARD' },
  h: HOME_FROM_BOARD,
  l: HOME_FROM_BOARD,
  i: null,
  n: { type: 'NOTES', programme: 'cursor' },
  p: null,
  P: null,
  s: null,
};
const BOARD_NOTES_KEYS: KeyMap = {
  ArrowRight: null, ArrowLeft: null, ArrowDown: null, ArrowUp: null,
  Enter: TUNE_BOARD,
  Escape: CLOSE_NOTES,
  g: CLOSE_NOTES,
  h: HOME_FROM_BOARD,
  l: HOME_FROM_BOARD,
  i: null,
  n: CLOSE_NOTES,
  p: null, P: null, s: null,
};
const HOME_KEYS: KeyMap = {
  ArrowRight: { type: 'DIAL', dir: 1 },
  ArrowDown: { type: 'DIAL', dir: 1 },
  ArrowLeft: { type: 'DIAL', dir: -1 },
  ArrowUp: { type: 'DIAL', dir: -1 },
  Enter: TUNE_DIAL,
  Escape: null,
  g: BOARD_AT_DIAL,
  h: null, l: null, i: null, n: null, p: null, P: null,
  s: { type: 'SERVICE' },
};
const HOME_NOTES_KEYS: KeyMap = {
  ArrowRight: null, ArrowDown: null, ArrowLeft: null, ArrowUp: null,
  Enter: TUNE_DIAL,
  Escape: null,
  g: BOARD_AT_DIAL,
  h: null, l: null, i: null, n: null, p: null, P: null,
  s: { type: 'SERVICE' },
};
const WATCHING_KEYS: KeyMap = {
  ArrowUp: UP_ONE,
  ArrowDown: DOWN_ONE,
  ArrowLeft: null,
  ArrowRight: null,
  Enter: { type: 'HUD_SHOW' },
  i: { type: 'HUD_SHOW' },
  g: BOARD_AT_TUNED,
  h: { type: 'STOP' },
  l: { type: 'STOP' },
  n: { type: 'NOTES', programme: 'now' },
  p: null,
  P: null,
  s: null,
  Escape: { type: 'STOP' },
};
const WATCHING_NOTES_KEYS: KeyMap = {
  ArrowUp: null, ArrowDown: null, ArrowLeft: null, ArrowRight: null,
  Enter: { type: 'HUD_SHOW' },
  i: { type: 'HUD_SHOW' },
  g: BOARD_AT_TUNED,
  h: { type: 'STOP' },
  l: { type: 'STOP' },
  n: CLOSE_NOTES,
  p: null, P: null, s: null,
  Escape: CLOSE_NOTES,
};
const WATCHING_PIP_KEYS: KeyMap = {
  ...WATCHING_KEYS,
  p: { type: 'PICTURE_OUT' },
  P: { type: 'PICTURE_OUT' },
};

/**
 * The keyboard remote by mode (`watch.tsx:914-1023`; rulings table 1.3).
 * `stopping`, `off` and `signoff` share the watching vocabulary because the
 * handler has no branch for them (`:988`); STOP is then refused by the guard
 * at `:842` (see `transitions.stopAccepted`), which is WS-01's dead end.
 */
export const KEY_TABLE: Readonly<Record<ModeName, { keys: KeyMap; cite: string; note?: string }>> = {
  board: { keys: BOARD_KEYS, cite: 'watch.tsx:920-961' },
  'board+notes': { keys: BOARD_NOTES_KEYS, cite: 'watch.tsx:919, 943-955', note: 'arrows belong to Notes.tsx:58-67' },
  'home+board': { keys: BOARD_KEYS, cite: 'watch.tsx:920 (boardVisible is checked before homeVisible)' },
  home: { keys: HOME_KEYS, cite: 'watch.tsx:962-986', note: 'Escape at the receiver is a dead case (:983)' },
  'home+notes': { keys: HOME_NOTES_KEYS, cite: 'watch.tsx:919, 962-986', note: 'no key closes the notes at the receiver; the projection’s own press does (Notes.tsx:107, 161)' },
  watching: { keys: WATCHING_KEYS, cite: 'watch.tsx:988-1019' },
  'watching+notes': { keys: WATCHING_NOTES_KEYS, cite: 'watch.tsx:919, 1006-1018' },
  'watching+pip': { keys: WATCHING_PIP_KEYS, cite: 'watch.tsx:1011-1014' },
  stopping: { keys: WATCHING_KEYS, cite: 'watch.tsx:988 (no stopping branch)', note: 'g here orphans stopping (WS-01); h/Escape are refused at :842' },
  off: { keys: WATCHING_KEYS, cite: 'watch.tsx:988 (no blank branch)', note: 'the blank of WS-01/WS-02: only arrows, g and swipes recover' },
  signoff: { keys: WATCHING_KEYS, cite: 'watch.tsx:988 (no signOff branch)', note: 'reachable only on a phone-sized web window with a keyboard; the board it opens is hidden by :1307' },
};

/** Phone portrait closes the board with the shade (`:952-954`); every other key is cabinet-blind. */
const PORTRAIT_BOARD_OVERRIDE: KeyMap = {
  Escape: { type: 'BOARD_CLOSING' },
  g: { type: 'BOARD_CLOSING' },
};

function keyRows(): InputRow[] {
  const rows: InputRow[] = [];
  for (const modeName of MODE_NAMES) {
    const { keys, cite, note } = KEY_TABLE[modeName];
    const mode = MODES[modeName];
    for (const cabinet of CABINET_NAMES) {
      const boardOpen = mode.board && !mode.notes && cabinet === 'phone-portrait';
      for (const key of [...Object.keys(keys), 'x']) {
        let expect: Command | null = keys[key] ?? null;
        if (boardOpen && key in PORTRAIT_BOARD_OVERRIDE) expect = PORTRAIT_BOARD_OVERRIDE[key];
        rows.push({
          id: `K-${modeName}-${cabinet}-${key}`,
          mode, cabinet, input: { key }, expect, tag: 'asis', cite, note,
        });
      }
    }
  }
  return rows;
}

/** The dial has ends on the keyboard: nothing tunes past them (`:989-993`). */
const KEY_END_ROWS: InputRow[] = [
  { id: 'K-end-top-ArrowUp', mode: { ...MODES.watching, index: 9 }, cabinet: 'console', input: { key: 'ArrowUp' }, expect: null, tag: 'asis', cite: 'watch.tsx:989-991' },
  { id: 'K-end-top-ArrowDown', mode: { ...MODES.watching, index: 9 }, cabinet: 'console', input: { key: 'ArrowDown' }, expect: { type: 'TUNE_REQUESTED', index: 8, origin: 'remote' }, tag: 'asis', cite: 'watch.tsx:992-994' },
  { id: 'K-end-bottom-ArrowDown', mode: { ...MODES.watching, index: 0 }, cabinet: 'console', input: { key: 'ArrowDown' }, expect: null, tag: 'asis', cite: 'watch.tsx:992-994' },
  { id: 'K-end-bottom-ArrowUp', mode: { ...MODES.watching, index: 0 }, cabinet: 'console', input: { key: 'ArrowUp' }, expect: { type: 'TUNE_REQUESTED', index: 1, origin: 'remote' }, tag: 'asis', cite: 'watch.tsx:989-991' },
  { id: 'K-end-single-ArrowUp', mode: { ...MODES.watching, index: 0, count: 1 }, cabinet: 'console', input: { key: 'ArrowUp' }, expect: null, tag: 'asis', cite: 'watch.tsx:989-991' },
  { id: 'K-end-single-ArrowDown', mode: { ...MODES.watching, index: 0, count: 1 }, cabinet: 'console', input: { key: 'ArrowDown' }, expect: null, tag: 'asis', cite: 'watch.tsx:992-994' },
];

/** NOTES with nothing to show is a dead press: no programme under the cursor (`:946`), nothing on (`:833-835`). Closing needs neither. */
const KEY_NOTES_ROWS: InputRow[] = [
  { id: 'K-board-console-n-bare', mode: { ...MODES.board, cursorProgramme: false }, cabinet: 'console', input: { key: 'n' }, expect: null, tag: 'asis', cite: 'watch.tsx:946 (boardCursorProg.current is null)' },
  { id: 'K-watching-console-n-bare', mode: { ...MODES.watching, nowPlaying: false }, cabinet: 'console', input: { key: 'n' }, expect: null, tag: 'asis', cite: 'watch.tsx:1008, 833-835 (nowPlaying is null)' },
  { id: 'K-board+notes-console-n-bare', mode: { ...MODES['board+notes'], cursorProgramme: false }, cabinet: 'console', input: { key: 'n' }, expect: CLOSE_NOTES, tag: 'asis', cite: 'watch.tsx:945' },
  { id: 'K-watching+notes-console-n-bare', mode: { ...MODES['watching+notes'], nowPlaying: false }, cabinet: 'console', input: { key: 'n' }, expect: CLOSE_NOTES, tag: 'asis', cite: 'watch.tsx:1007' },
];

export const KEY_ROWS: readonly InputRow[] = [...keyRows(), ...KEY_END_ROWS, ...KEY_NOTES_ROWS];

// ── Gestures (`watch.tsx:737-821`) ──

/** Named swipes. `L`/`R`/`U`/`D` are decisive; the rest probe the threshold (`:79`) and the axis test (`:740`). */
export const SWIPES = {
  L: { dx: -120, dy: 10 },
  R: { dx: 120, dy: -10 },
  U: { dx: 5, dy: -120 },
  D: { dx: -5, dy: 120 },
  shortL: { dx: -40, dy: 0 },
  shortR: { dx: 40, dy: 0 },
  shortU: { dx: 0, dy: -40 },
  shortD: { dx: 0, dy: 40 },
  /** Exactly the threshold: the board's `< 70` lets it through, every `> 70` site does not. */
  edgeL: { dx: -70, dy: 0 },
  edgeU: { dx: 0, dy: -70 },
  /** Equal travel is not horizontal (`>`), so it is read as a downward swipe. */
  diag: { dx: 100, dy: 100 },
  /** A pan that has not ended does nothing. */
  unended: { dx: -120, dy: 0, ended: false },
} as const satisfies Record<string, Swipe>;
export type SwipeName = keyof typeof SWIPES;

function swipeRow(
  id: string,
  modeName: ModeName,
  cabinet: CabinetName,
  swipe: SwipeName,
  expect: Command | null,
  cite: string,
  extra: Partial<Pick<InputRow, 'mode' | 'today' | 'tag' | 'note'>> = {},
): InputRow {
  return {
    id, mode: extra.mode ?? MODES[modeName], cabinet, input: { swipe: SWIPES[swipe] },
    expect, tag: extra.tag ?? 'asis', cite, today: extra.today, note: extra.note,
  };
}

const bc = (dir: Dir): Command => ({ type: 'BOARD_CHANNEL', dir });
const cur = (dir: Dir): Command => ({ type: 'BOARD_CURSOR', dir });
const page = (dir: Dir): Command => ({ type: 'BOARD_PAGE', dir });
const dial = (dir: Dir): Command => ({ type: 'DIAL', dir });
const tuneSwipe = (index: number): Command => ({ type: 'TUNE', index, origin: 'swipe' });
const reqSwipe = (index: number): Command => ({ type: 'TUNE_REQUESTED', index, origin: 'swipe' });
const gate = (index: number): Command => ({ type: 'GATE', index });

export const SWIPE_ROWS: readonly InputRow[] = [
  // ── console, watching ──
  swipeRow('G-console-watching-L', 'watching', 'console', 'L', { type: 'OPEN_HOME', index: AT.index, entrance: 'none' }, 'watch.tsx:812'),
  swipeRow('G-console-watching-R', 'watching', 'console', 'R', BOARD_AT_TUNED, 'watch.tsx:813'),
  swipeRow('G-console-watching-U', 'watching', 'console', 'U', tuneSwipe(AT.index + 1), 'watch.tsx:816-817'),
  swipeRow('G-console-watching-D', 'watching', 'console', 'D', tuneSwipe(AT.index - 1), 'watch.tsx:818-819'),
  swipeRow('G-console-watching-shortL', 'watching', 'console', 'shortL', null, 'watch.tsx:812-813'),
  swipeRow('G-console-watching-shortU', 'watching', 'console', 'shortU', null, 'watch.tsx:816-819'),
  swipeRow('G-console-watching-edgeL', 'watching', 'console', 'edgeL', null, 'watch.tsx:812 (< -70 needed)'),
  swipeRow('G-console-watching-edgeU', 'watching', 'console', 'edgeU', null, 'watch.tsx:816 (< -70 needed)'),
  swipeRow('G-console-watching-diag', 'watching', 'console', 'diag', tuneSwipe(AT.index - 1), 'watch.tsx:740, 818', { note: 'equal travel reads as vertical' }),
  swipeRow('G-console-watching-unended', 'watching', 'console', 'unended', null, 'watch.tsx:738'),
  swipeRow('G-console-watching-top-U', 'watching', 'console', 'U', null, 'watch.tsx:816 (bounded)', { mode: { ...MODES.watching, index: 9 } }),
  swipeRow('G-console-watching-bottom-D', 'watching', 'console', 'D', null, 'watch.tsx:818 (bounded)', { mode: { ...MODES.watching, index: 0 } }),
  swipeRow('G-console-watching+notes-L', 'watching+notes', 'console', 'L', null, 'watch.tsx:743'),
  swipeRow('G-console-watching+notes-U', 'watching+notes', 'console', 'U', null, 'watch.tsx:743'),
  // ── console, board ──
  swipeRow('G-console-board-L', 'board', 'console', 'L', bc(1), 'watch.tsx:786-791'),
  swipeRow('G-console-board-R', 'board', 'console', 'R', bc(-1), 'watch.tsx:786-791'),
  swipeRow('G-console-board-U', 'board', 'console', 'U', cur(1), 'watch.tsx:792-794'),
  swipeRow('G-console-board-D', 'board', 'console', 'D', cur(-1), 'watch.tsx:795-797'),
  swipeRow('G-console-board-shortL', 'board', 'console', 'shortL', null, 'watch.tsx:787'),
  swipeRow('G-console-board-shortU', 'board', 'console', 'shortU', null, 'watch.tsx:792-797'),
  swipeRow('G-console-board-edgeL', 'board', 'console', 'edgeL', bc(1), 'watch.tsx:787 (< 70 returns; 70 passes)', { note: 'the one site that accepts a swipe of exactly the threshold' }),
  swipeRow('G-console-board-edgeU', 'board', 'console', 'edgeU', null, 'watch.tsx:792 (< -70 needed)'),
  swipeRow('G-console-board+notes-L', 'board+notes', 'console', 'L', null, 'watch.tsx:743'),
  swipeRow('G-console-home+board-L', 'home+board', 'console', 'L', bc(1), 'watch.tsx:782 (boardVisible first)'),
  // ── console, home ──
  swipeRow('G-console-home-L', 'home', 'console', 'L', dial(1), 'watch.tsx:804-807'),
  swipeRow('G-console-home-R', 'home', 'console', 'R', dial(-1), 'watch.tsx:804-807'),
  swipeRow('G-console-home-U', 'home', 'console', 'U', null, 'watch.tsx:801-809'),
  swipeRow('G-console-home-D', 'home', 'console', 'D', null, 'watch.tsx:801-809'),
  swipeRow('G-console-home-edgeL', 'home', 'console', 'edgeL', null, 'watch.tsx:804 (> 70 needed)'),
  swipeRow('G-console-home+notes-L', 'home+notes', 'console', 'L', null, 'watch.tsx:743'),
  // ── console, the bases the handler has no branch for ──
  swipeRow('G-console-stopping-R', 'stopping', 'console', 'R', BOARD_AT_TUNED, 'watch.tsx:813', { note: 'WS-01: the board opens over the collapse and orphans stopping' }),
  swipeRow('G-console-stopping-L', 'stopping', 'console', 'L', { type: 'OPEN_HOME', index: AT.index, entrance: 'none' }, 'watch.tsx:812', { note: 'WS-01: stopping stays true under Home' }),
  swipeRow('G-console-stopping-U', 'stopping', 'console', 'U', tuneSwipe(AT.index + 1), 'watch.tsx:816-817', { note: 'tuneTo resets stopping (:509)' }),
  swipeRow('G-console-off-R', 'off', 'console', 'R', BOARD_AT_TUNED, 'watch.tsx:813'),
  swipeRow('G-console-off-L', 'off', 'console', 'L', { type: 'OPEN_HOME', index: AT.index, entrance: 'none' }, 'watch.tsx:812'),
  swipeRow('G-console-signoff-R', 'signoff', 'console', 'R', BOARD_AT_TUNED, 'watch.tsx:747 is phone-only', { note: 'sign-off needs isPhone; a console-sized display never shows it' }),
  // ── phone landscape ──
  swipeRow('G-phoneL-watching-L', 'watching', 'phone-landscape', 'L', reqSwipe(AT.index + 1), 'watch.tsx:776-779'),
  swipeRow('G-phoneL-watching-R', 'watching', 'phone-landscape', 'R', reqSwipe(AT.index - 1), 'watch.tsx:776-779'),
  swipeRow('G-phoneL-watching-U', 'watching', 'phone-landscape', 'U', null, 'watch.tsx:774-780 (no vertical tune on glass)'),
  swipeRow('G-phoneL-watching-D', 'watching', 'phone-landscape', 'D', null, 'watch.tsx:774-780'),
  swipeRow('G-phoneL-watching-edgeL', 'watching', 'phone-landscape', 'edgeL', null, 'watch.tsx:776 (> 70 needed)'),
  swipeRow('G-phoneL-watching-top-L', 'watching', 'phone-landscape', 'L', reqSwipe(0), 'watch.tsx:778 (wraps)', { mode: { ...MODES.watching, index: 9 } }),
  swipeRow('G-phoneL-watching-bottom-R', 'watching', 'phone-landscape', 'R', reqSwipe(9), 'watch.tsx:778 (wraps)', { mode: { ...MODES.watching, index: 0 } }),
  swipeRow('G-phoneL-watching+notes-L', 'watching+notes', 'phone-landscape', 'L', null, 'watch.tsx:743'),
  swipeRow('G-phoneL-board-L', 'board', 'phone-landscape', 'L', bc(1), 'watch.tsx:749-753'),
  swipeRow('G-phoneL-board-R', 'board', 'phone-landscape', 'R', bc(-1), 'watch.tsx:749-753'),
  swipeRow('G-phoneL-board-U', 'board', 'phone-landscape', 'U', page(1), 'watch.tsx:754-757'),
  swipeRow('G-phoneL-board-D', 'board', 'phone-landscape', 'D', page(-1), 'watch.tsx:758-760'),
  swipeRow('G-phoneL-board-edgeL', 'board', 'phone-landscape', 'edgeL', bc(1), 'watch.tsx:750 (< 70 returns; 70 passes)'),
  swipeRow('G-phoneL-board-shortU', 'board', 'phone-landscape', 'shortU', null, 'watch.tsx:754-760'),
  swipeRow('G-phoneL-home-L', 'home', 'phone-landscape', 'L', gate(AT.dial + 1), 'watch.tsx:766-770'),
  swipeRow('G-phoneL-home-R', 'home', 'phone-landscape', 'R', gate(AT.dial - 1), 'watch.tsx:766-770'),
  swipeRow('G-phoneL-home-top-L', 'home', 'phone-landscape', 'L', gate(0), 'watch.tsx:768 (wraps)', { mode: { ...MODES.home, dial: 9 } }),
  swipeRow('G-phoneL-home-U', 'home', 'phone-landscape', 'U', null, 'watch.tsx:766'),
  swipeRow('G-phoneL-home-edgeL', 'home', 'phone-landscape', 'edgeL', null, 'watch.tsx:766 (> 70 needed)'),
  swipeRow('G-phoneL-signoff-L', 'signoff', 'phone-landscape', 'L', null, 'watch.tsx:747'),
  swipeRow('G-phoneL-signoff-R', 'signoff', 'phone-landscape', 'R', null, 'watch.tsx:747'),
  swipeRow('G-phoneL-stopping-L', 'stopping', 'phone-landscape', 'L', reqSwipe(AT.index + 1), 'watch.tsx:774-780 (no stopping branch)'),
  // ── phone portrait ──
  swipeRow('G-phoneP-watching-L', 'watching', 'phone-portrait', 'L', reqSwipe(AT.index + 1), 'watch.tsx:776-779', { note: 'requestTune blooms the register first (:549-557)' }),
  swipeRow('G-phoneP-watching-R', 'watching', 'phone-portrait', 'R', reqSwipe(AT.index - 1), 'watch.tsx:776-779'),
  swipeRow('G-phoneP-watching-U', 'watching', 'phone-portrait', 'U', null, 'watch.tsx:774-780'),
  swipeRow('G-phoneP-watching-D', 'watching', 'phone-portrait', 'D', null, 'watch.tsx:774-780'),
  swipeRow('G-phoneP-board-L', 'board', 'phone-portrait', 'L', bc(1), 'watch.tsx:749-753'),
  swipeRow('G-phoneP-board-R', 'board', 'phone-portrait', 'R', bc(-1), 'watch.tsx:749-753'),
  swipeRow('G-phoneP-board-U', 'board', 'phone-portrait', 'U', page(1), 'watch.tsx:754-756', {
    tag: 'ruled:11', today: { type: 'BOARD_CLOSING' },
    note: 'today: up rolls the shade home; decision 11: up = page forward, ring/RETURN closes',
  }),
  swipeRow('G-phoneP-board-D', 'board', 'phone-portrait', 'D', page(-1), 'watch.tsx:758-760', {
    tag: 'ruled:11', today: page(1),
    note: 'today: down pages FORWARD, so the portrait shade cannot page back; decision 11: down = page back',
  }),
  swipeRow('G-phoneP-board-edgeL', 'board', 'phone-portrait', 'edgeL', bc(1), 'watch.tsx:750 (< 70 returns; 70 passes)'),
  swipeRow('G-phoneP-home-L', 'home', 'phone-portrait', 'L', null, 'watch.tsx:762-773 (portrait: the column is the input)'),
  swipeRow('G-phoneP-home-R', 'home', 'phone-portrait', 'R', null, 'watch.tsx:762-773'),
  swipeRow('G-phoneP-home-U', 'home', 'phone-portrait', 'U', null, 'watch.tsx:762-773'),
  swipeRow('G-phoneP-home-D', 'home', 'phone-portrait', 'D', null, 'watch.tsx:762-773'),
  swipeRow('G-phoneP-signoff-L', 'signoff', 'phone-portrait', 'L', null, 'watch.tsx:747'),
  swipeRow('G-phoneP-watching+notes-L', 'watching+notes', 'phone-portrait', 'L', null, 'watch.tsx:743'),
  swipeRow('G-phoneP-board+notes-U', 'board+notes', 'phone-portrait', 'U', null, 'watch.tsx:743'),
];

// ── Lock-screen keys (`watch.tsx:1059-1066`) ──

export const MEDIA_ROWS: readonly InputRow[] = [
  { id: 'M-next', mode: MODES.watching, cabinet: 'console', input: { media: 'nexttrack' }, expect: UP_ONE, tag: 'asis', cite: 'watch.tsx:1063-1065' },
  { id: 'M-prev', mode: MODES.watching, cabinet: 'console', input: { media: 'previoustrack' }, expect: DOWN_ONE, tag: 'asis', cite: 'watch.tsx:1060-1062' },
  { id: 'M-next-top', mode: { ...MODES.watching, index: 9 }, cabinet: 'console', input: { media: 'nexttrack' }, expect: null, tag: 'asis', cite: 'watch.tsx:1064 (bounded)' },
  { id: 'M-prev-bottom', mode: { ...MODES.watching, index: 0 }, cabinet: 'console', input: { media: 'previoustrack' }, expect: null, tag: 'asis', cite: 'watch.tsx:1061 (bounded)' },
];

export const INPUT_ROWS: readonly InputRow[] = [...KEY_ROWS, ...SWIPE_ROWS, ...MEDIA_ROWS];

// ── Dial ends by input site (decision 9: codified, unchanged) ──

export interface DialRow {
  id: string;
  origin: TuneStepOrigin;
  i: number;
  dir: Dir;
  n: number;
  expect: number | null;
  tag: Tag;
  cite: string;
}

/**
 * The ends, written out per input site so the rows carry a claim of their
 * own: `null` is a bounded end (nothing tunes), a number is where a wrap
 * lands from index 9 up, index 0 down, and on a single-station dial.
 * `remote.test.ts` pins `DIAL_END_POLICY` to the same split as literals;
 * the two are stated separately on purpose, so a flip in either fails the
 * other, and `stepIndex` is checked against this table, not its own.
 */
const DIAL_ENDS: Readonly<Record<TuneStepOrigin, { top: number | null; bottom: number | null; single: number | null; cite: string }>> = {
  'keyboard-watching': { top: null, bottom: null, single: null, cite: 'watch.tsx:989-993' },
  'media-session': { top: null, bottom: null, single: null, cite: 'watch.tsx:1060-1065' },
  'console-swipe-watching': { top: null, bottom: null, single: null, cite: 'watch.tsx:816-819' },
  'home-keys': { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:966-973' },
  'home-swipe': { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:804-807' },
  'board-keys': { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:926-931' },
  'board-swipe': { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:752, 789' },
  shifter: { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:768' },
  'phone-swipe-watching': { top: 0, bottom: 9, single: 0, cite: 'watch.tsx:778' },
  column: { top: 0, bottom: 9, single: 0, cite: 'MHome.tsx:514 (rows are addressed)' },
};

function dialRows(): DialRow[] {
  const rows: DialRow[] = [];
  for (const origin of Object.keys(DIAL_ENDS) as TuneStepOrigin[]) {
    const { top, bottom, single, cite } = DIAL_ENDS[origin];
    rows.push(
      { id: `D-${origin}-top`, origin, i: 9, dir: 1, n: 10, expect: top, tag: 'asis', cite },
      { id: `D-${origin}-bottom`, origin, i: 0, dir: -1, n: 10, expect: bottom, tag: 'asis', cite },
      { id: `D-${origin}-mid`, origin, i: 4, dir: 1, n: 10, expect: 5, tag: 'asis', cite },
      { id: `D-${origin}-single`, origin, i: 0, dir: 1, n: 1, expect: single, tag: 'asis', cite },
    );
  }
  return rows;
}
export const DIAL_ROWS: readonly DialRow[] = dialRows();

// ═══════════════════════════════════════════════════════════════════════
// 2. Station rows — what a transition does to what is on screen
// ═══════════════════════════════════════════════════════════════════════

export type SceneBase = 'warming' | 'difficulty' | 'home' | 'watching' | 'stopping' | 'signoff' | 'off';
/** `static` = tuning, no frame yet; `-error` = `playerError` set. */
export type PictureScene = 'static' | 'static-error' | 'live' | 'live-error';

/** "Given": enough of bead381's flags to place the set. Defaults: console, ten channels, tuned 3, dial 5, board 7. */
export interface Scene {
  base: SceneBase;
  cabinet?: CabinetName;
  shell?: Shell;
  board?: boolean;
  boardClosing?: boolean;
  notes?: boolean;
  picture?: PictureScene;
  /** The 310 ms reveal is armed and `watchRevealDone` is false (`:526-543`). */
  revealPending?: boolean;
  registerRequest?: boolean;
  reducedMotion?: boolean;
  index?: number;
  dial?: number;
  boardIndex?: number;
  cursor?: number;
  scroll?: number;
  count?: number;
  entrance?: Entrance;
  indexRestored?: boolean;
}

/** Events that are not inputs. WP-07 folds these into `commands.ts` with their tokens. */
export type StationEvent =
  | { type: 'PLAYER_FIRST_FRAME' }
  | { type: 'PLAYER_ERROR'; message: string }
  | { type: 'REVEAL_DONE' }
  | { type: 'COLLAPSE_DONE' }
  | { type: 'DATA_LOADING' }
  | { type: 'DATA_READY'; count: number }
  | { type: 'DATA_FAILED'; message: string; count: number }
  | { type: 'INDEX_RESTORED'; index: number }
  | { type: 'CABINET'; cabinet: CabinetName }
  /** `setProgrammes` from `refreshGuide` (`:249-263`); programmes are data, not station state. */
  | { type: 'GUIDE_REFRESH' };

export type MatrixEvent = Command | StationEvent;

export interface Step {
  /** ms after the first step */
  at: number;
  event: MatrixEvent;
}

/** "Expect": the surfaces and fields a row cares about; unspecified fields are unconstrained. */
export interface Outcome {
  warming?: boolean;
  card?: boolean;
  home?: boolean;
  board?: boolean;
  notes?: boolean;
  signoff?: boolean;
  watching?: boolean;
  stopping?: boolean;
  /** No surface at all — not even the charge line (WS-02). */
  blank?: boolean;
  static?: boolean;
  /** The static carries THE SIGNAL WILL NOT JOIN. */
  staticError?: boolean;
  /** THE PICTURE IS HAVING DIFFICULTY over a live picture. */
  difficultyPlate?: boolean;
  /** `PlayerSurface` is mounted. */
  player?: boolean;
  flash?: boolean;
  /** The full tune branch ran (`traceTuneStart`, new source). */
  retune?: boolean;
  traceOpened?: boolean;
  lastChannelWritten?: boolean;
  route?: '/settings';
  shellPowerOff?: boolean;
  channelsKept?: boolean;
  entrance?: Entrance;
  index?: number;
  dial?: number;
  boardIndex?: number;
  cursor?: number;
  scroll?: number;
  registerRequest?: boolean;
  pendingLink?: number | null;
}

export interface StationRow {
  id: string;
  section: string;
  given: Scene;
  event: MatrixEvent | Step[];
  expect: Outcome;
  today?: Outcome;
  tag: Tag;
  cite: string;
  note?: string;
}

const ORIGINS: readonly TuneOrigin[] = ['register', 'swipe', 'board', 'remote', 'gate', 'link'];
const PICTURES: readonly PictureScene[] = ['static', 'static-error', 'live', 'live-error'];

/** gap §4: a same-channel arrival by picture state × origin — today's rule (`:495-502`). */
function sameChannelRows(): StationRow[] {
  const rows: StationRow[] = [];
  for (const picture of PICTURES) {
    const tuning = picture.startsWith('static');
    for (const origin of ORIGINS) {
      rows.push({
        id: `S4-${picture}-${origin}`,
        section: 'gap §4 same-channel arrival',
        given: { base: 'watching', picture, board: true, notes: true },
        event: { type: 'TUNE', index: AT.index, origin },
        expect: {
          retune: false, home: false, board: false, notes: false,
          flash: origin !== 'register' && !tuning,
          static: tuning, staticError: picture === 'static-error', difficultyPlate: picture === 'live-error',
        },
        tag: 'asis',
        cite: 'watch.tsx:495-502',
        note: tuning
          ? 'silent under the static, healthy or failing (WS-20)'
          : picture === 'live-error' ? 'a flash over the error card; nothing re-tunes (WS-20)' : undefined,
      });
    }
  }
  return rows;
}

/** gap §4 / decision 16: a failing or still-static channel does not count as tuned. */
const SAME_CHANNEL_RULED: StationRow[] = (['static', 'static-error', 'live-error', 'live'] as PictureScene[]).map((picture) => {
  const retunes = picture !== 'live';
  return {
    id: `S4-ruled16-${picture}`,
    section: 'gap §4 same-channel arrival',
    given: { base: 'watching', picture },
    event: { type: 'LINK', index: AT.index },
    today: { retune: false, static: picture.startsWith('static'), staticError: picture === 'static-error', difficultyPlate: picture === 'live-error' },
    expect: retunes
      ? { retune: true, static: true, staticError: false, difficultyPlate: false, traceOpened: true }
      : { retune: false, flash: true, static: false },
    tag: 'ruled:16',
    cite: 'watch.tsx:495-502; 04-decisions.md 16; 05-PLAN.md WP-07 (static counts as not tuned)',
    note: retunes ? 'the static restarts on the real remount and ends at the real first frame; no timer' : 'a live, healthy picture keeps the chrome-only arrival and its flash',
  };
});

export const STATION_ROWS: readonly StationRow[] = [
  // ── gap §1: a magic link during sign-off ──
  {
    id: 'S1-01', section: 'gap §1 link during sign-off',
    given: { base: 'signoff', cabinet: 'phone-landscape', index: 2 },
    event: { type: 'LINK', index: 5 },
    today: { signoff: true, watching: false, player: false, static: false, index: 5, lastChannelWritten: true, traceOpened: true },
    expect: { signoff: false, watching: true, static: true, player: true, index: 5, traceOpened: true },
    tag: 'ruled:16',
    cite: 'watch.tsx:640-651, 504-514, 592-600, 1332-1339; SignOff.tsx:28-32',
    note: 'today the tune is swallowed yet currentIndex, LAST_CHANNEL_ID and a TUNE START move (WS-21); decision 16: the link wakes the set',
  },
  {
    id: 'S1-02', section: 'gap §1 link during sign-off',
    given: { base: 'signoff', cabinet: 'phone-landscape', index: 2 },
    event: { type: 'WAKE' },
    expect: { signoff: false, home: true, entrance: 'stamp', dial: 2, watching: false, player: false },
    tag: 'asis',
    cite: 'watch.tsx:1336-1339, 560-573',
  },
  {
    id: 'S1-03', section: 'gap §1 link during sign-off',
    given: { base: 'signoff', cabinet: 'phone-landscape', index: 2 },
    event: [{ at: 0, event: { type: 'LINK', index: 5 } }, { at: 1000, event: { type: 'WAKE' } }],
    today: { home: true, entrance: 'stamp', dial: 5, watching: false },
    expect: { watching: true, index: 5, home: false, signoff: false },
    tag: 'ruled:16',
    cite: 'watch.tsx:1336-1339, 560-573',
    note: 'once the link has woken the set the card is gone; a late WAKE has nothing to press and changes nothing',
  },
  // ── gap §2: a server switch while watching / tuning ──
  {
    id: 'S2-01', section: 'gap §2 server switch reachability',
    given: { base: 'home' },
    event: { type: 'SERVICE' },
    expect: { home: true, watching: false, player: false, route: '/settings' },
    tag: 'asis',
    cite: 'watch.tsx:587-590, 980-982',
    note: 'every openServicePanel caller needs Home or the card (:981, :1087, :1279, :1298, :1356): natively a switch always begins with the player off',
  },
  {
    id: 'S2-02', section: 'gap §2 server switch reachability',
    given: { base: 'home' },
    event: { type: 'DATA_LOADING' },
    expect: { warming: true, player: false },
    tag: 'asis',
    cite: 'watch.tsx:216-220, 1069-1076',
  },
  {
    id: 'S2-03', section: 'gap §2 server switch reachability',
    given: { base: 'watching', picture: 'live' },
    event: { type: 'DATA_LOADING' },
    today: { warming: true, player: false, watching: true },
    expect: { watching: true, player: true, static: false },
    tag: 'fix:WS-16',
    cite: 'watch.tsx:1069-1076, 212-253; watch-state.md §g.3 invariant 15',
    note: 'reachable only via browser-history Forward into /settings on web; the WARMING UP early return unmounts the player while watching stays true — a banner is chrome, the base does not change',
  },
  {
    id: 'S2-04', section: 'gap §2 server switch reachability',
    given: { base: 'watching', picture: 'static' },
    event: [
      { at: 0, event: { type: 'DATA_LOADING' } },
      { at: 500, event: { type: 'DATA_READY', count: 10 } },
      { at: 1500, event: { type: 'PLAYER_FIRST_FRAME' } },
    ],
    expect: { watching: true, static: false, player: true },
    tag: 'asis',
    cite: 'watch.tsx:1069, 660-665, 686-691',
    note: 'a switch mid-tune keeps the static across the remount and ends it at the new surface’s real first frame (R1)',
  },
  {
    id: 'S2-05', section: 'gap §2 server switch reachability',
    given: { base: 'home', dial: 7, boardIndex: 7, index: 8, count: 10 },
    event: { type: 'DATA_READY', count: 4 },
    today: { dial: 7, boardIndex: 7, index: 3 },
    expect: { dial: 3, boardIndex: 3, index: 3 },
    tag: 'fix:WS-24',
    cite: 'watch.tsx:312-323, 331; Home.tsx:133-140; MHome.tsx:248',
    note: 'currentIndex is clamped by safeIndex today; dialIndex/boardIndex are not, so the DS-6 Home shows a blank panel until the next arrow wraps',
  },
  {
    id: 'S2-06', section: 'gap §2 server switch reachability',
    given: { base: 'home', count: 10 },
    event: { type: 'DATA_FAILED', message: 'no route to host', count: 10 },
    expect: { card: true, channelsKept: true },
    tag: 'asis',
    cite: 'watch.tsx:239-241, 1078',
    note: 'channels keep the old list (no setChannels on failure), so TRY AGAIN / SERVICE PANEL render and a switch-back recovers',
  },
  {
    id: 'S2-07', section: 'gap §2 server switch reachability',
    given: { base: 'watching', picture: 'live', count: 10 },
    event: { type: 'DATA_READY', count: 0 },
    today: { card: true, watching: true, player: false },
    expect: { card: true },
    tag: 'fix:WS-16',
    cite: 'watch.tsx:245, 1078; gap-degenerate DG-07',
    note: 'zero channels while on drops to the card with playbackActive still true; the next successful load remounts the picture with no static',
  },
  // ── gap §3: a guide refresh mid board-paging ──
  {
    id: 'S3-01', section: 'gap §3 guide refresh mid-paging',
    given: { base: 'watching', picture: 'live', board: true, boardIndex: 7, scroll: 3, cursor: 5 },
    event: { type: 'GUIDE_REFRESH' },
    expect: { board: true, boardIndex: 7, scroll: 3, cursor: 5, watching: true },
    tag: 'asis',
    cite: 'watch.tsx:249-263; Board.tsx:130-156',
    note: 'the window is anchored on the live row; scroll is an offset from it and the cursor keeps its row index',
  },
  {
    id: 'S3-02', section: 'gap §3 guide refresh mid-paging',
    given: { base: 'home', board: true, scroll: -2, cursor: 0 },
    event: { type: 'GUIDE_REFRESH' },
    expect: { home: true, board: true, scroll: -2, cursor: 0 },
    tag: 'asis',
    cite: 'watch.tsx:249-263; MBoard.tsx:120-183',
  },
  // ── gap §4 ──
  ...sameChannelRows(),
  ...SAME_CHANNEL_RULED,
  // ── watch-state §b.2: every reachable combination ──
  {
    id: 'B2-R1', section: 'b.2 reachable',
    given: { base: 'home', dial: 2 },
    event: { type: 'TUNE_REQUESTED', index: 2, origin: 'remote' },
    expect: { watching: true, static: true, flash: true, notes: false, home: false, player: true, traceOpened: true, index: 2 },
    tag: 'asis', cite: 'watch.tsx:504-524, 1152',
  },
  {
    id: 'B2-R1-register', section: 'b.2 reachable',
    given: { base: 'home', cabinet: 'phone-portrait', dial: 2 },
    event: { type: 'TUNE', index: 2, origin: 'register' },
    expect: { watching: true, static: true, flash: false, index: 2 },
    tag: 'asis', cite: 'watch.tsx:520-524 (R24: the bloom is the acknowledgment)',
  },
  {
    id: 'B2-R2', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'static' },
    event: { type: 'PLAYER_FIRST_FRAME' },
    expect: { watching: true, static: false, player: true },
    tag: 'asis', cite: 'watch.tsx:1040-1043, 686-691',
  },
  {
    id: 'B2-R2-hold', section: 'b.2 reachable',
    given: { base: 'watching', cabinet: 'phone-portrait', picture: 'static', revealPending: true },
    event: { type: 'PLAYER_FIRST_FRAME' },
    expect: { watching: true, static: true },
    tag: 'asis', cite: 'watch.tsx:686-691, 526-543',
    note: 'the frame arrived inside the 310 ms reveal; the static waits for REVEAL_DONE',
  },
  {
    id: 'B2-R2-hold-settles', section: 'b.2 reachable',
    given: { base: 'watching', cabinet: 'phone-portrait', picture: 'static', revealPending: true },
    event: [{ at: 100, event: { type: 'PLAYER_FIRST_FRAME' } }, { at: 310, event: { type: 'REVEAL_DONE' } }],
    expect: { watching: true, static: false },
    tag: 'asis', cite: 'watch.tsx:686-691, 539-542',
  },
  {
    id: 'B2-R3', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live' },
    event: { type: 'OPEN_BOARD', index: 3 },
    expect: { watching: true, board: true, player: true, home: false, boardIndex: 3, scroll: 0, cursor: CURSOR_HOME },
    tag: 'asis', cite: 'watch.tsx:576-585, 147 (R19: sound carries on beneath the board)',
  },
  {
    id: 'B2-R4', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live' },
    event: { type: 'NOTES', programme: 'now' },
    expect: { watching: true, notes: true, player: true },
    tag: 'asis', cite: 'watch.tsx:832-834, 1408',
  },
  {
    id: 'B2-R5', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live', board: true, notes: true },
    event: { type: 'OPEN_HOME', index: 3, entrance: 'none' },
    expect: { home: true, watching: false, player: false, static: false, board: false, notes: false, dial: 3, entrance: 'none' },
    tag: 'asis', cite: 'watch.tsx:560-573 (R19: Home kills the stream)',
  },
  {
    id: 'B2-R6', section: 'b.2 reachable',
    given: { base: 'home', dial: 5 },
    event: { type: 'OPEN_BOARD', index: 5 },
    expect: { home: true, board: true, watching: false, player: false, boardIndex: 5 },
    tag: 'asis', cite: 'watch.tsx:581 (home stays under the board when the set is off)',
  },
  {
    id: 'B2-R7', section: 'b.2 reachable',
    given: { base: 'home' },
    event: { type: 'NOTES', programme: 'now' },
    expect: { home: true, notes: true, watching: false },
    tag: 'asis', cite: 'watch.tsx:1281, 1357, 1408',
  },
  {
    id: 'B2-R8', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live', board: true, notes: true },
    event: { type: 'STOP' },
    expect: { stopping: true, watching: false, player: false, home: false, board: false, notes: false, static: false, flash: false, registerRequest: false },
    tag: 'asis', cite: 'watch.tsx:841-864, 1179 (R26: the collapse)',
  },
  {
    id: 'B2-R8-reduced', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live', reducedMotion: true },
    event: { type: 'STOP' },
    expect: { home: true, entrance: 'expand', stopping: false, dial: 3, watching: false },
    tag: 'asis', cite: 'watch.tsx:873-878 (R31: reduced motion cuts)',
  },
  {
    id: 'B2-R9', section: 'b.2 reachable',
    given: { base: 'stopping' },
    event: { type: 'COLLAPSE_DONE' },
    expect: { home: true, entrance: 'expand', stopping: false, dial: 3, watching: false, player: false },
    tag: 'asis', cite: 'watch.tsx:866-871, 907-910',
  },
  {
    id: 'B2-R10', section: 'b.2 reachable',
    given: { base: 'home', cabinet: 'phone-landscape' },
    event: { type: 'POWER_OFF', shell: 'phone' },
    expect: { signoff: true, home: false, watching: false, player: false, static: false },
    tag: 'asis', cite: 'watch.tsx:592-600, 1332',
  },
  {
    id: 'B2-R11', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'static' },
    event: { type: 'PLAYER_ERROR', message: 'The operation could not be completed' },
    expect: { watching: true, static: true, staticError: true, player: true },
    tag: 'asis', cite: 'watch.tsx:1050-1055, 1152; TuningStatic.native.tsx:69-71 (R4: the error labels the static, it does not end it)',
  },
  {
    id: 'B2-R11-live', section: 'b.2 reachable',
    given: { base: 'watching', picture: 'live' },
    event: { type: 'PLAYER_ERROR', message: 'The operation could not be completed' },
    expect: { watching: true, static: false, difficultyPlate: true, player: true },
    tag: 'asis', cite: 'watch.tsx:1050-1055, 1161-1166',
  },
  {
    id: 'B2-R12', section: 'b.2 reachable',
    given: { base: 'watching', cabinet: 'phone-portrait', picture: 'live' },
    event: { type: 'TUNE_REQUESTED', index: 4, origin: 'swipe' },
    expect: { watching: true, static: false, registerRequest: true, index: 3 },
    tag: 'asis', cite: 'watch.tsx:549-557',
    note: 'the old picture stays live while the register blooms for 270 ms',
  },
  {
    id: 'B2-R12-commit', section: 'b.2 reachable',
    given: { base: 'watching', cabinet: 'phone-portrait', picture: 'live' },
    event: [{ at: 0, event: { type: 'TUNE_REQUESTED', index: 4, origin: 'swipe' } }, { at: 270, event: { type: 'TUNE', index: 4, origin: 'swipe' } }],
    expect: { watching: true, static: true, registerRequest: false, index: 4, flash: true },
    tag: 'asis', cite: 'MHome.tsx:539-546; watch.tsx:1197-1200, 494',
  },
  {
    id: 'B2-R13-web', section: 'b.2 reachable',
    given: { base: 'home', shell: 'web' },
    event: { type: 'POWER_OFF', shell: 'web' },
    today: { blank: true, home: false },
    expect: { home: true },
    tag: 'fix:WS-02',
    cite: 'watch.tsx:602-608, 1344',
    note: 'on plain web there is no shell to power off and the receiver goes dark; WP-07 maps it to OPEN_HOME',
  },
  {
    id: 'B2-R13-electron', section: 'b.2 reachable',
    given: { base: 'home', shell: 'electron' },
    event: { type: 'POWER_OFF', shell: 'electron' },
    expect: { shellPowerOff: true },
    tag: 'asis',
    cite: 'watch.tsx:602-608; apps/desktop-electron/preload.js:5 (R43: the power jewel is app exit)',
  },
  {
    id: 'B2-R14', section: 'b.2 reachable',
    given: { base: 'home', shell: 'web' },
    event: { type: 'LINK', index: 4 },
    expect: { watching: true, static: true, index: 4, home: false, traceOpened: true },
    tag: 'asis', cite: 'watch.tsx:663-673 (R27: tunes at once while the set is on)',
  },
  {
    id: 'B2-R14-held', section: 'b.2 reachable',
    given: { base: 'warming', shell: 'web', indexRestored: false },
    event: [
      { at: 0, event: { type: 'LINK', index: 4 } },
      { at: 100, event: { type: 'DATA_READY', count: 10 } },
      { at: 200, event: { type: 'INDEX_RESTORED', index: 2 } },
    ],
    expect: { watching: true, static: true, index: 4 },
    tag: 'asis', cite: 'watch.tsx:663-664 (R27: held until the dial is restored)',
  },
  // ── WS-01: stopping pre-empted ──
  {
    id: 'WS01-01', section: 'WS-01 stopping pre-empted',
    given: { base: 'watching', picture: 'live' },
    event: [{ at: 0, event: { type: 'STOP' } }, { at: 100, event: { type: 'OPEN_BOARD', index: 3 } }],
    today: { stopping: true, board: true, home: false },
    expect: { home: true, entrance: 'expand', board: true, stopping: false, dial: 3 },
    tag: 'fix:WS-01',
    cite: 'watch.tsx:841-911, 185-196, 576-585',
    note: 'g within 380 ms of STOP: beginTransition cancels the collapse timer without settling it; the terminal state is home(expand) with the board over it',
  },
  {
    id: 'WS01-02', section: 'WS-01 stopping pre-empted',
    given: { base: 'watching', picture: 'live' },
    event: [
      { at: 0, event: { type: 'STOP' } },
      { at: 100, event: { type: 'OPEN_BOARD', index: 3 } },
      { at: 200, event: { type: 'CLOSE_BOARD' } },
    ],
    today: { stopping: true, home: false, board: false, watching: false, player: false },
    expect: { home: true, entrance: 'expand', board: false, stopping: false },
    tag: 'fix:WS-01',
    cite: 'watch.tsx:841-911, 185-196, 954',
    note: 'today nothing renders but the charge line, forever; h/Escape are refused at :842; only arrows, g and swipes recover',
  },
  {
    id: 'WS01-03', section: 'WS-01 stopping pre-empted',
    given: { base: 'watching', picture: 'live' },
    event: [{ at: 0, event: { type: 'STOP' } }, { at: 100, event: { type: 'OPEN_HOME', index: 3, entrance: 'none' } }],
    today: { home: true, stopping: true },
    expect: { home: true, stopping: false },
    tag: 'fix:WS-01',
    cite: 'watch.tsx:812, 560-573',
    note: 'stopping stays true under Home and keeps the stop guard stale until the next tune',
  },
  {
    id: 'WS01-04', section: 'WS-01 stopping pre-empted',
    given: { base: 'stopping' },
    event: { type: 'STOP' },
    expect: { stopping: true, home: false },
    tag: 'asis',
    cite: 'watch.tsx:842',
    note: 'a second STOP during the collapse is refused; the collapse completes on its own timer',
  },
  {
    id: 'WS01-05', section: 'WS-01 stopping pre-empted',
    given: { base: 'stopping' },
    event: { type: 'TUNE', index: 4, origin: 'swipe' },
    expect: { watching: true, static: true, stopping: false, index: 4 },
    tag: 'asis',
    cite: 'watch.tsx:509 (tuneTo resets stopping)',
  },
  // ── WS-22: the reveal pre-empted ──
  {
    id: 'WS22-01', section: 'WS-22 reveal pre-empted',
    given: { base: 'home', cabinet: 'phone-portrait', dial: 2 },
    event: [
      { at: 0, event: { type: 'TUNE', index: 2, origin: 'register' } },
      { at: 100, event: { type: 'OPEN_BOARD', index: 2 } },
      { at: 310, event: { type: 'REVEAL_DONE' } },
      { at: 800, event: { type: 'PLAYER_FIRST_FRAME' } },
      { at: 900, event: { type: 'CLOSE_BOARD' } },
    ],
    today: { watching: true, static: true, board: false },
    expect: { watching: true, static: false, board: false },
    tag: 'fix:WS-22',
    cite: 'watch.tsx:576-585, 185-196, 526-543, 686-691, 1208',
    note: 'THIS EVENING within 310 ms of a portrait tune from off: openBoard cancels the reveal timer without settling watchRevealDone, so the muted static outlives the frame until the next tune',
  },
  {
    id: 'WS22-02', section: 'WS-22 reveal pre-empted',
    given: { base: 'home', cabinet: 'phone-portrait', dial: 2 },
    event: [
      { at: 0, event: { type: 'TUNE', index: 2, origin: 'register' } },
      { at: 310, event: { type: 'REVEAL_DONE' } },
      { at: 800, event: { type: 'PLAYER_FIRST_FRAME' } },
    ],
    expect: { watching: true, static: false },
    tag: 'asis',
    cite: 'watch.tsx:526-543, 686-691',
  },
  {
    id: 'WS22-03', section: 'WS-22 reveal pre-empted',
    given: { base: 'home', cabinet: 'phone-portrait', dial: 2 },
    event: [
      { at: 0, event: { type: 'TUNE', index: 2, origin: 'register' } },
      { at: 100, event: { type: 'PLAYER_FIRST_FRAME' } },
      { at: 310, event: { type: 'REVEAL_DONE' } },
    ],
    expect: { watching: true, static: false },
    tag: 'asis',
    cite: 'watch.tsx:686-691 (the conjunction, either order)',
  },
  {
    id: 'WS22-04', section: 'WS-22 reveal pre-empted',
    given: { base: 'home', cabinet: 'console', dial: 2 },
    event: [{ at: 0, event: { type: 'TUNE_REQUESTED', index: 2, origin: 'remote' } }, { at: 50, event: { type: 'PLAYER_FIRST_FRAME' } }],
    expect: { watching: true, static: false },
    tag: 'asis',
    cite: 'watch.tsx:543-546 (no reveal on the console: revealDone is true at once)',
  },
  // ── WS-11: a portrait register request survives rotation ──
  {
    id: 'WS11-01', section: 'WS-11 rotation mid-bloom',
    given: { base: 'watching', cabinet: 'phone-portrait', picture: 'live', registerRequest: true },
    event: { type: 'CABINET', cabinet: 'phone-landscape' },
    today: { registerRequest: true, watching: true },
    expect: { registerRequest: false, watching: true },
    tag: 'fix:WS-11',
    cite: 'watch.tsx:549-557, 441-449; MHome.tsx:483-485, 548-561; watch-state.md §g.3 invariant 9',
    note: 'the mounting register replays the stale token minutes later as an unrequested bloom-and-tune',
  },
  {
    id: 'WS11-02', section: 'WS-11 rotation mid-bloom',
    given: { base: 'home', cabinet: 'phone-portrait', registerRequest: true },
    event: { type: 'CABINET', cabinet: 'phone-landscape' },
    today: { registerRequest: true, home: true },
    expect: { registerRequest: false, home: true },
    tag: 'fix:WS-11',
    cite: 'watch.tsx:549-557; MHome.tsx:548-561',
  },
  // ── WS-03 / decision 4: cold start by cabinet ──
  {
    id: 'WS03-01', section: 'WS-03 cold start',
    given: { base: 'warming', cabinet: 'console', shell: 'electron', indexRestored: false },
    event: [{ at: 0, event: { type: 'DATA_READY', count: 10 } }, { at: 10, event: { type: 'INDEX_RESTORED', index: 2 } }],
    today: { watching: true, static: false, traceOpened: false, index: 2, player: true },
    expect: { watching: true, static: true, traceOpened: true, index: 2, player: true, flash: false },
    tag: 'ruled:4',
    cite: 'watch.tsx:632-637; 00-MAP.md NP-10',
    note: 'today the console’s first picture of the day is a black seat with no static and no TUNE START; decision 4: power-on tunes through the static and is traced (flash suppressed, 05-PLAN §7.4)',
  },
  {
    id: 'WS03-02', section: 'WS-03 cold start',
    given: { base: 'warming', cabinet: 'console', shell: 'web', indexRestored: false },
    event: [{ at: 0, event: { type: 'DATA_READY', count: 10 } }, { at: 10, event: { type: 'INDEX_RESTORED', index: 2 } }],
    expect: { home: true, entrance: 'none', dial: 2, watching: false, player: false },
    tag: 'asis',
    cite: 'watch.tsx:630-631 (R15: web always wakes at the receiver)',
  },
  {
    id: 'WS03-03', section: 'WS-03 cold start',
    given: { base: 'warming', cabinet: 'phone-portrait', indexRestored: false },
    event: [{ at: 0, event: { type: 'DATA_READY', count: 10 } }, { at: 10, event: { type: 'INDEX_RESTORED', index: 2 } }],
    expect: { home: true, entrance: 'stamp', dial: 2, watching: false, player: false },
    tag: 'asis',
    cite: 'watch.tsx:630-631 (R16: the phone wakes quiet at its stick)',
  },
  {
    id: 'WS03-04', section: 'WS-03 cold start',
    given: { base: 'warming', cabinet: 'phone-landscape', indexRestored: false },
    event: [{ at: 0, event: { type: 'DATA_READY', count: 10 } }, { at: 10, event: { type: 'INDEX_RESTORED', index: 2 } }],
    expect: { home: true, entrance: 'none', dial: 2, watching: false },
    tag: 'asis',
    cite: 'watch.tsx:630-631',
  },
  // ── board arithmetic (WS-08) ──
  {
    id: 'BD-01', section: 'board arithmetic',
    given: { base: 'watching', board: true, cursor: ROWS_DS6 - 1, scroll: 0 },
    event: { type: 'BOARD_CURSOR', dir: 1 },
    expect: { cursor: ROWS_DS6 - 1, scroll: 1 },
    tag: 'asis', cite: 'watch.tsx:936-937',
  },
  {
    id: 'BD-02', section: 'board arithmetic',
    given: { base: 'watching', board: true, cursor: 0, scroll: 0 },
    event: { type: 'BOARD_CURSOR', dir: -1 },
    expect: { cursor: 0, scroll: -1 },
    tag: 'asis', cite: 'watch.tsx:940-941',
  },
  {
    id: 'BD-03', section: 'board arithmetic',
    given: { base: 'watching', board: true, cursor: 3, scroll: 4 },
    event: { type: 'BOARD_CURSOR', dir: 1 },
    expect: { cursor: 4, scroll: 4 },
    tag: 'asis', cite: 'watch.tsx:936',
  },
  {
    id: 'BD-04', section: 'board arithmetic',
    given: { base: 'watching', board: true, cursor: ROWS_DS6 - 1, scroll: SCROLL_MAX },
    event: { type: 'BOARD_CURSOR', dir: 1 },
    expect: { cursor: ROWS_DS6 - 1, scroll: SCROLL_MAX },
    tag: 'asis', cite: 'watch.tsx:937 (cap 30)',
  },
  {
    id: 'BD-05', section: 'board arithmetic',
    given: { base: 'watching', board: true, cursor: 0, scroll: SCROLL_MIN },
    event: { type: 'BOARD_CURSOR', dir: -1 },
    expect: { cursor: 0, scroll: SCROLL_MIN },
    tag: 'asis', cite: 'watch.tsx:941 (floor -8)',
  },
  {
    id: 'BD-06', section: 'board arithmetic',
    given: { base: 'watching', board: true, boardIndex: 9, scroll: 5, cursor: 6 },
    event: { type: 'BOARD_CHANNEL', dir: 1 },
    expect: { boardIndex: 0, scroll: 0, cursor: CURSOR_HOME },
    tag: 'asis', cite: 'watch.tsx:926-928 (wraps; scroll 0; cursor home)',
  },
  {
    id: 'BD-07', section: 'board arithmetic',
    given: { base: 'watching', board: true, boardIndex: 0, scroll: 5, cursor: 6 },
    event: { type: 'BOARD_CHANNEL', dir: -1 },
    expect: { boardIndex: 9, scroll: 0, cursor: CURSOR_HOME },
    tag: 'asis', cite: 'watch.tsx:931-933',
  },
  {
    id: 'BD-08', section: 'board arithmetic',
    given: { base: 'watching', cabinet: 'phone-landscape', board: true, scroll: SCROLL_MAX },
    event: { type: 'BOARD_PAGE', dir: 1 },
    expect: { scroll: SCROLL_MAX },
    tag: 'asis', cite: 'watch.tsx:757',
  },
  {
    id: 'BD-09', section: 'board arithmetic',
    given: { base: 'watching', cabinet: 'phone-landscape', board: true, scroll: SCROLL_MIN },
    event: { type: 'BOARD_PAGE', dir: -1 },
    expect: { scroll: SCROLL_MIN },
    tag: 'asis', cite: 'watch.tsx:759',
  },
  {
    id: 'BD-10', section: 'board arithmetic',
    given: { base: 'watching', cabinet: 'phone-landscape', board: true, cursor: ROWS_DS8M - 1, scroll: 0 },
    event: { type: 'BOARD_CURSOR', dir: 1 },
    today: { cursor: ROWS_DS8M, scroll: 0 },
    expect: { cursor: ROWS_DS8M - 1, scroll: 1 },
    tag: 'fix:WS-08',
    cite: 'watch.tsx:936 (< 7 for both cabinets); MBoard.tsx:31 (seven rows)',
    note: 'the phone board has seven rows but the cursor walk uses the DS-6 bound; the reducer passes ROWS_DS8M',
  },
  {
    id: 'BD-11', section: 'board arithmetic',
    given: { base: 'watching', picture: 'live', scroll: 5, cursor: 6 },
    event: { type: 'OPEN_BOARD', index: 3 },
    expect: { board: true, boardIndex: 3, scroll: 0, cursor: CURSOR_HOME },
    tag: 'asis', cite: 'watch.tsx:576-585',
  },
  {
    id: 'BD-12', section: 'board arithmetic',
    given: { base: 'watching', board: true, boardIndex: 7, scroll: 5, cursor: 6 },
    event: { type: 'BOARD_SELECT', index: 4 },
    expect: { boardIndex: 4, scroll: 0, cursor: CURSOR_HOME },
    tag: 'asis', cite: 'watch.tsx:1369-1373',
  },
  {
    id: 'BD-13', section: 'board arithmetic',
    given: { base: 'watching', cabinet: 'phone-landscape', board: true, boardIndex: 7, scroll: 5 },
    event: { type: 'BOARD_SELECT', index: 4 },
    expect: { boardIndex: 4, scroll: 0 },
    tag: 'asis', cite: 'watch.tsx:1311-1314 (no cursor on the phone)',
  },
  // ── the dial at the receiver ──
  {
    id: 'DL-01', section: 'dial',
    given: { base: 'home', dial: 9 },
    event: { type: 'DIAL', dir: 1 },
    expect: { home: true, dial: 0 },
    tag: 'asis', cite: 'watch.tsx:966-969 (wraps)',
  },
  {
    id: 'DL-02', section: 'dial',
    given: { base: 'home', dial: 0 },
    event: { type: 'DIAL', dir: -1 },
    expect: { home: true, dial: 9 },
    tag: 'asis', cite: 'watch.tsx:970-973 (wraps)',
  },
  {
    id: 'DL-03', section: 'dial',
    given: { base: 'home', cabinet: 'phone-landscape', dial: 5 },
    event: { type: 'GATE', index: 6 },
    expect: { home: true, dial: 6, watching: false },
    tag: 'asis', cite: 'watch.tsx:612-619 (the lever throws; the tune follows 340 ms later)',
  },
  {
    id: 'DL-04', section: 'dial',
    given: { base: 'home', cabinet: 'phone-landscape', dial: 5 },
    event: [{ at: 0, event: { type: 'GATE', index: 6 } }, { at: 340, event: { type: 'TUNE', index: 6, origin: 'gate' } }],
    expect: { watching: true, static: true, index: 6, flash: true },
    tag: 'asis', cite: 'watch.tsx:612-619, 520-524',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// 3. Today's flags, today's surfaces, and what must never be seen
// ═══════════════════════════════════════════════════════════════════════

/** The flags of `watch.tsx` that decide what is on screen (`watch-state.md` §b.1), as one object. */
export interface StationView {
  cabinet: CabinetName;
  dataLoading: boolean;
  dataError: boolean;
  playbackActive: boolean;
  tuning: boolean;
  sourceReady: boolean;
  revealDone: boolean;
  playerError: boolean;
  stopping: boolean;
  /** `stopHomeTimer` is pending — the collapse will finish on its own (`:907-910`). */
  collapseArmed: boolean;
  homeVisible: boolean;
  boardVisible: boolean;
  boardClosing: boolean;
  signOff: boolean;
  notes: boolean;
  registerRequest: boolean;
  hudVisible: boolean;
  controlsVisible: boolean;
  flashVisible: boolean;
  cursor: number;
  scroll: number;
}

export const REST: StationView = {
  cabinet: 'console',
  dataLoading: false, dataError: false,
  playbackActive: false, tuning: false, sourceReady: false, revealDone: true, playerError: false,
  stopping: false, collapseArmed: false, homeVisible: false, boardVisible: false, boardClosing: false, signOff: false,
  notes: false, registerRequest: false, hudVisible: false, controlsVisible: false, flashVisible: false,
  cursor: CURSOR_HOME, scroll: 0,
};

export function view(over: Partial<StationView>): StationView {
  return { ...REST, ...over };
}

/** What renders for a view — the JSX guards of `watch.tsx` at bead381, transcribed. */
export interface Surfaces {
  warming: boolean;
  card: boolean;
  home: boolean;
  board: boolean;
  notes: boolean;
  signoff: boolean;
  player: boolean;
  static: boolean;
  difficultyPlate: boolean;
  flash: boolean;
  crtLine: boolean;
  hud: boolean;
  blank: boolean;
}

export function surfacesToday(v: StationView): Surfaces {
  const isPhone = v.cabinet !== 'console';
  const portrait = v.cabinet === 'phone-portrait';
  const warming = v.dataLoading;                                            // :1069
  const card = !warming && v.dataError;                                     // :1078
  const tree = !warming && !card;
  const w = tree && watching(v);
  const portraitWatching = portrait && w;                                   // :148
  const home = tree && v.homeVisible && (isPhone ? !v.signOff : true);      // :1271, :1344
  const board = tree && v.boardVisible && (isPhone ? !v.signOff : true);    // :1307, :1365
  const notes = tree && v.notes;                                            // :1408
  const signoff = tree && isPhone && v.signOff;                             // :1332
  const player = w;                                                         // :1215
  const overlays = tree && (w || v.stopping);                               // :1216
  const staticUp = overlays && v.tuning && v.playbackActive;                // :1152
  const difficultyPlate = overlays && !v.tuning && v.playerError;           // :1161
  const flash = overlays && v.flashVisible && v.playbackActive;             // :1168
  const crtLine = overlays && v.stopping;                                   // :1179
  const hud = tree && v.hudVisible && w && !portraitWatching && !v.boardVisible; // :1225
  const blank = tree && !home && !board && !notes && !signoff && !player && !staticUp && !difficultyPlate && !crtLine;
  return { warming, card, home, board, notes, signoff, player, static: staticUp, difficultyPlate, flash, crtLine, hud, blank };
}

/** `watch-state.md` §b.3: representable but meaningless; `present(v)` is true when the combination is on. */
export interface Unreachable {
  id: string;
  combination: string;
  why: string;
  /** how today's code keeps it off screen */
  guard: 'writers' | 'render' | 'unguarded' | 'allowed';
  cite: string;
  present: (v: StationView) => boolean;
}

export const UNREACHABLE: readonly Unreachable[] = [
  { id: 'U-01', combination: 'homeVisible && playbackActive', why: 'Home kills the stream', guard: 'writers', cite: 'watch.tsx:560-573, 866-871', present: (v) => v.homeVisible && v.playbackActive },
  { id: 'U-02', combination: 'signOff && (homeVisible || boardVisible)', why: 'the broadcast day has concluded', guard: 'render', cite: 'watch.tsx:592-600, 1271, 1307', present: (v) => v.signOff && (v.homeVisible || v.boardVisible) },
  { id: 'U-03', combination: 'tuning && !playbackActive', why: 'a static over no seat', guard: 'writers', cite: 'watch.tsx:563-565, 595-597, 845-847, 1152', present: (v) => v.tuning && !v.playbackActive },
  { id: 'U-04', combination: 'sourceReady && !playbackActive', why: 'a frame for no picture', guard: 'writers', cite: 'watch.tsx:565, 597, 847', present: (v) => v.sourceReady && !v.playbackActive },
  { id: 'U-05', combination: 'stopping && playbackActive', why: 'a collapse of a live picture', guard: 'writers', cite: 'watch.tsx:509, 843-845', present: (v) => v.stopping && v.playbackActive },
  { id: 'U-06', combination: 'stopping && (homeVisible || boardVisible)', why: 'a collapse under a surface', guard: 'unguarded', cite: 'watch.tsx:185-196, 576-585 (WS-01)', present: (v) => v.stopping && (v.homeVisible || v.boardVisible) },
  { id: 'U-07', combination: 'boardClosing && !boardVisible', why: 'a shade rolling home with no board', guard: 'writers', cite: 'watch.tsx:1319-1322; MBoard.tsx:235 (un-cancelled onClose)', present: (v) => v.boardClosing && !v.boardVisible },
  { id: 'U-08', combination: '!revealDone && !tuning', why: 'a reveal hold with nothing to reveal', guard: 'writers', cite: 'watch.tsx:528, 545 (the next tune rewrites it)', present: (v) => !v.revealDone && !v.tuning },
  { id: 'U-09', combination: 'registerRequest && !(phone portrait)', why: 'a bloom with no register mounted', guard: 'unguarded', cite: 'watch.tsx:549-557; MHome.tsx:483-485 (WS-11)', present: (v) => v.registerRequest && v.cabinet !== 'phone-portrait' },
  { id: 'U-10', combination: 'hudVisible && portraitWatching', why: 'the apron only renders on the console and in landscape', guard: 'allowed', cite: 'watch.tsx:418-427 (primes the landscape apron on rotation), 1225', present: (v) => v.hudVisible && v.cabinet === 'phone-portrait' && watching(v) },
  { id: 'U-11', combination: 'flashVisible && !playbackActive', why: 'a plate for no picture', guard: 'render', cite: 'watch.tsx:1168 (openHome/openBoard do not cancelFlash)', present: (v) => v.flashVisible && !v.playbackActive },
  { id: 'U-12', combination: 'controlsVisible && !portraitWatching', why: 'portrait plates off portrait', guard: 'writers', cite: 'watch.tsx:441-449', present: (v) => v.controlsVisible && !(v.cabinet === 'phone-portrait' && watching(v)) },
  { id: 'U-13', combination: 'signOff && playbackActive && tuning', why: 'a tune inside sign-off (the link swallowed by wake)', guard: 'render', cite: 'watch.tsx:640-651, 147 (WS-21)', present: (v) => v.signOff && v.playbackActive && v.tuning },
];

/** `watch-state.md` §g.3: the fifteen invariants. `check` is the part a single view can answer. */
export interface Invariant {
  n: number;
  name: string;
  text: string;
  cite: string;
  /** violated or unguarded in today's code (the map's ⚠) */
  todayViolatedBy: string[];
  check?: (v: StationView) => boolean;
}

function baseCount(v: StationView): number {
  const s = surfacesToday(v);
  const bases = [s.warming, s.card, s.home, watching(v) && !s.warming && !s.card, v.stopping && !s.warming && !s.card, s.signoff];
  return bases.filter(Boolean).length;
}

export const INVARIANTS: readonly Invariant[] = [
  { n: 1, name: 'one base', text: 'Exactly one base at all times; base is never blank.', cite: 'watch-state.md §g.3 1', todayViolatedBy: ['WS-01', 'WS-02'], check: (v) => baseCount(v) === 1 && !surfacesToday(v).blank },
  { n: 2, name: 'static under watching', text: 'The static shows only under watching; it ends iff firstFrame && revealDone — no other path, no timer.', cite: 'watch.tsx:686-691, 1152', todayViolatedBy: ['WS-21'], check: (v) => !v.tuning || watching(v) },
  { n: 3, name: 'one writer of firstFrame', text: 'firstFrame is set only by FIRST_FRAME carrying the current generation; TUNE resets it.', cite: 'watch.tsx:1040-1043, 507', todayViolatedBy: [] },
  { n: 4, name: 'home has no picture', text: 'home ⇒ no live picture.', cite: 'watch.tsx:560-573', todayViolatedBy: [], check: (v) => !v.homeVisible || !v.playbackActive },
  { n: 5, name: 'signoff is bare', text: 'signoff ⇒ no board, no notes, no register request.', cite: 'watch.tsx:592-600', todayViolatedBy: ['WS-21'], check: (v) => !v.signOff || (!v.boardVisible && !v.notes && !v.registerRequest) },
  { n: 6, name: 'stopping is bounded', text: 'stopping exits only by COLLAPSE_DONE or by another base transition that itself produces a complete base.', cite: 'watch.tsx:841-911', todayViolatedBy: ['WS-01'], check: (v) => !v.stopping || (v.collapseArmed && !v.homeVisible && !v.boardVisible && !v.playbackActive) },
  { n: 7, name: 'board over home or watching', text: 'board ⇒ base ∈ {home, watching}; board.closing ⇒ phone portrait.', cite: 'watch.tsx:576-585; MBoard.tsx:235', todayViolatedBy: [], check: (v) => (!v.boardVisible || v.homeVisible || watching(v)) && (!v.boardClosing || v.cabinet === 'phone-portrait') },
  { n: 8, name: 'board bounds', text: `cursor ∈ [0, rows-1], scroll ∈ [${SCROLL_MIN}, ${SCROLL_MAX}]; a horizontal move resets scroll 0, cursor ${CURSOR_HOME}.`, cite: 'watch.tsx:926-941', todayViolatedBy: [], check: (v) => v.cursor >= 0 && v.cursor <= ROWS_DS6 - 1 && v.scroll >= SCROLL_MIN && v.scroll <= SCROLL_MAX },
  { n: 9, name: 'register request needs a register', text: 'registerRequest ⇒ phone portrait with a register mounted; consumed by TUNE or cancelled by any base/orientation change.', cite: 'watch.tsx:549-557', todayViolatedBy: ['WS-11'], check: (v) => !v.registerRequest || v.cabinet === 'phone-portrait' },
  { n: 10, name: 'notes over home or watching', text: 'notes ⇒ base ∈ {home, watching} (or board open); every base transition clears them.', cite: 'watch.tsx:832-834', todayViolatedBy: [], check: (v) => !v.notes || v.homeVisible || watching(v) || v.boardVisible },
  { n: 11, name: 'chrome never gates', text: 'hud, controls and flash never block a base transition, and every base transition resets chrome.', cite: 'watch.tsx:372-427, 459-486', todayViolatedBy: ['WS-07'] },
  { n: 12, name: 'deferred writes settle', text: 'Each deferred write belongs to one generation; a bump both cancels it and leaves the state complete without it.', cite: 'watch.tsx:185-196', todayViolatedBy: ['WS-01', 'WS-22'] },
  { n: 13, name: 'one writer of channel', text: 'channel changes only by TUNE or INDEX_RESTORED; LAST_CHANNEL_ID mirrors it.', cite: 'watch.tsx:312-329, 514', todayViolatedBy: [] },
  { n: 14, name: 'no mirror refs', text: 'playbackActiveRef, bufferingRef, currentStreamUrlRef do not exist; handlers read one latest ref.', cite: 'watch.tsx:168-183', todayViolatedBy: ['WS-05'] },
  { n: 15, name: 'the player stays mounted while watching', text: 'PlayerSurface mounts iff watching; no early return above the tree may unmount it while watching.', cite: 'watch.tsx:1069, 1215', todayViolatedBy: ['WS-16'], check: (v) => !watching(v) || surfacesToday(v).player },
];

/** `watch-state.md` §b.2 as today's flags, with the surfaces each must show. */
export interface ReachableView {
  id: string;
  how: string;
  view: StationView;
  surfaces: Partial<Surfaces>;
  /** invariants the map marks ⚠ for this very combination */
  violates: number[];
  tag: Tag;
}

export const REACHABLE: readonly ReachableView[] = [
  { id: 'R1', how: 'any tuneTo (non-same-channel)', view: view({ playbackActive: true, tuning: true, flashVisible: true }), surfaces: { player: true, static: true, flash: true, home: false }, violates: [], tag: 'asis' },
  { id: 'R2', how: 'first frame + reveal', view: view({ playbackActive: true, sourceReady: true, hudVisible: true }), surfaces: { player: true, static: false, hud: true }, violates: [], tag: 'asis' },
  { id: 'R3', how: 'openBoard while watching', view: view({ playbackActive: true, sourceReady: true, boardVisible: true }), surfaces: { player: true, board: true, home: false, hud: false }, violates: [], tag: 'asis' },
  { id: 'R4', how: 'openNotes while watching', view: view({ playbackActive: true, sourceReady: true, notes: true }), surfaces: { player: true, notes: true }, violates: [], tag: 'asis' },
  { id: 'R5', how: 'openHome', view: view({ homeVisible: true }), surfaces: { home: true, player: false, blank: false }, violates: [], tag: 'asis' },
  { id: 'R6', how: 'openBoard from home', view: view({ homeVisible: true, boardVisible: true }), surfaces: { home: true, board: true, player: false }, violates: [], tag: 'asis' },
  { id: 'R7', how: 'Home onNotes', view: view({ homeVisible: true, notes: true }), surfaces: { home: true, notes: true }, violates: [], tag: 'asis' },
  { id: 'R8', how: 'stopPlayback, first 380 ms', view: view({ stopping: true, collapseArmed: true }), surfaces: { crtLine: true, player: false, home: false, blank: false }, violates: [], tag: 'asis' },
  { id: 'R9', how: 'showExpandedRegister', view: view({ homeVisible: true }), surfaces: { home: true }, violates: [], tag: 'asis' },
  { id: 'R10', how: 'powerOffMobile', view: view({ cabinet: 'phone-landscape', signOff: true }), surfaces: { signoff: true, home: false, player: false }, violates: [], tag: 'asis' },
  { id: 'R11', how: 'error before first frame', view: view({ playbackActive: true, tuning: true, playerError: true }), surfaces: { player: true, static: true, difficultyPlate: false }, violates: [], tag: 'asis' },
  { id: 'R12', how: 'requestTune on phone portrait, 270 ms', view: view({ cabinet: 'phone-portrait', playbackActive: true, sourceReady: true, registerRequest: true }), surfaces: { player: true, static: false }, violates: [], tag: 'asis' },
  { id: 'R13a', how: 'powerOffDesktop on plain web', view: view({}), surfaces: { blank: true }, violates: [1], tag: 'fix:WS-02' },
  { id: 'R13b', how: 'stopPlayback → openBoard → board Escape: the collapse timer is gone, the charge line stays', view: view({ stopping: true }), surfaces: { crtLine: true, home: false, board: false, player: false }, violates: [6], tag: 'fix:WS-01' },
  { id: 'R13c', how: 'stopPlayback → openBoard (within 380 ms)', view: view({ stopping: true, boardVisible: true }), surfaces: { board: true, crtLine: true }, violates: [6, 7], tag: 'fix:WS-01' },
  { id: 'R14', how: 'a link on web with no gesture', view: view({ playbackActive: true, tuning: true }), surfaces: { player: true, static: true }, violates: [], tag: 'asis' },
  { id: 'R-switch-while-watching', how: 'a server switch or TRY AGAIN with the picture live (web history Forward into /settings)', view: view({ playbackActive: true, sourceReady: true, dataLoading: true }), surfaces: { warming: true, player: false }, violates: [15], tag: 'fix:WS-16' },
  { id: 'R-signoff-link', how: 'a link during sign-off', view: view({ cabinet: 'phone-landscape', signOff: true, playbackActive: true, tuning: true }), surfaces: { signoff: true, player: false, static: false }, violates: [2], tag: 'fix:WS-21' },
];

/** Every tag in the net (rows of every kind). */
export function allTags(): Tag[] {
  return [
    ...INPUT_ROWS.map((r) => r.tag),
    ...DIAL_ROWS.map((r) => r.tag),
    ...STATION_ROWS.map((r) => r.tag),
    ...REACHABLE.map((r) => r.tag),
  ];
}
