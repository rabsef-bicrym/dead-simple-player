import { footLine } from '../notesFoot';
import { spokenWidth } from '../blurbFit';

// The strip as Notes.tsx draws it: Newsreader 13.5, a 16px gap, 24px a side.
const STRIP = { fontSize: 13.5, gap: 16, minRule: 72 };
const room = (phoneWidth: number) => phoneWidth - 2 * 24;

const FULL = 'the picture continues beneath · ends at 10:45';
const SHORT = 'ends at 10:45';

describe('footLine', () => {
  it('says the whole sentence where it leaves a rule worth drawing', () => {
    expect(footLine([FULL, SHORT], room(430), STRIP)).toEqual({ text: FULL, rule: true });
    expect(footLine([FULL, SHORT], room(700), STRIP)).toEqual({ text: FULL, rule: true });
  });

  it('shortens the sentence before it gives up the rule', () => {
    // At 375 and 390 the whole sentence would leave a stub of a rule (40 and 55px).
    for (const phone of [320, 375, 390]) {
      expect(footLine([FULL, SHORT], room(phone), STRIP)).toEqual({ text: SHORT, rule: true });
    }
  });

  it('is one line on every phone, at the widest hour the clock can show', () => {
    for (const phone of [320, 360, 375, 390, 393, 402, 414, 430, 440]) {
      const line = footLine(['the picture continues beneath · ends at 12:00', 'ends at 12:00'], room(phone), STRIP);
      expect(spokenWidth(line.text, STRIP.fontSize)).toBeLessThanOrEqual(room(phone));
      expect(line.rule).toBe(true);
    }
  });

  it('never leaves less than the minimum rule beside what it chose', () => {
    for (let w = 120; w <= 480; w += 1) {
      const line = footLine([FULL, SHORT], w, STRIP);
      if (line.rule) {
        expect(w - spokenWidth(line.text, STRIP.fontSize) - STRIP.gap).toBeGreaterThanOrEqual(STRIP.minRule);
      }
    }
  });

  it('gives up the rule, and keeps the fullest sentence that goes alone, when nothing leaves it room', () => {
    const shortW = spokenWidth(SHORT, STRIP.fontSize);
    expect(footLine([FULL, SHORT], shortW + STRIP.gap + STRIP.minRule - 1, STRIP)).toEqual({ text: SHORT, rule: false });
    const fullW = spokenWidth(FULL, STRIP.fontSize);
    expect(footLine([FULL], fullW + 10, STRIP)).toEqual({ text: FULL, rule: false });
  });

  it('falls back to the shortest saying when even that overruns', () => {
    expect(footLine([FULL, SHORT], 20, STRIP)).toEqual({ text: SHORT, rule: false });
  });

  it('takes the announcer\'s long hours in its stride', () => {
    const prose = 'airs at twenty-three minutes past eleven';
    const figures = 'airs at 11:23';
    expect(footLine([prose, figures], room(430), STRIP)).toEqual({ text: prose, rule: true });
    expect(footLine([prose, figures], room(320), STRIP)).toEqual({ text: figures, rule: true });
    expect(footLine(['airs at six o\'clock', 'airs at 6:00'], room(375), STRIP).text).toBe('airs at six o\'clock');
  });

  it('with nothing to say, keeps only the rule', () => {
    expect(footLine([], room(390), STRIP)).toEqual({ text: '', rule: true });
    expect(footLine([''], 10, STRIP)).toEqual({ text: '', rule: false });
  });
});
