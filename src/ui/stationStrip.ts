import { engravedWidth } from './engraverFit';

/**
 * The station strip — a row of small stamped tabs, one per station.
 *
 * It was drawn for six stations on a laptop. With ten it ran off the right
 * edge and pushed its own caption out of the cabinet. The strip is fitted the
 * way a plate is engraved (`engraverFit.ts`), but all the tabs are cut alike,
 * because a strip whose tabs differ in size reads as a mistake:
 *
 *   as drawn, on one row; then the tracking closed and the tabs drawn in;
 *   then a smaller cut; and when one row will not take them at the smallest
 *   cut, a second row at the size they were drawn (the break buys it back).
 *
 * No name is ever shortened. Pure: widths come from Besley's advances.
 */

export interface StripCut {
  fontSize: number;
  letterSpacing: number;
  /** Side padding inside a tab. */
  padX: number;
  /** Gap between tabs, and between rows. */
  gap: number;
}

/** The cuts, in order of resort. The first is the strip as drawn. */
export const STRIP_CUTS: readonly StripCut[] = [
  { fontSize: 9, letterSpacing: 1.4, padX: 12, gap: 8 },
  { fontSize: 9, letterSpacing: 1, padX: 10, gap: 6 },
  { fontSize: 8.5, letterSpacing: 0.9, padX: 9, gap: 6 },
  { fontSize: 8, letterSpacing: 0.8, padX: 8, gap: 5 },
];

/** A tab's hairline border, both sides. */
const TAB_BORDER = 2;

/** The width of one tab at a cut, border to border. */
export function tabWidth(label: string, cut: StripCut): number {
  return engravedWidth(label, cut.fontSize, cut.letterSpacing, 700) + cut.padX * 2 + TAB_BORDER;
}

function rowWidth(widths: number[], gap: number): number {
  return widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
}

/** Fill rows left to right, breaking when the next tab would pass `capacity`. */
function fill(widths: number[], gap: number, capacity: number): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const next = used + (row.length ? gap : 0) + w;
    if (row.length && next > capacity) {
      rows.push(row);
      row = [i];
      used = w;
    } else {
      row.push(i);
      used = next;
    }
  });
  if (row.length) rows.push(row);
  return rows;
}

/**
 * Break the tabs, in order, into at most `count` rows no wider than `width`,
 * with the rows as near alike in width as they can be. Null if they will not go.
 */
function balanced(widths: number[], gap: number, width: number, count: number): number[][] | null {
  const widest = Math.max(...widths);
  if (widest > width || fill(widths, gap, width).length > count) return null;
  // The narrowest capacity that still needs no more than `count` rows.
  let low = widest;
  let high = width;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (fill(widths, gap, mid).length <= count) high = mid;
    else low = mid;
  }
  return fill(widths, gap, high);
}

export interface StripFit {
  /** Indices into `labels`, row by row, in order. */
  rows: number[][];
  cut: StripCut;
  /** The widest row, in px. */
  width: number;
  /** False only when a single tab is wider than the room at the smallest cut; the caller may then clip. */
  fits: boolean;
}

/** Fit the station tabs to `width` px of room. */
export function fitStationStrip(labels: string[], width: number): StripFit {
  const asDrawn = STRIP_CUTS[0];
  if (labels.length === 0) return { rows: [], cut: asDrawn, width: 0, fits: true };

  const measure = (cut: StripCut) => labels.map((label) => tabWidth(label, cut));
  const answer = (rows: number[][], cut: StripCut, widths: number[], fits: boolean): StripFit => ({
    rows,
    cut,
    width: Math.max(...rows.map((row) => rowWidth(row.map((i) => widths[i]), cut.gap))),
    fits,
  });

  // One row, at the first cut that takes it.
  for (const cut of STRIP_CUTS) {
    const widths = measure(cut);
    if (rowWidth(widths, cut.gap) <= width) {
      return answer([labels.map((_, i) => i)], cut, widths, true);
    }
  }
  // More rows; each added row is tried from the drawn size down.
  for (let count = 2; count <= labels.length; count += 1) {
    for (const cut of STRIP_CUTS) {
      const widths = measure(cut);
      const rows = balanced(widths, cut.gap, width, count);
      if (rows) return answer(rows, cut, widths, true);
    }
  }
  // A single name wider than the whole strip: one to a row, smallest cut.
  const smallest = STRIP_CUTS[STRIP_CUTS.length - 1];
  return answer(labels.map((_, i) => [i]), smallest, measure(smallest), false);
}
