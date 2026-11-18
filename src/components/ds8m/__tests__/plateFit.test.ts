import { engravedWidth } from '../../../ui/engraverFit';
import {
  blurbBudget,
  gateLegend,
  gateLegendColumn,
  lineCut,
  numeralCut,
  shortenBlurb,
  tabStrip,
  type TabLabel,
} from '../plateFit';

/** The ten stations the set carries today, by number. */
const STATIONS: Array<[number, string]> = [
  [1, 'The Prisoner'], [2, "Nana's Picks"], [3, 'Television'], [4, 'Movies'], [5, 'Oddities'],
  [6, 'Music'], [7, 'MST3K'], [8, 'Ghibli'], [9, 'For Your Information'], [19, 'Public 19'],
];
const NAMES = STATIONS.map(([, name]) => name);

describe('numeralCut', () => {
  it('leaves a single digit in its column exactly as drawn', () => {
    for (let n = 1; n <= 9; n += 1) {
      expect(numeralCut(n, 22, 20)).toEqual({ fontSize: 20, width: 22, bleed: 0 });
      expect(numeralCut(n, 18, 15)).toEqual({ fontSize: 15, width: 18, bleed: 0 });
    }
  });

  it('keeps 19 at the designed size, on one line, on the same centre', () => {
    const cut = numeralCut(19, 22, 20);
    expect(cut.fontSize).toBe(20);
    // The box holds the numeral at the bold weight, with a point to spare.
    expect(cut.width).toBeGreaterThan(engravedWidth('19', 20, 0, 700));
    // It overhangs the one-digit column equally, and only slightly.
    expect(cut.bleed).toBeCloseTo((cut.width - 22) / 2);
    expect(cut.bleed).toBeLessThanOrEqual(3);
  });

  it('does the same on the compact register', () => {
    const cut = numeralCut(19, 18, 15);
    expect(cut.fontSize).toBe(15);
    expect(cut.width).toBeGreaterThan(engravedWidth('19', 15, 0, 700));
    expect(cut.bleed).toBeLessThanOrEqual(3);
  });

  it('cuts a three-digit numeral smaller rather than let it run into the name', () => {
    const cut = numeralCut(100, 22, 20);
    expect(cut.fontSize).toBeLessThan(20);
    expect(cut.fontSize).toBeGreaterThanOrEqual(12);
    expect(cut.bleed).toBeLessThanOrEqual(3);
    expect(cut.width).toBeGreaterThan(engravedWidth('100', cut.fontSize, 0, 700));
  });
});

describe('lineCut', () => {
  it('leaves a short legend as designed', () => {
    expect(lineCut('CHANNEL 4 · MOVIES', 229, 8, 1.4, 6.5)).toEqual({ fontSize: 8, letterSpacing: 1.4, fits: true });
  });

  it('closes the tracking of the longest channel legend on the smallest phone', () => {
    // The watch rail at 375pt: 76% of the rail, less border, padding and jewel.
    const room = (375 - 28) * 0.76 - 2 - 20 - 13;
    const cut = lineCut('CHANNEL 9 · FOR YOUR INFORMATION', room, 8, 1.4, 6.5);
    expect(cut.fits).toBe(true);
    expect(cut.fontSize).toBe(8);
    expect(cut.letterSpacing).toBeLessThan(1.4);
    expect(cut.letterSpacing).toBeGreaterThanOrEqual(0.7);
    expect(engravedWidth('CHANNEL 9 · FOR YOUR INFORMATION', cut.fontSize, cut.letterSpacing)).toBeLessThanOrEqual(room);
  });
});

describe('gateLegend', () => {
  const options = {
    fontSize: 9.5,
    minFontSize: 8,
    tracking: (size: number) => size * 0.13,
    minTrackingRatio: 0.5,
    lastResortTrackingRatio: 0.25,
  };
  /** The gate's legend column on a plate `width` wide: five slots, 6pt of edge, 4pt of gutter. */
  const column = (width: number) => (width - 12) / 5 - 4;

  it.each([
    ['the narrowest plate (a 667pt phone)', 412],
    ['an 844pt phone', 432],
    ['the widest plate (a 932pt phone)', 480],
  ])('cuts all ten names whole on %s', (_, width) => {
    const legend = gateLegend(NAMES, column(width), options);
    expect(legend.fits).toBe(true);
    expect(legend.fontSize).toBeGreaterThanOrEqual(8);
    legend.names.forEach((cut, i) => {
      expect(cut.fits).toBe(true);
      // One size for the whole plate.
      expect(cut.fontSize).toBe(legend.fontSize);
      // Nothing dropped, nothing dotted: the lines are the name.
      expect(cut.lines.join(' ')).toBe(NAMES[i]);
      expect(cut.lines.length).toBeLessThanOrEqual(2);
      for (const line of cut.lines) {
        expect(engravedWidth(line, cut.fontSize, cut.letterSpacing)).toBeLessThanOrEqual(column(width));
      }
    });
  });

  it('goes larger where the plate allows', () => {
    expect(gateLegend(NAMES, column(412), options).fontSize).toBe(8);
    expect(gateLegend(NAMES, column(480), options).fontSize).toBe(9.5);
  });

  it('breaks the long names at a word and leaves the short ones on one line', () => {
    const legend = gateLegend(NAMES, column(412), options);
    const lines = (name: string) => legend.names[NAMES.indexOf(name)].lines;
    expect(lines('For Your Information')).toEqual(['For Your', 'Information']);
    expect(lines('The Prisoner')).toEqual(['The', 'Prisoner']);
    for (const name of ['Television', 'Movies', 'Oddities', 'Music', 'MST3K', 'Ghibli', 'Public 19']) {
      expect(lines(name)).toEqual([name]);
    }
  });

  it('lets only a word that cannot break close its tracking past the usual limit', () => {
    const legend = gateLegend(NAMES, column(412), options);
    const full = options.tracking(legend.fontSize);
    const tracking = (name: string) => legend.names[NAMES.indexOf(name)].letterSpacing;
    expect(tracking('For Your Information')).toBeLessThan(full * 0.5);
    expect(tracking('For Your Information')).toBeGreaterThanOrEqual(full * 0.25);
    for (const name of ['The Prisoner', "Nana's Picks", 'Television', 'Movies', 'Public 19']) {
      expect(tracking(name)).toBeGreaterThanOrEqual(full * 0.5);
    }
  });

  it('knows the narrowest column the names can be whole in, and is whole in it', () => {
    const need = gateLegendColumn(NAMES, options);
    // INFORMATION, the one word that can neither break nor shrink further.
    expect(need).toBeCloseTo(engravedWidth('INFORMATION', 8, options.tracking(8) * 0.25), 5);
    expect(gateLegend(NAMES, need + 0.5, options).fits).toBe(true);
    expect(gateLegend(NAMES, need - 1, options).fits).toBe(false);
  });

  it('asks for less room when no name is long, and more for a longer word', () => {
    const six = NAMES.slice(0, 6);
    expect(gateLegendColumn(six, options)).toBeLessThan(gateLegendColumn(NAMES, options));
    expect(gateLegendColumn([...NAMES, 'Documentaries'], options)).toBeGreaterThan(gateLegendColumn(NAMES, options));
    expect(gateLegendColumn([], options)).toBe(0);
  });

  it('says so when a column is too narrow for any cut', () => {
    const legend = gateLegend(NAMES, 40, options);
    expect(legend.fits).toBe(false);
    expect(legend.fontSize).toBe(8);
    expect(legend.names).toHaveLength(NAMES.length);
  });
});

describe('tabStrip', () => {
  const TAB = { fontSize: 7.5, letterSpacing: 1, pad: 9, gap: 6, tightPad: 5, tightGap: 4, border: 2, gaps: 4 };
  const label = ([number, name]: [number, string]): TabLabel => ({ prefix: `${number} · `, name: name.toUpperCase() });
  /** The three tabs shown when station `i` is the board's channel. */
  const triple = (i: number) => [STATIONS[(i + 9) % 10], STATIONS[i], STATIONS[(i + 1) % 10]].map(label);
  /** The room between the arrows on a portrait phone `w` wide. */
  const portraitRoom = (w: number) => w - 32 - 2 * 27;
  const need = (strip: ReturnType<typeof tabStrip>) => strip.tabs.reduce(
    (sum, lines) => sum + Math.max(...lines.map((l) => engravedWidth(l, TAB.fontSize, strip.letterSpacing))) + 2 * strip.pad + TAB.border,
    0,
  ) + TAB.gaps * strip.gap;

  it.each([375, 390, 430])('fits every one of the ten positions on a %ipt portrait phone', (w) => {
    for (let i = 0; i < 10; i += 1) {
      const strip = tabStrip(triple(i), portraitRoom(w), TAB);
      expect(strip.fits).toBe(true);
      expect(need(strip)).toBeLessThanOrEqual(portraitRoom(w));
      expect(strip.letterSpacing).toBeGreaterThanOrEqual(0.5);
      // Every label is whole: its lines are the label.
      strip.tabs.forEach((lines, k) => {
        const l = triple(i)[k];
        expect(lines.join(' ')).toBe(`${l.prefix}${l.name}`);
        expect(lines.length).toBeLessThanOrEqual(2);
      });
    }
  });

  it('leaves a strip that goes exactly as drawn', () => {
    // Movies between Television and Oddities: short names, 390pt.
    const strip = tabStrip(triple(3), portraitRoom(390), TAB);
    expect(strip).toMatchObject({ asDrawn: true, pad: 9, gap: 6, letterSpacing: 1 });
    expect(strip.tabs).toEqual([['3 · TELEVISION'], ['4 · MOVIES'], ['5 · ODDITIES']]);
  });

  it('lets the furniture and the tracking yield before a name is broken', () => {
    // Public 19, The Prisoner, Nana's Picks: the strip that pushed the arrow off a 390pt phone.
    const strip = tabStrip(triple(0), portraitRoom(390), TAB);
    expect(strip.asDrawn).toBe(false);
    expect(strip.pad).toBe(5);
    expect(strip.gap).toBe(4);
    expect(strip.tabs.every((lines) => lines.length === 1)).toBe(true);
  });

  it('breaks For Your Information at a word, keeping the numeral with the first line', () => {
    const strip = tabStrip(triple(8), portraitRoom(390), TAB);
    expect(strip.tabs).toEqual([['8 · GHIBLI'], ['9 · FOR YOUR', 'INFORMATION'], ['19 · PUBLIC 19']]);
    // The break bought the furniture and the tracking back.
    expect(strip).toMatchObject({ pad: 9, gap: 6, letterSpacing: 1 });
  });

  it('never breaks a name where it would leave a lone numeral for a second line', () => {
    for (const w of [375, 390, 430]) {
      for (let i = 0; i < 10; i += 1) {
        const strip = tabStrip(triple(i), portraitRoom(w), TAB);
        for (const lines of strip.tabs) expect(lines[lines.length - 1]).not.toBe('19');
      }
    }
  });

  it('has room for all three as drawn on a landscape phone', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(tabStrip(triple(i), 667 - 48 - 2 * 27, TAB).asDrawn).toBe(true);
    }
  });

  it('reports a strip that cannot be made to go', () => {
    const strip = tabStrip(triple(8), 120, TAB);
    expect(strip.fits).toBe(false);
    expect(strip.tabs).toHaveLength(3);
  });
});

describe('shortenBlurb', () => {
  const PRISONER = "The one CBS refused to air. The Western. The episode that got banned from American television in 1968 because a man wouldn't pick up a gun.\n\nIt aired in Britain on December 29, 1967.";

  it('returns a blurb that fits whole, with its own full stop and no dots', () => {
    expect(shortenBlurb('A man resigns. He wakes up somewhere else.', 80)).toBe('A man resigns. He wakes up somewhere else.');
  });

  it('reads a paragraph break as a space', () => {
    expect(shortenBlurb('One.\n\nTwo.', 80)).toBe('One. Two.');
  });

  it('takes the sentence punctuation off before the ellipsis: never "gun...."', () => {
    const cut = shortenBlurb(PRISONER, 143);
    expect(cut).toBe("The one CBS refused to air. The Western. The episode that got banned from American television in 1968 because a man wouldn't pick up a gun…");
    expect(cut).not.toMatch(/[.,;:!?]…$/);
  });

  it('sets exactly one ellipsis character, against the last kept word', () => {
    const cut = shortenBlurb(PRISONER, 60);
    expect(cut).toBe('The one CBS refused to air. The Western. The episode that…');
    expect(cut.match(/…/g)).toHaveLength(1);
    expect(cut).not.toMatch(/\s…$/);
    expect(cut).not.toContain('...');
  });

  it('never cuts inside a word and never runs over the budget', () => {
    for (let n = 12; n < 180; n += 1) {
      const cut = shortenBlurb(PRISONER, n);
      expect(Array.from(cut).length).toBeLessThanOrEqual(n);
      if (cut.endsWith('…')) {
        const kept = cut.slice(0, -1);
        const whole = PRISONER.replace(/\s+/g, ' ');
        expect(whole.startsWith(kept)).toBe(true);
        // What follows the kept text in the original is a space or punctuation, not a letter.
        expect(whole.charAt(kept.length)).toMatch(/[\s.,;:!?"']/);
      }
    }
  });

  it('does not leave the first word of a new sentence dangling before the dots', () => {
    expect(shortenBlurb('He would not pick up a gun. It aired in Britain on December 29.', 32)).toBe('He would not pick up a gun…');
    // Three words into the next sentence is not an orphan: it stays.
    expect(shortenBlurb('He would not pick up a gun. It aired in Britain on December 29.', 40)).toBe('He would not pick up a gun. It aired in…');
  });

  it('keeps a last sentence that ends exactly at the cut', () => {
    expect(shortenBlurb('The Western. Banned. And then some more of it follows.', 21)).toBe('The Western. Banned…');
  });

  it('strips a closing quote with the stop it closes', () => {
    expect(shortenBlurb('The title is from Goethe. "Be the hammer." It is the best of them all.', 44)).toBe('The title is from Goethe. "Be the hammer…');
  });

  it('counts by character, not by code unit', () => {
    const cut = shortenBlurb('💈 Barber shop quartet sings again and again', 12);
    expect(cut).toBe('💈 Barber…');
  });

  it('hard-cuts a single word too long for the budget', () => {
    expect(shortenBlurb('Supercalifragilisticexpialidocious', 10)).toBe('Supercali…');
  });
});

describe('blurbBudget', () => {
  it('allows about three lines of the panel measure and a little less', () => {
    const budget = blurbBudget(340, 13.5, 3);
    // Three full lines at this measure hold some 150 to 160 characters.
    expect(budget).toBeGreaterThan(130);
    expect(budget).toBeLessThan(150);
  });

  it('shrinks with the panel and never goes negative', () => {
    expect(blurbBudget(220, 13.5, 3)).toBeLessThan(blurbBudget(340, 13.5, 3));
    expect(blurbBudget(0, 13.5, 3)).toBe(0);
  });
});
