import { fitStationStrip, tabWidth, STRIP_CUTS } from '../stationStrip';

const TABS = [
  '1 · THE PRISONER', "2 · NANA'S PICKS", '3 · TELEVISION', '4 · MOVIES', '5 · ODDITIES',
  '6 · MUSIC', '7 · MST3K', '8 · GHIBLI', '9 · FOR YOUR INFORMATION', '19 · PUBLIC 19',
];
const SIX = TABS.slice(0, 6);

// The room between the board's arrows: the board's width, less its side
// padding (56 each), the two arrow chips (46 each) and a gap beside each (8).
const room = (boardWidth: number) => boardWidth - 56 * 2 - 46 * 2 - 8 * 2;

const flat = (rows: number[][]) => rows.flat();

describe('tabWidth', () => {
  it('matches the tab as the browser drew it', () => {
    // Measured in Chrome at the second cut: "9 · FOR YOUR INFORMATION" is 196.8px.
    expect(Math.abs(tabWidth(TABS[8], STRIP_CUTS[1]) - 196.8)).toBeLessThan(3);
  });
});

describe('fitStationStrip', () => {
  it('leaves six stations on a laptop exactly as drawn', () => {
    const fit = fitStationStrip(SIX, room(1440));
    expect(fit.rows).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(fit.cut).toBe(STRIP_CUTS[0]);
    expect(fit.fits).toBe(true);
  });

  it('keeps ten stations on one row on the laptop by drawing the tabs in, not the type down', () => {
    const fit = fitStationStrip(TABS, room(1440));
    expect(fit.rows).toHaveLength(1);
    expect(fit.cut.fontSize).toBe(9);
    expect(fit.width).toBeLessThanOrEqual(room(1440));
  });

  it('takes a smaller cut on the kids laptop before it takes a second row', () => {
    const fit = fitStationStrip(TABS, room(1366));
    expect(fit.rows).toHaveLength(1);
    expect(fit.cut.fontSize).toBeGreaterThanOrEqual(8);
    expect(fit.width).toBeLessThanOrEqual(room(1366));
  });

  it('breaks to two rows at the drawn size on the iPad', () => {
    const fit = fitStationStrip(TABS, room(1024));
    expect(fit.rows).toHaveLength(2);
    expect(fit.cut).toBe(STRIP_CUTS[0]);
    expect(fit.width).toBeLessThanOrEqual(room(1024));
    // Balanced: neither row is a stub.
    expect(fit.rows[0].length).toBeGreaterThanOrEqual(4);
    expect(fit.rows[1].length).toBeGreaterThanOrEqual(4);
  });

  it('is as drawn, on one row, in the television stage (1600)', () => {
    const fit = fitStationStrip(TABS, room(1600));
    expect(fit.rows).toHaveLength(1);
    expect(fit.cut).toBe(STRIP_CUTS[0]);
  });

  it('keeps every station, once, in order, at any width', () => {
    for (let width = 120; width <= 1700; width += 7) {
      const fit = fitStationStrip(TABS, width);
      expect(flat(fit.rows)).toEqual(TABS.map((_, i) => i));
      if (fit.fits) expect(fit.width).toBeLessThanOrEqual(width + 1e-6);
    }
  });

  it('never uses more rows than a wider strip would', () => {
    let previous = Infinity;
    for (let width = 200; width <= 1700; width += 25) {
      const rows = fitStationStrip(TABS, width).rows.length;
      expect(rows).toBeLessThanOrEqual(previous);
      previous = rows;
    }
  });

  it('says so when one name is wider than the whole strip', () => {
    const fit = fitStationStrip(TABS, 100);
    expect(fit.fits).toBe(false);
    expect(fit.rows).toHaveLength(TABS.length);
  });

  it('answers an empty register', () => {
    expect(fitStationStrip([], 500)).toEqual({ rows: [], cut: STRIP_CUTS[0], width: 0, fits: true });
  });
});
