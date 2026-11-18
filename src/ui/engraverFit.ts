/**
 * The engraver's fit.
 *
 * A plate maker handed a long name does not stop halfway and add dots. He
 * cuts the letters smaller, closes the tracking a little, and if the name
 * still will not go he breaks it over two lines at a word. This is that
 * judgment as arithmetic, so every cabinet makes the same one and no screen
 * has to be measured first: the widths below are Besley's own advances,
 * read from the face at the two weights the plates use.
 *
 * Pure. No layout pass, no platform text API, the same answer on the phone,
 * the console and the web.
 */

/** Advance widths in em. Measured from assets/fonts/Besley.ttf, 2026-11-18. */
const ADVANCE: Record<400 | 700, Record<string, number>> = {
  400: {
    '0': 0.59, '1': 0.525, '2': 0.57, '3': 0.53, '4': 0.54, '5': 0.515, '6': 0.55, '7': 0.524, '8': 0.53, '9': 0.55,
    A: 0.86, B: 0.748, C: 0.81, D: 0.823, E: 0.758, F: 0.723, G: 0.87, H: 0.885, I: 0.415, J: 0.589, K: 0.873,
    L: 0.728, M: 1.035, N: 0.875, O: 0.83, P: 0.69, Q: 0.83, R: 0.773, S: 0.673, T: 0.775, U: 0.84, V: 0.86,
    W: 1.18, X: 0.87, Y: 0.785, Z: 0.755,
    ' ': 0.3, '·': 0.198, "'": 0.2, '’': 0.2, '&': 0.87, '.': 0.235, ',': 0.254, '-': 0.46, '—': 1.062,
    ':': 0.235, '!': 0.319, '?': 0.55, '…': 0.6,
  },
  700: {
    '0': 0.636, '1': 0.563, '2': 0.642, '3': 0.574, '4': 0.598, '5': 0.583, '6': 0.608, '7': 0.563, '8': 0.588, '9': 0.608,
    A: 0.905, B: 0.799, C: 0.831, D: 0.872, E: 0.799, F: 0.768, G: 0.908, H: 0.948, I: 0.488, J: 0.653, K: 0.922,
    L: 0.754, M: 1.12, N: 0.915, O: 0.87, P: 0.745, Q: 0.87, R: 0.862, S: 0.707, T: 0.793, U: 0.888, V: 0.905,
    W: 1.235, X: 0.895, Y: 0.835, Z: 0.782,
    ' ': 0.3, '·': 0.259, "'": 0.25, '’': 0.25, '&': 0.895, '.': 0.278, ',': 0.303, '-': 0.46, '—': 1.062,
    ':': 0.235, '!': 0.359, '?': 0.568, '…': 0.78,
  },
};

/** A letter the table has not met is taken for a wide one, so the fit errs small. */
const UNKNOWN_ADVANCE = 0.95;

export type PlateWeight = 400 | 700;

/**
 * The width a line of plate capitals takes, in px. `letterSpacing` is added
 * after every glyph, the last included, which is how both React Native and
 * the browser lay tracked text out.
 */
export function engravedWidth(
  text: string,
  fontSize: number,
  letterSpacing = 0,
  weight: PlateWeight = 700,
): number {
  const table = ADVANCE[weight];
  let em = 0;
  let glyphs = 0;
  for (const ch of text.toUpperCase()) {
    em += table[ch] ?? UNKNOWN_ADVANCE;
    glyphs += 1;
  }
  return em * fontSize + glyphs * letterSpacing;
}

export interface EngraveOptions {
  /** The size the plate was designed at. The fit never exceeds it. */
  fontSize: number;
  /** The smallest size the engraver will cut before breaking the line. */
  minFontSize: number;
  /** Tracking at a given size. Defaults to none. */
  tracking?: (fontSize: number) => number;
  /** How far the tracking may close, as a fraction of itself, before the size drops. 1 = not at all. */
  minTrackingRatio?: number;
  weight?: PlateWeight;
  /** May the name break over two lines once it is at the smallest size? */
  twoLines?: boolean;
  /** Width safety, in px, kept clear at the right edge. */
  margin?: number;
}

export interface Engraving {
  /** One line, or two when the name had to break. */
  lines: string[];
  fontSize: number;
  letterSpacing: number;
  /** False only when even the smallest cut on the allowed lines overruns; the caller may then clip. */
  fits: boolean;
}

/** Sizes are cut on a half-point grid, so two plates with near names do not differ by a hair. */
const STEP = 0.5;

function fitOneLine(
  text: string,
  width: number,
  o: Required<Pick<EngraveOptions, 'fontSize' | 'minFontSize' | 'minTrackingRatio' | 'weight'>> & {
    tracking: (fontSize: number) => number;
  },
): { fontSize: number; letterSpacing: number; fits: boolean } {
  for (let size = o.fontSize; size >= o.minFontSize - 1e-9; size -= STEP) {
    const full = o.tracking(size);
    if (engravedWidth(text, size, full, o.weight) <= width) {
      return { fontSize: size, letterSpacing: full, fits: true };
    }
    // Before going a size smaller, see whether closing the tracking is enough.
    const tight = full * o.minTrackingRatio;
    if (tight < full && engravedWidth(text, size, tight, o.weight) <= width) {
      // Take the widest tracking that fits, to the nearest tenth of a px.
      const glyphs = [...text].length || 1;
      const spare = width - engravedWidth(text, size, 0, o.weight);
      const letterSpacing = Math.max(tight, Math.floor((spare / glyphs) * 10) / 10);
      return { fontSize: size, letterSpacing, fits: true };
    }
  }
  return {
    fontSize: o.minFontSize,
    letterSpacing: o.tracking(o.minFontSize) * o.minTrackingRatio,
    fits: false,
  };
}

/**
 * Every way of breaking a name at a word, best first: the break that leaves
 * the two lines nearest in width, the longer line on top when they tie.
 */
export function wordBreaks(text: string, weight: PlateWeight = 700): Array<[string, string]> {
  const words = text.trim().split(/\s+/);
  const out: Array<{ pair: [string, string]; widest: number; diff: number }> = [];
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const wa = engravedWidth(a, 1, 0, weight);
    const wb = engravedWidth(b, 1, 0, weight);
    out.push({ pair: [a, b], widest: Math.max(wa, wb), diff: wb - wa });
  }
  out.sort((x, y) => x.widest - y.widest || x.diff - y.diff);
  return out.map((x) => x.pair);
}

/**
 * Fit a name to a plate `width` px wide.
 *
 * Order of resort: the designed size; the tracking closed; the size cut
 * down to `minFontSize`; then, if `twoLines`, the best word break at the
 * largest size both lines take. A two-line engraving is never cut smaller
 * than it must be: breaking buys the size back.
 */
export function engrave(text: string, width: number, options: EngraveOptions): Engraving {
  const o = {
    fontSize: options.fontSize,
    minFontSize: Math.min(options.minFontSize, options.fontSize),
    tracking: options.tracking ?? (() => 0),
    minTrackingRatio: options.minTrackingRatio ?? 1,
    weight: options.weight ?? 700,
  };
  const room = Math.max(0, width - (options.margin ?? 0));
  const name = text.trim();

  const one = fitOneLine(name, room, o);
  if (one.fits || !options.twoLines) {
    return { lines: [name], ...one };
  }

  for (const [a, b] of wordBreaks(name, o.weight)) {
    const fa = fitOneLine(a, room, o);
    const fb = fitOneLine(b, room, o);
    if (fa.fits && fb.fits) {
      // Both lines are cut alike: the smaller size, and the tighter tracking, win.
      const fontSize = Math.min(fa.fontSize, fb.fontSize);
      const letterSpacing = Math.min(fa.letterSpacing, fb.letterSpacing, o.tracking(fontSize));
      return { lines: [a, b], fontSize, letterSpacing, fits: true };
    }
  }
  return { lines: [name], ...one };
}
