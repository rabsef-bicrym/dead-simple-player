/**
 * The portable's plate arithmetic.
 *
 * The traveling set was drawn for six stations with one-digit numbers and
 * short names. It carries ten now, one of them numbered 19 and one called
 * For Your Information. These are the small judgments the cabinet makes so
 * that every numeral and every name still reads whole: how a numeral sits in
 * its column, how a row of legends is cut to one size, how a blurb is
 * shortened. All of it rests on the engraver's fit (src/ui/engraverFit.ts)
 * and all of it is pure, so the same answer comes out on the phone and in
 * the web review.
 */

import { engrave, engravedWidth, wordBreaks, type Engraving } from '../../ui/engraverFit';

// ── numerals ──

export interface NumeralCut {
  fontSize: number;
  /** The width to give the numeral's box. Never less than the column. */
  width: number;
  /** How far the box overhangs the column on each side, so the centre axis holds. */
  bleed: number;
}

/**
 * Seat a station numeral in a column drawn for one digit.
 *
 * A single digit is left exactly as designed. A wider numeral keeps the
 * designed size and overhangs the column equally left and right, so "19"
 * stands on the same centre line as "9" and at the same height. Only when
 * the overhang would pass `maxBleed` a side is the numeral cut smaller.
 * The widths are taken at the bold weight, which is the wider, so the box
 * errs roomy and the numeral can never fold onto a second line.
 */
export function numeralCut(
  numeral: string | number,
  column: number,
  fontSize: number,
  maxBleed = 3,
): NumeralCut {
  const text = String(numeral);
  const need = (size: number) => Math.ceil(engravedWidth(text, size, 0, 700) + 1);
  if (need(fontSize) <= column) return { fontSize, width: column, bleed: 0 };

  const floor = fontSize * 0.6;
  let size = fontSize;
  while (need(size) > column + 2 * maxBleed && size - 0.5 >= floor) size -= 0.5;
  const width = Math.max(column, need(size));
  return { fontSize: size, width, bleed: (width - column) / 2 };
}

// ── one line of plate capitals ──

export interface LineCut {
  fontSize: number;
  letterSpacing: number;
  fits: boolean;
}

/**
 * Cut one line of plate capitals to a width: the designed size and tracking
 * if they go, the tracking closed to half, then a smaller size. For kickers
 * and tabs, which never break.
 */
export function lineCut(
  text: string,
  width: number,
  fontSize: number,
  letterSpacing: number,
  minFontSize: number,
  weight: 400 | 700 = 700,
): LineCut {
  const e = engrave(text, width, {
    fontSize,
    minFontSize,
    tracking: (size) => (letterSpacing * size) / fontSize,
    minTrackingRatio: 0.5,
    weight,
    margin: 1,
  });
  return { fontSize: e.fontSize, letterSpacing: e.letterSpacing, fits: e.fits };
}

// ── the gate legend ──

export interface GateLegend {
  /** The one size every name on the plate is cut at. */
  fontSize: number;
  /** One engraving per name, in order: one line, or two broken at a word. */
  names: Engraving[];
  /** False only when even the smallest cut overruns a column. */
  fits: boolean;
}

export interface GateLegendOptions {
  /** The size the legend is cut at when the columns are wide enough. */
  fontSize: number;
  /** The smallest size the legend may be cut at. */
  minFontSize: number;
  /** Tracking at a given size. */
  tracking: (fontSize: number) => number;
  /** How far a name's tracking may close before it is broken at a word instead. */
  minTrackingRatio: number;
  /** How far it may close when breaking does not help: one long word. Defaults to `minTrackingRatio`. */
  lastResortTrackingRatio?: number;
}

/**
 * Cut the names round a gear-shift gate.
 *
 * A pattern plate is engraved at one size: ten legends at ten sizes would
 * read as ten plates. So the legend is cut at the largest size at which
 * every name goes into its column, each name on one line if it can and
 * broken at a word if it cannot ("FOR YOUR / INFORMATION"). A name closes
 * its own tracking a little before it breaks, and a single long word, which
 * cannot break, may close it further; the size comes down only for all of
 * them together.
 */
export function gateLegend(names: string[], column: number, o: GateLegendOptions): GateLegend {
  const cutName = (name: string, size: number, minTrackingRatio: number) => engrave(name, column, {
    fontSize: size,
    minFontSize: size,
    tracking: o.tracking,
    minTrackingRatio,
    twoLines: true,
  });
  const lastResort = o.lastResortTrackingRatio ?? o.minTrackingRatio;
  const cutAt = (size: number) => names.map((name) => {
    const easy = cutName(name, size, o.minTrackingRatio);
    return easy.fits || lastResort >= o.minTrackingRatio ? easy : cutName(name, size, lastResort);
  });
  const floor = Math.min(o.minFontSize, o.fontSize);
  for (let size = o.fontSize; size >= floor - 1e-9; size -= 0.5) {
    const cut = cutAt(size);
    if (cut.every((e) => e.fits)) return { fontSize: size, names: cut, fits: true };
  }
  return { fontSize: floor, names: cutAt(floor), fits: false };
}

/**
 * The narrowest column in which `gateLegend` can cut every name at its
 * smallest size: the widest thing that cannot be made narrower, be it one
 * long word or the longer half of a broken name, at the closest tracking.
 * The gate plate is drawn at least wide enough for this, so the legend is
 * whole by construction and not by the luck of the station list.
 */
export function gateLegendColumn(names: string[], o: GateLegendOptions): number {
  const size = Math.min(o.minFontSize, o.fontSize);
  const tracking = o.tracking(size) * Math.min(o.minTrackingRatio, o.lastResortTrackingRatio ?? o.minTrackingRatio);
  const width = (line: string) => engravedWidth(line, size, tracking);
  return names.reduce((need, name) => {
    const whole = width(name.trim());
    const broken = wordBreaks(name).map(([a, b]) => Math.max(width(a), width(b)));
    return Math.max(need, Math.min(whole, ...broken));
  }, 0);
}

// ── blurbs ──

/** What a sentence may end in, and what may close it. None of it belongs before an ellipsis. */
const TRAILING = /[\s.,;:!?…—–\-"'”’)\]]+$/u;
/** A sentence's end inside running text: its stop, any closing quote, then a space. */
const SENTENCE_END = /[.!?]["'”’)\]]*\s/gu;
/** The same, at the very end of the kept text. */
const ENDS_SENTENCE = /[.!?]["'”’)\]]*$/u;
/** A new sentence's first word or two, left hanging at the cut, are dropped: "…a gun…", not "…a gun. It…". */
const ORPHAN_CHARS = 10;

/**
 * Shorten a programme blurb to about `maxChars` characters.
 *
 * Paragraph breaks are read as spaces: the panel is one short paragraph.
 * A blurb that fits is returned whole, with its own full stop and no dots.
 * One that does not is cut back to a whole word, any sentence punctuation
 * left hanging on that word is taken off, and a single ellipsis character
 * is set against it: "…pick up a gun…", never "gun....". The first word or
 * two of a new sentence are not left dangling before the dots.
 */
export function shortenBlurb(text: string, maxChars: number): string {
  const whole = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(whole);
  if (chars.length <= maxChars) return whole;

  const room = Math.max(1, maxChars - 1);
  let kept = chars.slice(0, room).join('');
  // Mid-word? Go back to the last whole word, unless the blurb is one long word.
  if (chars[room] !== ' ' && !kept.endsWith(' ')) {
    const space = kept.lastIndexOf(' ');
    if (space > 0) kept = kept.slice(0, space);
  }
  kept = kept.trimEnd();
  // If the cut falls just inside a new sentence, end on the one before it.
  if (!ENDS_SENTENCE.test(kept)) {
    let lastEnd = -1;
    for (const m of kept.matchAll(SENTENCE_END)) lastEnd = m.index + m[0].length;
    if (lastEnd > 0 && kept.length - lastEnd <= ORPHAN_CHARS && lastEnd > kept.length / 2) {
      kept = kept.slice(0, lastEnd);
    }
  }
  return `${kept.replace(TRAILING, '')}…`;
}

/**
 * How many characters of running Newsreader go into `lines` lines of a
 * column `width` px wide. Deliberately a little short (0.48 em a character,
 * where the face averages nearer 0.46, and a few characters lost to the
 * ragged edge), so the cut is ours and the platform's own line clamp is
 * only a net beneath it.
 */
export function blurbBudget(width: number, fontSize: number, lines: number): number {
  return Math.max(0, Math.floor((lines * width) / (fontSize * 0.48)) - 8);
}

// ── the board's channel tabs ──

export interface TabLabel {
  /** What stands before the name and never parts from its first word: "19 · ". */
  prefix: string;
  name: string;
}

export interface TabStripOptions {
  fontSize: number;
  /** Designed tracking; it may close to half of this. */
  letterSpacing: number;
  /** A tab's side padding and the gap between plates, as drawn. */
  pad: number;
  gap: number;
  /** The same two when the furniture has to yield. */
  tightPad: number;
  tightGap: number;
  /** Border, both sides together. */
  border: number;
  /** How many gaps the strip holds (the arrows at either end have one each). */
  gaps: number;
}

export interface TabStrip {
  pad: number;
  gap: number;
  letterSpacing: number;
  /** One or two lines for each tab, in order. */
  tabs: string[][];
  /** True when the strip is exactly as drawn: nothing yielded, nothing broke. */
  asDrawn: boolean;
  /** False only when every resort is spent and a label still overruns. */
  fits: boolean;
}

/** A break is worth making only if the tab comes out this much narrower. */
const WORTHWHILE_BREAK = 0.8;

/**
 * Lay out the three channel tabs on the This Evening board in the room
 * between its two arrows.
 *
 * With six stations the three names always went. With "For Your
 * Information" and "Public 19" in the ring they often do not, and the far
 * arrow was pushed off the glass. Order of resort, the same spirit as the
 * engraver's: as drawn; then the furniture yields (less padding, closer
 * plates); then the tracking closes, to half at most; then the widest name
 * is broken at a word, and the next, each break buying the padding and the
 * tracking back if it can. The letters themselves are never cut smaller:
 * they are at the floor already.
 */
export function tabStrip(labels: TabLabel[], room: number, o: TabStripOptions): TabStrip {
  const whole = labels.map((l) => [`${l.prefix}${l.name}`]);
  const lineW = (line: string, t: number) => engravedWidth(line, o.fontSize, t) + 1.5;
  const need = (tabs: string[][], pad: number, gap: number, t: number) =>
    tabs.reduce((sum, lines) => sum + Math.max(...lines.map((l) => lineW(l, t))) + 2 * pad + o.border, 0)
    + o.gaps * gap;

  const tryTabs = (tabs: string[][], drawn: boolean): TabStrip | null => {
    if (need(tabs, o.pad, o.gap, o.letterSpacing) <= room) {
      return { pad: o.pad, gap: o.gap, letterSpacing: o.letterSpacing, tabs, asDrawn: drawn, fits: true };
    }
    if (need(tabs, o.tightPad, o.tightGap, o.letterSpacing) <= room) {
      return { pad: o.tightPad, gap: o.tightGap, letterSpacing: o.letterSpacing, tabs, asDrawn: false, fits: true };
    }
    // Close the tracking a tenth at a time: the widest that goes.
    for (let t = o.letterSpacing - 0.1; t >= o.letterSpacing / 2 - 1e-9; t -= 0.1) {
      const tracking = Math.round(t * 10) / 10;
      if (need(tabs, o.tightPad, o.tightGap, tracking) <= room) {
        return { pad: o.tightPad, gap: o.tightGap, letterSpacing: tracking, tabs, asDrawn: false, fits: true };
      }
    }
    return null;
  };

  const drawn = tryTabs(whole, true);
  if (drawn) return drawn;

  // Break the widest name that has a break worth making, then the next.
  const tabs = whole.map((lines) => [...lines]);
  const broken = new Set<number>();
  for (;;) {
    let widest = -1;
    let pair: [string, string] | null = null;
    labels.forEach((label, i) => {
      if (broken.has(i)) return;
      const one = lineW(whole[i][0], 0);
      const best = wordBreaks(label.name)
        .map(([a, b]): [string, string] => [`${label.prefix}${a}`, b])
        .map((p) => ({ p, w: Math.max(lineW(p[0], 0), lineW(p[1], 0)) }))
        .sort((x, y) => x.w - y.w)[0];
      if (!best || best.w > one * WORTHWHILE_BREAK) return;
      if (widest < 0 || one > lineW(whole[widest][0], 0)) {
        widest = i;
        pair = best.p;
      }
    });
    if (widest < 0 || !pair) break;
    broken.add(widest);
    tabs[widest] = pair;
    const fitted = tryTabs(tabs.map((lines) => [...lines]), false);
    if (fitted) return fitted;
  }

  return {
    pad: o.tightPad,
    gap: o.tightGap,
    letterSpacing: o.letterSpacing / 2,
    tabs,
    asDrawn: false,
    fits: false,
  };
}

// ── "Then comes …" ──

export interface ThenComes {
  title: string;
  when: string;
}

/** "Then comes " + ", at " + the full stop. */
const THEN_FURNITURE = 'Then comes , at .'.length;

/**
 * What follows, and when, in a line with room for about `budget`
 * characters: "Then comes <title>, at <when>."
 *
 * When it starts is the half a viewer acts on, so it is never the half that
 * is dotted off. The hour is said in the announcer's words if the line has
 * room for them, and in figures if it has not; only then does the title
 * give way.
 */
export function thenComes(title: string, prose: string, figures: string, budget: number): ThenComes {
  const length = (s: string) => Array.from(s).length;
  if (length(title) + length(prose) + THEN_FURNITURE <= budget) return { title, when: prose };
  if (length(title) + length(figures) + THEN_FURNITURE <= budget) return { title, when: figures };
  return {
    title: shortenBlurb(title, Math.max(8, budget - THEN_FURNITURE - length(figures))),
    when: figures,
  };
}
