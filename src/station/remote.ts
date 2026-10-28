/**
 * The remote, as a table.
 *
 * `keyToCommand` transcribes the keyboard remote (`app/watch.tsx:914-1023`)
 * and the rulings table 1.3 row by row; `swipeToCommand` transcribes the
 * pan handler (`:737-821`); `mediaSessionToCommand` the lock-screen keys
 * (`:1059-1066`). `DIAL_END_POLICY` codifies today's split between a dial
 * that has ends and a register that wraps (decision 9: no behaviour
 * change). `keyboardShouldIgnore` is PW-01's guard, not yet wired (WP-06).
 *
 * Every branch cites the line it transcribes. Where the code is odd the
 * oddity is kept and named: the table is an oracle for later packages, not
 * an opinion. The watch screen uses swipeToCommand; the keyboard and
 * media-session tables remain oracles for their existing handlers.
 *
 * Line numbers are bead381's (`app/watch.tsx` before this package added
 * one import at :24; read +1 for anything after it).
 */

import { boundedStep, wrapIndex } from './board';
import type { Cabinet, Command, Dir } from './commands';

/**
 * Where the set is. The handlers route by `boardVisible` first, then
 * `homeVisible`, and fall through to the watching vocabulary for every
 * other base — `stopping`, `off` (the blank of WS-01/WS-02) and, on the
 * keyboard, `signoff` — because neither handler has a branch for those
 * (`:920, :962, :988`; `:747` is the gesture handler's only sign-off guard).
 * `warming` and `difficulty` are early returns above the tree
 * (`:1069, :1078`); the flags beneath them still route keys today, which
 * is why they are not modes here.
 */
export type Base = 'home' | 'watching' | 'stopping' | 'signoff' | 'off';

export interface Mode {
  base: Base;
  /** `boardVisible` */
  board: boolean;
  /** `detailProgramme !== null` */
  notes: boolean;
  /** `safeIndex` — the tuned station. `:331` */
  index: number;
  /** `dialIndex` */
  dial: number;
  /** `boardIndex` */
  boardIndex: number;
  /** `channels.length` */
  count: number;
  /** `pictureOutAvailable` — PICTURE OUT is offered. `:1012-1014` */
  pictureOutAvailable?: boolean;
  /** `boardCursorProg.current !== null` — a programme sits under the cursor. Absent means yes. `:946` */
  cursorProgramme?: boolean;
  /** `nowPlaying !== null` — something is on. Absent means yes. `:833-835` */
  nowPlaying?: boolean;
}

/** Shared threshold for runtime swipe routing and the input matrix. */
export const SWIPE_THRESHOLD = 70;

export interface Swipe {
  /** `translationX` */
  dx: number;
  /** `translationY` */
  dy: number;
  /** `nativeEvent.state === State.END` — the handler acts on nothing else. `:738` */
  ended?: boolean;
}

/** The keys the remote answers. Anything else falls through every switch. */
export const REMOTE_KEYS = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Enter', 'Escape', 'g', 'h', 'l', 'i', 'n', 'p', 'P', 's',
] as const;

function phonePortrait(cabinet: Cabinet): boolean {
  return cabinet.isPhone && !cabinet.landscape;
}

/** `app/watch.tsx:914-1023`, row by row. `null` is a key nothing answers. */
export function keyToCommand(mode: Mode, key: string, cabinet: Cabinet): Command | null {
  // While the notes are projected, the arrows belong to them. `:919`
  if (mode.notes && key.startsWith('Arrow')) return null;

  if (mode.board) {
    // `:920-961`
    switch (key) {
      case 'ArrowRight': return { type: 'BOARD_CHANNEL', dir: 1 };        // :925-929
      case 'ArrowLeft': return { type: 'BOARD_CHANNEL', dir: -1 };        // :930-934
      case 'ArrowDown': return { type: 'BOARD_CURSOR', dir: 1 };          // :935-938
      case 'ArrowUp': return { type: 'BOARD_CURSOR', dir: -1 };           // :939-942
      case 'n':                                                            // :943-946
        if (mode.notes) return { type: 'NOTES', programme: null };
        // Nothing under the cursor: a dead press (`:946` guards on boardCursorProg.current).
        return mode.cursorProgramme === false ? null : { type: 'NOTES', programme: 'cursor' };
      case 'Enter': return { type: 'TUNE', index: mode.boardIndex, origin: 'board' }; // :947-949
      case 'g':
      case 'Escape':                                                       // :950-955
        if (mode.notes) return { type: 'NOTES', programme: null };
        return phonePortrait(cabinet) ? { type: 'BOARD_CLOSING' } : { type: 'CLOSE_BOARD' };
      case 'h':
      case 'l': return { type: 'OPEN_HOME', index: mode.boardIndex, entrance: 'none' }; // :956-959
      default: return null;
    }
  }

  if (mode.base === 'home') {
    // `:962-986`
    switch (key) {
      case 'ArrowRight':
      case 'ArrowDown': return { type: 'DIAL', dir: 1 };                  // :966-969
      case 'ArrowLeft':
      case 'ArrowUp': return { type: 'DIAL', dir: -1 };                   // :970-973
      case 'Enter': return { type: 'TUNE_REQUESTED', index: mode.dial, origin: 'remote' }; // :974-976
      case 'g': return { type: 'OPEN_BOARD', index: mode.dial };          // :977-979
      case 's': return { type: 'SERVICE' };                                // :980-982
      case 'Escape': return null;                                          // :983-984 — a dead case
      default: return null;
    }
  }

  // Watching — and every base the handler has no branch for. `:988-1019`
  switch (key) {
    case 'ArrowUp': {                                                      // :989-991 bounded
      const next = boundedStep(mode.index, 1, mode.count);
      return next === null ? null : { type: 'TUNE_REQUESTED', index: next, origin: 'remote' };
    }
    case 'ArrowDown': {                                                    // :992-994 bounded
      const next = boundedStep(mode.index, -1, mode.count);
      return next === null ? null : { type: 'TUNE_REQUESTED', index: next, origin: 'remote' };
    }
    case 'Enter':
    case 'i': return { type: 'HUD_SHOW' };                                 // :995-998
    case 'g': return { type: 'OPEN_BOARD', index: mode.index };            // :999-1001
    case 'l':
    case 'h': return { type: 'STOP' };                                     // :1002-1005
    case 'n':                                                              // :1006-1010
      if (mode.notes) return { type: 'NOTES', programme: null };
      // Nothing on: openNotes does nothing (`:833-835` guards on nowPlaying).
      return mode.nowPlaying === false ? null : { type: 'NOTES', programme: 'now' };
    case 'p':
    case 'P': return mode.pictureOutAvailable ? { type: 'PICTURE_OUT' } : null; // :1011-1014
    case 'Escape':                                                         // :1015-1018
      return mode.notes ? { type: 'NOTES', programme: null } : { type: 'STOP' };
    default: return null;
  }
}

type SwipeMode = Pick<Mode, 'base' | 'board' | 'notes' | 'index' | 'dial' | 'count'>;

type SwipeCommand = Extract<Command, { type:
  | 'BOARD_CHANNEL' | 'BOARD_CURSOR' | 'BOARD_PAGE' | 'BOARD_CLOSING'
  | 'DIAL' | 'GATE' | 'TUNE' | 'TUNE_REQUESTED' | 'OPEN_HOME' | 'OPEN_BOARD'
}>;

/** The board accepts exactly 70 points horizontally; vertical paging needs more. */
function boardSwipe(dx: number, dy: number, horizontal: boolean, cabinet: Cabinet): SwipeCommand | null {
  if (horizontal) {
    if (Math.abs(dx) < SWIPE_THRESHOLD) return null;
    return { type: 'BOARD_CHANNEL', dir: dx < 0 ? 1 : -1 };
  }
  const dir = dy < -SWIPE_THRESHOLD ? 1 : dy > SWIPE_THRESHOLD ? -1 : null;
  if (dir === null) return null;
  if (!cabinet.isPhone) return { type: 'BOARD_CURSOR', dir };
  if (cabinet.landscape) return { type: 'BOARD_PAGE', dir };
  // Keep today's portrait vocabulary: up closes, down pages forward.
  return dir === 1 ? { type: 'BOARD_CLOSING' } : { type: 'BOARD_PAGE', dir: 1 };
}

function homeSwipe(mode: SwipeMode, dx: number, horizontal: boolean, cabinet: Cabinet): SwipeCommand | null {
  if (!horizontal || Math.abs(dx) <= SWIPE_THRESHOLD) return null;
  const dir = dx < 0 ? 1 : -1;
  if (!cabinet.isPhone) return { type: 'DIAL', dir };
  if (cabinet.landscape) return { type: 'GATE', index: wrapIndex(mode.dial + dir, mode.count) };
  return null; // portrait: the column is the input
}

function watchingSwipe(mode: SwipeMode, dx: number, dy: number, horizontal: boolean, cabinet: Cabinet): SwipeCommand | null {
  if (cabinet.isPhone) {
    if (!horizontal || Math.abs(dx) <= SWIPE_THRESHOLD) return null;
    const dir = dx < 0 ? 1 : -1;
    return { type: 'TUNE_REQUESTED', index: wrapIndex(mode.index + dir, mode.count), origin: 'swipe' };
  }
  if (horizontal) {
    if (dx < -SWIPE_THRESHOLD) return { type: 'OPEN_HOME', index: mode.index, entrance: 'none' };
    if (dx > SWIPE_THRESHOLD) return { type: 'OPEN_BOARD', index: mode.index };
    return null;
  }
  const dir = dy < -SWIPE_THRESHOLD ? 1 : dy > SWIPE_THRESHOLD ? -1 : null;
  if (dir === null) return null;
  const next = boundedStep(mode.index, dir, mode.count);
  return next === null ? null : { type: 'TUNE', index: next, origin: 'swipe' };
}

/** Route a completed swipe by surface, retaining the current cabinet-specific vocabulary. */
export function swipeToCommand(mode: SwipeMode, swipe: Swipe, cabinet: Cabinet): SwipeCommand | null {
  if (swipe.ended === false || mode.notes) return null;
  if (cabinet.isPhone && mode.base === 'signoff') return null;
  const { dx, dy } = swipe;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  if (mode.board) return boardSwipe(dx, dy, horizontal, cabinet);
  if (mode.base === 'home') return homeSwipe(mode, dx, horizontal, cabinet);
  // Stopping, off, and console sign-off retain the watching vocabulary.
  return watchingSwipe(mode, dx, dy, horizontal, cabinet);
}

export type MediaSessionAction = 'previoustrack' | 'nexttrack';

/** `app/watch.tsx:1059-1066` — the lock-screen keys are a bounded dial. */
export function mediaSessionToCommand(mode: Mode, action: MediaSessionAction): Command | null {
  const next = boundedStep(mode.index, action === 'nexttrack' ? 1 : -1, mode.count);
  return next === null ? null : { type: 'TUNE_REQUESTED', index: next, origin: 'remote' };
}

// ── Dial ends (decision 9: codify today's split in one table) ──

/** Every input site that steps the tuned station or the dial. */
export type TuneStepOrigin =
  /** ↑/↓ while watching. `:989-993` */
  | 'keyboard-watching'
  /** Lock-screen previous/next. `:1060-1065` */
  | 'media-session'
  /** Console vertical swipe while watching. `:816-819` */
  | 'console-swipe-watching'
  /** Arrows at the receiver. `:966-973` */
  | 'home-keys'
  /** Console sideways swipe at the receiver. `:804-807` */
  | 'home-swipe'
  /** ←/→ at the board. `:926-931` */
  | 'board-keys'
  /** Sideways swipe at the board, either cabinet. `:752, :789` */
  | 'board-swipe'
  /** Phone-landscape shifter swipe (the gate). `:768` */
  | 'shifter'
  /** Phone sideways swipe while watching. `:778` */
  | 'phone-swipe-watching'
  /** The portrait register column: rows are addressed, never stepped. `MHome.tsx` */
  | 'column';

export type DialEndPolicy = 'bounded' | 'wrapping';

/** The console remote and keyboard have ends; the board, dial and phone wrap. */
export const DIAL_END_POLICY: Readonly<Record<TuneStepOrigin, DialEndPolicy>> = {
  'keyboard-watching': 'bounded',
  'media-session': 'bounded',
  'console-swipe-watching': 'bounded',
  'home-keys': 'wrapping',
  'home-swipe': 'wrapping',
  'board-keys': 'wrapping',
  'board-swipe': 'wrapping',
  shifter: 'wrapping',
  'phone-swipe-watching': 'wrapping',
  column: 'wrapping',
};

export function dialEndPolicy(origin: TuneStepOrigin): DialEndPolicy {
  return DIAL_END_POLICY[origin];
}

/** Step an index the way its input site does; `null` past a bounded end. */
export function stepIndex(i: number, dir: Dir, n: number, origin: TuneStepOrigin): number | null {
  return dialEndPolicy(origin) === 'bounded' ? boundedStep(i, dir, n) : wrapIndex(i + dir, n);
}

// ── The keyboard guard (PW-01; wired in WP-06) ──

/** The parts of a `KeyboardEvent` the guard reads; structural so a test needs no DOM. */
export interface KeyLike {
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** read by nobody: shift is not a modifier here */
  shiftKey?: boolean;
  target?: unknown;
}

function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
}

/**
 * The remote stays quiet when the screen is not focused (the Service Panel
 * keeps `watch` mounted beneath it on web), on a held key (one tune, not a
 * pipeline teardown per repeat), under a modifier (Cmd+L is the address
 * bar, not STOP) and while a field has the keyboard. Shift is not a
 * modifier here: `P` is a key of its own.
 */
export function keyboardShouldIgnore(e: KeyLike, focused: boolean): boolean {
  if (!focused) return true;
  if (e.repeat === true || e.metaKey === true || e.ctrlKey === true || e.altKey === true) return true;
  return isEditableTarget(e.target);
}
