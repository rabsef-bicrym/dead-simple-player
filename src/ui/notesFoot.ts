/**
 * The foot of the programme notes, on a narrow glass.
 *
 * The console's foot strip says a whole sentence, draws a progress rule and
 * shows the clock. A phone held upright has room for perhaps two of the
 * three, and left to the platform the sentence folds onto a second line.
 * The strip is one line or it is nothing, so the choice is made here, before
 * anything is drawn: the clock has already gone (the phone carries its own);
 * the sentence is then said as fully as it can be WITH a rule worth drawing
 * beside it; only when no way of saying it leaves room for the rule does the
 * rule go too.
 *
 * Pure. The widths are Newsreader's own advances (`blurbFit.ts`), which err
 * a little wide at the strip's size, so the answer errs short.
 */

import { spokenWidth } from './blurbFit';

export interface FootLine {
  text: string;
  /** Is there room for the progress rule beside it? */
  rule: boolean;
}

export interface FootLineOptions {
  fontSize: number;
  /** The gap between the sentence and the rule. */
  gap: number;
  /** A rule shorter than this is not worth drawing. */
  minRule: number;
}

/**
 * Choose what the foot strip says in `room` px.
 *
 * `sayings` are the same thing said at decreasing length, fullest first:
 * "the picture continues beneath · ends at 10:45", then "ends at 10:45".
 * The fullest that leaves the rule its room wins; failing that, the fullest
 * that fits alone; failing that, the shortest, and the caller clips.
 */
export function footLine(sayings: string[], room: number, o: FootLineOptions): FootLine {
  const said = sayings.filter(Boolean);
  if (said.length === 0) return { text: '', rule: room >= o.minRule };
  const width = (s: string) => spokenWidth(s, o.fontSize);

  const withRule = said.find((s) => width(s) + o.gap + o.minRule <= room);
  if (withRule) return { text: withRule, rule: true };

  const alone = said.find((s) => width(s) <= room);
  return { text: alone ?? said[said.length - 1], rule: false };
}
