import { engrave, engravedWidth, wordBreaks } from '../engraverFit';

/** The plates' tracked-caps rule (constants/ds6 plateTracking), restated: that file pulls in the font assets. */
const plateTracking = (fontSize: number) => fontSize * 0.18;

/** The ten stations the set carries today. */
const STATIONS = [
  'The Prisoner', "Nana's Picks", 'Television', 'Movies', 'Oddities',
  'Music', 'MST3K', 'Ghibli', 'For Your Information', 'Public 19',
];

describe('engravedWidth', () => {
  it('agrees with the face to within kerning', () => {
    // Chrome, Besley 700 at 1000px: 15255 and 9016 with kerning applied.
    expect(engravedWidth('FOR YOUR INFORMATION', 1000)).toBeGreaterThan(15255 * 0.98);
    expect(engravedWidth('FOR YOUR INFORMATION', 1000)).toBeLessThan(15255 * 1.03);
    expect(engravedWidth('THE PRISONER', 1000)).toBeGreaterThan(9016 * 0.98);
    expect(engravedWidth('THE PRISONER', 1000)).toBeLessThan(9016 * 1.03);
  });

  it('reads lower case as the capitals the plate will carry', () => {
    expect(engravedWidth('movies', 12)).toBe(engravedWidth('MOVIES', 12));
  });

  it('adds the tracking after every glyph', () => {
    expect(engravedWidth('ABC', 10, 2) - engravedWidth('ABC', 10, 0)).toBeCloseTo(6);
  });

  it('takes a letter it has not met for a wide one', () => {
    expect(engravedWidth('瑞', 10)).toBeGreaterThan(engravedWidth('O', 10));
  });
});

describe('engrave', () => {
  const plate = { fontSize: 13, minFontSize: 9, tracking: plateTracking, minTrackingRatio: 0.5 };

  it('leaves a name that fits exactly as designed', () => {
    const e = engrave('Movies', 200, plate);
    expect(e).toEqual({ lines: ['Movies'], fontSize: 13, letterSpacing: plateTracking(13), fits: true });
  });

  it('closes the tracking before it cuts the letters smaller', () => {
    const full = engravedWidth('Television', 13, plateTracking(13));
    const e = engrave('Television', full - 6, plate);
    expect(e.fontSize).toBe(13);
    expect(e.letterSpacing).toBeLessThan(plateTracking(13));
    expect(e.letterSpacing).toBeGreaterThanOrEqual(plateTracking(13) * 0.5);
    expect(engravedWidth('Television', e.fontSize, e.letterSpacing)).toBeLessThanOrEqual(full - 6);
  });

  it('cuts the letters smaller when tracking alone will not do', () => {
    const e = engrave('For Your Information', 200, plate);
    expect(e.fits).toBe(true);
    expect(e.lines).toEqual(['For Your Information']);
    expect(e.fontSize).toBeLessThan(13);
    expect(e.fontSize).toBeGreaterThanOrEqual(9);
    expect(engravedWidth('For Your Information', e.fontSize, e.letterSpacing)).toBeLessThanOrEqual(200);
  });

  it('never exceeds the designed size, however wide the plate', () => {
    expect(engrave('Music', 4000, plate).fontSize).toBe(13);
  });

  it('reports a name that cannot go on one line, at the smallest cut', () => {
    const e = engrave('For Your Information', 60, plate);
    expect(e.fits).toBe(false);
    expect(e.fontSize).toBe(9);
    expect(e.lines).toHaveLength(1);
  });

  it('breaks at a word when allowed, and buys the size back', () => {
    const one = engrave('For Your Information', 110, plate);
    const two = engrave('For Your Information', 110, { ...plate, twoLines: true });
    expect(one.fits).toBe(false);
    expect(two.fits).toBe(true);
    expect(two.lines).toEqual(['For Your', 'Information']);
    for (const line of two.lines) {
      expect(engravedWidth(line, two.fontSize, two.letterSpacing)).toBeLessThanOrEqual(110);
    }
  });

  it('does not break a name that goes on one line', () => {
    expect(engrave('The Prisoner', 200, { ...plate, twoLines: true }).lines).toEqual(['The Prisoner']);
  });

  it('keeps a single long word whole and says it does not fit', () => {
    const e = engrave('Television', 30, { ...plate, twoLines: true });
    expect(e.lines).toEqual(['Television']);
    expect(e.fits).toBe(false);
  });

  it('keeps the margin clear', () => {
    const e = engrave('For Your Information', 200, { ...plate, margin: 20 });
    expect(engravedWidth('For Your Information', e.fontSize, e.letterSpacing)).toBeLessThanOrEqual(180);
  });

  it('fits every station the set carries on a console register plate', () => {
    for (const name of STATIONS) expect(engrave(name, 190, plate).fits).toBe(true);
  });
});

describe('wordBreaks', () => {
  it('offers the most even break first', () => {
    expect(wordBreaks('For Your Information')[0]).toEqual(['For Your', 'Information']);
    expect(wordBreaks('The Prisoner')[0]).toEqual(['The', 'Prisoner']);
  });

  it('has nothing to offer for one word', () => {
    expect(wordBreaks('Television')).toEqual([]);
  });
});
