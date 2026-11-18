/**
 * A remark cut to a run of split-flap modules.
 *
 * The board has a fixed number of flaps for the remark, and a programme's
 * description is always longer. Cut at the module count, the line stopped
 * in the middle of a word ("...AMBOSS ODER HAMMER S"), which reads as a
 * stuck drum. A board is set by a person: the line ends on a whole word,
 * and never on a word that only leads to the next one.
 */

/** Words a line should not be left hanging on. */
const DANGLERS = new Set([
  'A', 'AN', 'THE', 'AND', 'OR', 'BUT', 'OF', 'TO', 'IN', 'ON', 'AT', 'BY', 'FOR', 'WITH', 'FROM',
  'AS', 'IS', 'WAS', 'HIS', 'HER', 'ITS', 'THEIR', 'THAT', 'WHO', 'WHICH', 'THIS',
]);

export function flapNote(text: string | undefined, length: number): string {
  const whole = (text ?? '').replace(/\s+/g, ' ').trim();
  if (whole.length <= length) return whole;

  // The first sentence, when it fits, is the remark.
  const stop = whole.search(/[.!?](\s|$)/);
  if (stop > 0 && stop + 1 <= length && stop + 1 >= length * 0.4) return whole.slice(0, stop + 1);

  const words = whole.slice(0, length + 1).split(' ');
  // The last piece was cut by the slice unless the cut fell on a space.
  words.pop();
  while (words.length > 1) {
    const last = words[words.length - 1].replace(/[^A-Za-z]/g, '').toUpperCase();
    if (!DANGLERS.has(last)) break;
    words.pop();
  }
  const line = words.join(' ').replace(/[\s,;:\-–—&(]+$/, '');
  // One word longer than the whole run: nothing to break at, so it is cut.
  return line.length > 0 ? line : whole.slice(0, length);
}
