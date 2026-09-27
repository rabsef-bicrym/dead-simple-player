/**
 * The board's arithmetic, declared once.
 *
 * `app/watch.tsx` repeats these literals at nine sites (cursor bound `< 7`
 * and `> 0`, scroll cap 30, scroll floor -8, cursor home 2, the wrap
 * formula, the bounded step) and silently assumes the DS-6 board: the
 * `< 7` is `ROWS - 1` of the eight-row console board (`Board.tsx:25`), and
 * the phone path runs the same bound although the DS-8/M board has seven
 * rows (`MBoard.tsx:31`). WS-08. Every helper here pins what the code does
 * today; the one bug (the phone's row count) is a parameter, not a change.
 *
 * Line numbers are bead381's (`app/watch.tsx` before this package added
 * one import at :24; read +1 for anything after it).
 */

import type { Dir } from './commands';

/** Rows on the DS-6 departure board. `src/components/ds6/Board.tsx:25`. */
export const ROWS_DS6 = 8;
/** Rows on the DS-8/M board and shade. `src/components/ds8m/MBoard.tsx:31`. */
export const ROWS_DS8M = 7;
/** Paging floor: two past airings above the live row, six pages back. `watch.tsx:759, 797, 941`. */
export const SCROLL_MIN = -8;
/** Paging cap. `watch.tsx:757, 759, 794, 937`. */
export const SCROLL_MAX = 30;
/** Where the cursor rests when the drums roll to a new channel. `watch.tsx:117, 580, 791, 928, 933, 1372`. */
export const CURSOR_HOME = 2;


/** `Math.min(s + 1, 30)` / `Math.max(s - 1, -8)` — the one-sided clamps the code applies per step. */
export function clampScroll(scroll: number): number {
  return Math.max(SCROLL_MIN, Math.min(SCROLL_MAX, scroll));
}

/** Page the board one step; the scroll never leaves `[SCROLL_MIN, SCROLL_MAX]`. */
export function pageScroll(scroll: number, dir: Dir): number {
  return clampScroll(scroll + dir);
}

/**
 * Walk the cursor through the evening, paging at the edges.
 *
 * `watch.tsx:936-941` (keys) and `:793-797` (console swipe): forward moves
 * the cursor while `cursor < rows - 1`, else pages; back moves the cursor
 * while `cursor > 0`, else pages. Today both cabinets pass `ROWS_DS6`
 * (the literal 7 is `ROWS_DS6 - 1`); the station reducer passes
 * `ROWS_DS8M` for the phone. Pinned `asis` in `matrix.ts`.
 */
export function stepCursor(
  cursor: number,
  scroll: number,
  dir: Dir,
  rows: number,
): { cursor: number; scroll: number } {
  if (dir === 1) {
    return cursor < rows - 1
      ? { cursor: cursor + 1, scroll }
      : { cursor, scroll: pageScroll(scroll, 1) };
  }
  return cursor > 0
    ? { cursor: cursor - 1, scroll }
    : { cursor, scroll: pageScroll(scroll, -1) };
}

/**
 * `(i + dir + n) % n` — the wrap the dial, the board drums and the phone
 * swipes use (`watch.tsx:752, 768, 778, 789, 806, 926, 931, 968, 972`;
 * `MBoard.tsx:247-248`). Written so any integer wraps, not only `i ± 1`.
 * With no channels the code's formula yields NaN; the board and dial never
 * render with an empty array (the DIFFICULTY card sits above them,
 * `watch.tsx:1078`), and this helper answers 0 there.
 */
export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}

/**
 * The bounded step: `if (safeIndex < channels.length - 1) …` /
 * `if (safeIndex > 0) …` (`watch.tsx:989-993, 816-819, 1061-1064`).
 * `null` at the end of the dial — nothing tunes.
 */
export function boundedStep(i: number, dir: Dir, n: number): number | null {
  const next = i + dir;
  return next < 0 || next > n - 1 ? null : next;
}
