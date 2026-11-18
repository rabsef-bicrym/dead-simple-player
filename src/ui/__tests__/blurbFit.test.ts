import { fitBlurb, flowText, spokenLines, spokenWidth, trailOff } from '../blurbFit';

// The notes on the air when the fault was photographed (laptop-1home.png).
const HARMONY = [
  'The one CBS refused to air. The Western. The episode that got banned from American television in 1968 because a man wouldn\'t pick up a gun.',
  'It aired in Britain on December 29, 1967 — the Friday between Christmas and New Year. "Hello Goodbye" by the Beatles was the number one song.',
  'There is no title sequence. The episode opens cold. A sheriff turns in his badge and his gun.',
].join('\n\n');

const ellipses = (s: string) => (s.match(/…/gu) ?? []).length;

describe('spokenWidth', () => {
  it('matches the face as the browser set it', () => {
    // Measured in Chrome at 16.5px: 428.64px.
    const measured = 428.64;
    const estimate = spokenWidth('The one CBS refused to air. The Western. The episode that got', 16.5);
    expect(Math.abs(estimate - measured) / measured).toBeLessThan(0.02);
  });

  it('scales with the size, and cuts small sizes wider (the optical axis)', () => {
    const at16 = spokenWidth('wouldn’t pick up a gun', 16.5);
    const at13 = spokenWidth('wouldn’t pick up a gun', 13);
    expect(at13).toBeGreaterThan(at16 * (13 / 16.5));
    expect(at13).toBeCloseTo(at16 * (13 / 16.5) * 1.08, 6);
    expect(spokenWidth('wouldn’t pick up a gun', 33)).toBeCloseTo(at16 * 2, 6);
  });

  it('takes an unknown letter for a wide one and an ideograph for a full em', () => {
    expect(spokenWidth('ж', 20)).toBeCloseTo(12.4, 6);
    expect(spokenWidth('瑞士', 20)).toBeCloseTo(40, 6);
  });
});

describe('trailOff', () => {
  it('hangs exactly one ellipsis on the last word', () => {
    expect(trailOff('a man wouldn’t pick up a gun')).toBe('a man wouldn’t pick up a gun…');
  });

  it('removes the sentence stop before it: no "gun...."', () => {
    expect(trailOff('pick up a gun.')).toBe('pick up a gun…');
    expect(trailOff('pick up a gun. ')).toBe('pick up a gun…');
    expect(trailOff('The Western,')).toBe('The Western…');
    expect(trailOff('Really?!')).toBe('Really…');
    expect(trailOff('and then:')).toBe('and then…');
    expect(trailOff('New Year;')).toBe('New Year…');
  });

  it('removes a dash or an ellipsis already hanging there', () => {
    expect(trailOff('December 29, 1967 —')).toBe('December 29, 1967…');
    expect(trailOff('the Friday –')).toBe('the Friday…');
    expect(trailOff('and so on...')).toBe('and so on…');
    expect(trailOff('and so on…')).toBe('and so on…');
    expect(trailOff('and so on … ')).toBe('and so on…');
  });

  it('keeps a closing quote but not the stop inside it', () => {
    expect(trailOff('the number one song."')).toBe('the number one song"…');
    expect(trailOff('“Hello Goodbye.”')).toBe('“Hello Goodbye”…');
    expect(trailOff('(the summer of 1968.)')).toBe('(the summer of 1968)…');
    expect(trailOff('"moping"')).toBe('"moping"…');
  });

  it('keeps an apostrophe that belongs to the word', () => {
    expect(trailOff('the boys’')).toBe('the boys’…');
    expect(trailOff('wouldn’t')).toBe('wouldn’t…');
  });

  it('gives nothing for nothing', () => {
    expect(trailOff('')).toBe('');
    expect(trailOff(' . ')).toBe('');
  });
});

describe('flowText', () => {
  it('runs paragraphs together with single spaces', () => {
    expect(flowText('  One.\n\nTwo.\r\n Three  four. ')).toBe('One. Two. Three four.');
  });
});

describe('spokenLines', () => {
  it('counts wrapped lines', () => {
    expect(spokenLines('', 400, 16.5)).toBe(0);
    expect(spokenLines('The Western.', 400, 16.5)).toBe(1);
    const first = HARMONY.split('\n\n')[0];
    // The first paragraph is three lines in the 432px panel (laptop-1home.png).
    expect(spokenLines(first, 432, 16.5)).toBe(3);
  });

  it('gives a word wider than the measure the lines it needs', () => {
    expect(spokenLines('Supercalifragilisticexpialidocious', 60, 16.5)).toBeGreaterThan(2);
  });
});

describe('fitBlurb', () => {
  const panel = { width: 432, lines: 4, fontSize: 16.5 };

  it('leaves notes that fit exactly as they are: no ellipsis when nothing was cut', () => {
    const short = 'The one CBS refused to air. The Western.';
    expect(fitBlurb(short, panel)).toBe(short);
    expect(ellipses(fitBlurb(short, panel))).toBe(0);
  });

  it('keeps an ellipsis the author wrote when nothing was cut', () => {
    expect(fitBlurb('To be continued…', panel)).toBe('To be continued…');
  });

  it('cuts long notes at a word, with one ellipsis attached to it', () => {
    const out = fitBlurb(HARMONY, panel);
    expect(ellipses(out)).toBe(1);
    expect(out.endsWith('…')).toBe(true);
    // Attached: a letter, digit or closing quote directly before it.
    expect(out).toMatch(/[\p{L}\p{N}"”’')\]]…$/u);
    expect(out).not.toMatch(/[\s.,;:!?—–-]…$/u);
    // No ellipsis on a line of its own: the notes are one paragraph now.
    expect(out).not.toMatch(/\n/);
    expect(spokenLines(out, panel.width * 0.97, panel.fontSize)).toBeLessThanOrEqual(4);
    // And it is a prefix of the notes, word for word.
    expect(flowText(HARMONY).startsWith(out.slice(0, -1))).toBe(true);
  });

  it('uses the room it is given rather than stopping at the first paragraph', () => {
    const out = fitBlurb(HARMONY, panel);
    expect(out.length).toBeGreaterThan(HARMONY.split('\n\n')[0].length);
    expect(spokenLines(out, panel.width * 0.97, panel.fontSize)).toBe(4);
  });

  it('never ends "gun...." when the cut falls on a sentence end', () => {
    // Narrow the measure until the cut lands right after "gun."
    for (let width = 250; width <= 460; width += 1) {
      const out = fitBlurb(HARMONY, { width, lines: 4, fontSize: 16.5 });
      expect(out).not.toMatch(/[.,;:!?]…$/u);
      expect(out).not.toMatch(/\.\.\./u);
      expect(ellipses(out)).toBeLessThanOrEqual(1);
      expect(spokenLines(out, width * 0.97, 16.5)).toBeLessThanOrEqual(4);
    }
  });

  it('holds to two lines on a short cabinet', () => {
    const out = fitBlurb(HARMONY, { width: 432, lines: 2, fontSize: 16.5 });
    expect(spokenLines(out, 432 * 0.97, 16.5)).toBeLessThanOrEqual(2);
    expect(out.endsWith('…')).toBe(true);
  });

  it('is empty for no notes', () => {
    expect(fitBlurb(undefined, panel)).toBe('');
    expect(fitBlurb('  \n ', panel)).toBe('');
  });

  it('cuts a single unbroken word by the letter', () => {
    const out = fitBlurb('Supercalifragilisticexpialidocious and more', { width: 80, lines: 1, fontSize: 16.5 });
    expect(out.endsWith('…')).toBe(true);
    expect(ellipses(out)).toBe(1);
    expect(spokenLines(out, 80 * 0.97, 16.5)).toBe(1);
  });
});
