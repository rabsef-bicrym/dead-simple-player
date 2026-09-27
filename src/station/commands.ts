/**
 * The station's input vocabulary as data.
 *
 * Every key, swipe, plate and link the cabinets accept resolves to one of
 * these commands (`remote.ts` does the resolving). This is the vocabulary
 * inputs produce today — transcribed from `app/watch.tsx:737-821`
 * (gestures), `:914-1023` (keyboard remote), `:1059-1066` (media session)
 * and the plates in the render tree (`:1194-1420`) at bead381. Nothing here
 * runs in the app yet: the station reducer (WP-07) extends this union with
 * the data, player, timer and environment commands it consumes, and WP-10
 * wires the handlers onto `remote.ts`.
 *
 * Line numbers are bead381's (`app/watch.tsx` before this package added
 * one import at :24; read +1 for anything after it).
 *
 * Indices are absolute where the code passes an index (`tuneTo(boardIndex)`,
 * `openHome(safeIndex)`, `onGate(next)`) and relative where the code uses a
 * functional setter on the latest state (`setDialIndex((i) => …)`,
 * `setBoardIndex((i) => …)`, the cursor walk).
 */

export type TuneOrigin = 'register' | 'swipe' | 'board' | 'remote' | 'gate' | 'link';
export type Dir = 1 | -1;
export type Entrance = 'none' | 'stamp' | 'expand';
/** Which shell answers the POWER jewel: `powerOffMobile` / `powerOffDesktop` (`watch.tsx:592-608`). */
export type Shell = 'phone' | 'electron' | 'web';

/** What `useCabinet()` answers (`src/hooks/useCabinet.ts:13`). */
export interface Cabinet {
  isPhone: boolean;
  landscape: boolean;
}

export type Command =
  // ── tuning ──
  /** `requestTune(index, origin)` — phone portrait blooms the register first; else `TUNE`. `:549-557` */
  | { type: 'TUNE_REQUESTED'; index: number; origin: TuneOrigin }
  /** `tuneTo(index, origin)` directly. `:491-547` */
  | { type: 'TUNE'; index: number; origin: TuneOrigin }
  /** The phone-landscape shifter: the lever throws, then the set tunes. `:612-619` */
  | { type: 'GATE'; index: number }
  /** `deadsimpleplayer://watch?channel=N` resolved to an index. `:640-673` */
  | { type: 'LINK'; index: number }
  // ── surfaces ──
  | { type: 'OPEN_HOME'; index: number; entrance: Entrance }
  | { type: 'OPEN_BOARD'; index: number }
  /** `setBoardVisible(false)` */
  | { type: 'CLOSE_BOARD' }
  /** Phone portrait: the shade rolls home (`setBoardClosing(true)`), then closes. */
  | { type: 'BOARD_CLOSING' }
  /** The drums roll one channel; scroll resets, the console cursor comes home. */
  | { type: 'BOARD_CHANNEL'; dir: Dir }
  /** A tab tap on the board's channel strip. `:1311-1314, 1369-1373` */
  | { type: 'BOARD_SELECT'; index: number }
  /** Console: walk the cursor, page at the edges (`board.ts` `stepCursor`). */
  | { type: 'BOARD_CURSOR'; dir: Dir }
  /** Phone: page only (`board.ts` `pageScroll`). */
  | { type: 'BOARD_PAGE'; dir: Dir }
  /** Wind the dial one station (wraps). */
  | { type: 'DIAL'; dir: Dir }
  /** Rest the dial on a station (a plate tap). */
  | { type: 'DIAL_SET'; index: number }
  | { type: 'STOP' }
  | { type: 'POWER_OFF'; shell: Shell }
  /** A tap on the sign-off card. `:1336-1339` */
  | { type: 'WAKE' }
  | { type: 'SERVICE' }
  /** Programme notes: the cursor's row, what is on now, or close (`null`). */
  | { type: 'NOTES'; programme: 'now' | 'cursor' | null }
  // ── chrome ──
  /** Enter / i: raise the apron for four seconds. */
  | { type: 'HUD_SHOW' }
  /** A tap on the picture: apron up or down. `:823-830` */
  | { type: 'HUD_TOGGLE' }
  /** p / P: PICTURE OUT when the cabinet offers it. */
  | { type: 'PICTURE_OUT' };
