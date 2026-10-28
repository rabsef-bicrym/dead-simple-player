import type { Programme } from '../types';
import { clockShort } from '../utils/clock';
import { boardTitle } from './evening';

export interface BoardRow {
  time: string;
  title: string;
  year: string;
  note: string;
  live: boolean;
  past: boolean;
  next: boolean;
  prog?: Programme;
}

export const BLANK_BOARD_ROW: BoardRow = {
  time: '', title: '', year: '', note: '', live: false, past: false, next: false,
};

/** Both cabinets show two past airings above the live row, plus any paging. */
export function boardRows(
  evening: readonly Programme[],
  now: Date,
  scroll: number,
  rowCount: number,
): BoardRow[] {
  const time = now.getTime();
  const liveIndex = evening.findIndex((p) => p.start.getTime() <= time && p.stop.getTime() > time);
  const start = (liveIndex < 0 ? 0 : liveIndex - 2) + scroll;
  return Array.from({ length: rowCount }, (_, row) => {
    const index = start + row;
    const programme = index >= 0 ? evening[index] : undefined;
    if (!programme) return BLANK_BOARD_ROW;
    return {
      time: clockShort(programme.start),
      title: boardTitle(programme),
      year: programme.year ?? '',
      note: programme.description ?? '',
      live: index === liveIndex,
      past: liveIndex >= 0 && index < liveIndex,
      next: index === liveIndex + 1,
      prog: programme,
    };
  });
}
