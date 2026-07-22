/**
 * The DS-6 — walnut & brass design language.
 *
 * One system: stamped Besley plates with screws, Newsreader roman for
 * anything that speaks, amber for anything alive (jewels, progress, the
 * wiper), the picture always sacred. Palette lifted from the coalesced
 * canvas ("The DS-6, coalesced — all walnut").
 */

export const walnut = {
  // Cabinet depths, darkest to lightest
  void: '#0d0702',
  deep: '#1a1006',
  cabinet: '#1e1309',
  panel: '#241708',
  raised: '#2a1a0c',
  grain: '#38271a',
} as const;

export const brass = {
  // Stamped plate metals
  shadow: '#5f4a2c',
  mid: '#8a7355',
  muted: '#a5947a',
  light: '#c9b48c',
  bright: '#d9c9a8',
  etch: '#e8dcc4',
} as const;

export const amber = {
  // Anything alive
  deep: '#a86f24',
  needle: '#dfa14f',
  jewel: '#f0b862',
  glow: '#ffd9a0',
} as const;

export const cream = '#f1e5cf';

export const fonts = {
  /** Stamped plates, board headers, controls. */
  plate: 'Besley',
  /** Anything that speaks: titles, notes, continuity copy. */
  speech: 'Newsreader',
  speechItalic: 'Newsreader-Italic',
  /** Split-flap characters — fixed width so the flaps align. */
  flap: 'CourierPrime',
  flapBold: 'CourierPrime-Bold',
  /** The one chrome signature. */
  signature: 'StyleScript',
} as const;

export const FONT_ASSETS = {
  Besley: require('../../assets/fonts/Besley.ttf'),
  Newsreader: require('../../assets/fonts/Newsreader.ttf'),
  'Newsreader-Italic': require('../../assets/fonts/Newsreader-Italic.ttf'),
  CourierPrime: require('../../assets/fonts/CourierPrime.ttf'),
  'CourierPrime-Bold': require('../../assets/fonts/CourierPrime-Bold.ttf'),
  StyleScript: require('../../assets/fonts/StyleScript.ttf'),
};

/** Tracked-caps letterSpacing for plate text, in px at the given size. */
export function plateTracking(fontSize: number): number {
  return fontSize * 0.18;
}
