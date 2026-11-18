import { engrave, type EngraveOptions, type Engraving } from './engraverFit';

/**
 * The console's station register: how wide it stands and how a name is cut
 * onto one of its plates. Kept apart from the component so the promise it
 * makes (no station name is ever dotted off) can be tested without a screen.
 */

/** Besley's tracking on a register plate, in px at a size. */
const tracking = (fontSize: number) => fontSize * 0.18 * 0.42;

/**
 * The drawn 13px; then the tracking closed; then a smaller cut, but not
 * below 11, where a name starts to look like a different plate from its
 * neighbours; then a break at a word, which buys the drawn size back.
 */
export const REGISTER_NAME_CUT: EngraveOptions = {
  fontSize: 13,
  minFontSize: 11,
  tracking,
  minTrackingRatio: 0.35,
  weight: 700,
  twoLines: true,
  margin: 2,
};

/** What stands beside the name on a plate: border, face padding, numeral, divider, the name's own padding. */
const PLATE_CHROME = 2 + 13 * 2 + 45 + 1 + 13 + 5;

/** The register is a fifth of the composition, between 215 and 286. */
export function registerWidth(compositionWidth: number): number {
  return Math.max(215, Math.min(286, compositionWidth * 0.2));
}

/** The room a name has on a plate of a register this wide, in px. */
export function registerNameRoom(register: number): number {
  return Math.max(0, register - PLATE_CHROME);
}

/** A station's name, cut for a register this wide. */
export function engraveRegisterName(name: string, register: number): Engraving {
  return engrave(name, registerNameRoom(register), REGISTER_NAME_CUT);
}
