/**
 * The announcer's breath.
 *
 * A programme's notes run to pages; a panel has room for a few lines of
 * them. Left to the platform, the cut is made wherever the last line ends:
 * the dots land after a full stop ("gun....") or, when the notes break into
 * paragraphs, alone on a line of their own. An announcer who runs out of
 * time stops on a word and lets it hang. This is that, as arithmetic, in the
 * same manner as `engraverFit.ts`: the widths are Newsreader's own advances,
 * so the cut is decided before anything is drawn and comes out the same on
 * the phone, the console and the web.
 *
 * The rule, wherever notes are shortened:
 * - one ellipsis character, attached to the last word kept;
 * - whitespace and sentence punctuation before it removed;
 * - none at all when nothing was cut.
 *
 * Pure. No layout pass, no platform text API.
 */

/** Advance widths in em. Measured from assets/fonts/Newsreader.ttf at 16.5px in Chrome, 2026-11-18. */
const ADVANCE: Record<string, number> = {
  '0': 0.562, '1': 0.562, '2': 0.562, '3': 0.562, '4': 0.562, '5': 0.562, '6': 0.562, '7': 0.562,
  '8': 0.562, '9': 0.562, ' ': 0.228, '!': 0.267, '"': 0.35, '#': 0.562, '$': 0.562, '%': 0.775,
  '&': 0.712, '\'': 0.196, '(': 0.26, ')': 0.26, '*': 0.433, '+': 0.509, ',': 0.236, '-': 0.351,
  '.': 0.228, '/': 0.267, ':': 0.25, ';': 0.267, '=': 0.509, '?': 0.433, '@': 0.888,
  A: 0.705, B: 0.634, C: 0.702, D: 0.748, E: 0.634, F: 0.587, G: 0.747, H: 0.795, I: 0.335, J: 0.408,
  K: 0.724, L: 0.598, M: 0.973, N: 0.765, O: 0.773, P: 0.598, Q: 0.773, R: 0.639, S: 0.549, T: 0.665,
  U: 0.763, V: 0.685, W: 0.959, X: 0.713, Y: 0.678, Z: 0.63, '[': 0.326, ']': 0.327,
  a: 0.453, b: 0.54, c: 0.427, d: 0.549, e: 0.456, f: 0.318, g: 0.494, h: 0.555, i: 0.277, j: 0.244,
  k: 0.534, l: 0.266, m: 0.823, n: 0.567, o: 0.52, p: 0.558, q: 0.539, r: 0.39, s: 0.376, t: 0.337,
  u: 0.53, v: 0.519, w: 0.736, x: 0.501, y: 0.517, z: 0.425,
  '’': 0.234, '‘': 0.233, '“': 0.406, '”': 0.408, '—': 0.684, '–': 0.519, '…': 0.635, '·': 0.244,
  // The accented Latin the guide carries sits on its base letter's advance.
  'É': 0.634, 'Í': 0.335, 'á': 0.453, 'ä': 0.453, 'å': 0.453, 'è': 0.456, 'é': 0.456, 'ë': 0.456,
  'ó': 0.52, 'ö': 0.52,
};

/** A letter the table has not met is taken for a wide one, so the fit errs short. */
const UNKNOWN_ADVANCE = 0.62;
/** Ideographs and emoji sit on a full em. */
const WIDE_ADVANCE = 1;

/**
 * Newsreader has an optical-size axis: below the size the table was read at,
 * the letters are cut wider (about 8% at 13px). Above it they narrow, which
 * needs no allowance because a short estimate only leaves room.
 */
const TABLE_SIZE = 16.5;
const SMALL_SIZE = 13;
const SMALL_WIDEN = 0.08;

function widen(fontSize: number): number {
  const t = Math.min(1, Math.max(0, (TABLE_SIZE - fontSize) / (TABLE_SIZE - SMALL_SIZE)));
  return 1 + SMALL_WIDEN * t;
}

/** The width a run of Newsreader roman takes, in px. */
export function spokenWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    const known = ADVANCE[ch];
    if (known != null) em += known;
    else em += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? WIDE_ADVANCE : UNKNOWN_ADVANCE;
  }
  return em * fontSize * widen(fontSize);
}

const ELLIPSIS = '…';
/** What may not stand between the last word and its ellipsis. */
const TRAILING = /[\s.,;:!?…·—–-]+$/u;
/** A closing quote or bracket keeps its place; the stop inside it does not: `gun."` → `gun"`. */
const STOP_INSIDE_CLOSER = /[\s.,;:!?…]+(["”’')\]]+)$/u;

/**
 * Hang an ellipsis on text that has been cut. Call it only on text that WAS
 * cut; text that was not takes no dots.
 */
export function trailOff(kept: string): string {
  let out = kept;
  // The two rules can uncover each other (`…ends." —`), so run to a fixed point.
  for (;;) {
    const next = out.replace(TRAILING, '').replace(STOP_INSIDE_CLOSER, '$1');
    if (next === out) break;
    out = next;
  }
  return out ? out + ELLIPSIS : '';
}

/** Notes as one flowing paragraph: breaks and runs of space become a single space. */
export function flowText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** How many lines `text` takes when wrapped at words to `width` px. */
export function spokenLines(text: string, width: number, fontSize: number): number {
  const words = flowText(text).split(' ').filter(Boolean);
  if (words.length === 0) return 0;
  const space = spokenWidth(' ', fontSize);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = spokenWidth(word, fontSize);
    if (used > 0 && used + space + w > width) {
      lines += 1;
      used = 0;
    }
    if (used === 0 && w > width) {
      // A word wider than the line is broken across as many lines as it needs.
      lines += Math.ceil(w / width) - 1;
      used = w % width || width;
    } else {
      used += (used > 0 ? space : 0) + w;
    }
  }
  return lines;
}

export interface BlurbOptions {
  /** The measure the blurb is set to, in px. */
  width: number;
  /** How many lines it may take. */
  lines: number;
  fontSize: number;
  /**
   * The fraction of the measure held back against a platform that sets the
   * face a hair wider than the table says. Defaults to 3%.
   */
  safety?: number;
}

/**
 * The blurb for a panel: the notes as one paragraph, whole when they fit in
 * `lines` lines of `width`, otherwise the most words that fit with the
 * ellipsis hung on the last of them.
 */
export function fitBlurb(text: string | undefined | null, options: BlurbOptions): string {
  const flowed = flowText(text ?? '');
  if (!flowed) return '';
  const lines = Math.max(1, Math.floor(options.lines));
  const width = Math.max(0, options.width * (1 - (options.safety ?? 0.03)));
  const { fontSize } = options;

  if (spokenLines(flowed, width, fontSize) <= lines) return flowed;

  const words = flowed.split(' ');
  // Find the most words that fit once the ellipsis is hung on them. Fewer
  // words never take more lines, so the answer can be searched for.
  let low = 1;
  let high = words.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = trailOff(words.slice(0, mid).join(' '));
    if (candidate && spokenLines(candidate, width, fontSize) <= lines) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best > 0) return trailOff(words.slice(0, best).join(' '));

  // Not even the first word fits: cut it by the letter.
  const letters = [...words[0]];
  for (let n = letters.length - 1; n > 0; n -= 1) {
    const candidate = trailOff(letters.slice(0, n).join(''));
    if (candidate && spokenLines(candidate, width, fontSize) <= lines) return candidate;
  }
  return ELLIPSIS;
}
