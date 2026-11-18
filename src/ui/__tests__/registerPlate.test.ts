import { engravedWidth } from '../engraverFit';
import { engraveRegisterName, registerNameRoom, registerWidth, REGISTER_NAME_CUT } from '../registerPlate';

const STATIONS = [
  'The Prisoner', "Nana's Picks", 'Television', 'Movies', 'Oddities',
  'Music', 'MST3K', 'Ghibli', 'For Your Information', 'Public 19',
];

// The composition widths the console is laid out at: the reference laptop,
// the kids' laptop, the iPad, and the 1600 a television's stage gives it.
const WIDTHS = [1440, 1366, 1024, 1600];

describe('registerWidth', () => {
  it('is the drawn 286 on the laptop and the television, and never under 215', () => {
    expect(registerWidth(1440)).toBe(286);
    expect(registerWidth(1600)).toBe(286);
    expect(registerWidth(1366)).toBeCloseTo(273.2, 6);
    expect(registerWidth(1024)).toBe(215);
    expect(registerWidth(768)).toBe(215);
  });
});

describe('the ten stations on the register', () => {
  for (const width of WIDTHS) {
    it(`engraves every name whole at ${width}`, () => {
      const register = registerWidth(width);
      const room = registerNameRoom(register);
      for (const station of STATIONS) {
        const cut = engraveRegisterName(station, register);
        expect(cut.fits).toBe(true);
        expect(cut.lines.join(' ')).toBe(station);
        expect(cut.lines.length).toBeLessThanOrEqual(2);
        expect(cut.fontSize).toBeGreaterThanOrEqual(REGISTER_NAME_CUT.minFontSize);
        for (const line of cut.lines) {
          expect(engravedWidth(line, cut.fontSize, cut.letterSpacing, 700)).toBeLessThanOrEqual(room - 2);
        }
      }
    });
  }

  it('leaves the names that always fitted exactly as drawn', () => {
    const drawn = REGISTER_NAME_CUT.tracking!(13);
    for (const station of STATIONS.filter((s) => s !== 'For Your Information')) {
      const cut = engraveRegisterName(station, registerWidth(1440));
      expect(cut).toEqual({ lines: [station], fontSize: 13, letterSpacing: drawn, fits: true });
    }
  });

  it('keeps FOR YOUR INFORMATION on one line where a slightly smaller cut takes it', () => {
    const laptop = engraveRegisterName('For Your Information', registerWidth(1440));
    expect(laptop.lines).toEqual(['For Your Information']);
    expect(laptop.fontSize).toBeGreaterThanOrEqual(11.5);
  });

  it('breaks it at a word, at the drawn size, on the iPad', () => {
    const ipad = engraveRegisterName('For Your Information', registerWidth(1024));
    expect(ipad.lines).toEqual(['For Your', 'Information']);
    expect(ipad.fontSize).toBeGreaterThanOrEqual(12.5);
  });

  it('keeps THE PRISONER on one line on the iPad, within half a point of the drawn size', () => {
    const ipad = engraveRegisterName('The Prisoner', registerWidth(1024));
    expect(ipad.lines).toEqual(['The Prisoner']);
    expect(ipad.fontSize).toBeGreaterThanOrEqual(12.5);
    expect(ipad.letterSpacing).toBeLessThan(REGISTER_NAME_CUT.tracking!(13));
  });
});
