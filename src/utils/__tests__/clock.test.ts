import { clock12, clockShort } from '../clock';

describe('cabinet clocks', () => {
  it.each([
    [0, 0, '12:00', '12:00 A.M.'],
    [0, 5, '12:05', '12:05 A.M.'],
    [9, 7, '9:07', '9:07 A.M.'],
    [11, 59, '11:59', '11:59 A.M.'],
    [12, 0, '12:00', '12:00 P.M.'],
    [13, 5, '1:05', '1:05 P.M.'],
    [23, 59, '11:59', '11:59 P.M.'],
  ])('preserves local time at %i:%i', (hour, minute, short, full) => {
    const date = new Date(2026, 6, 18, hour, minute);
    expect(clockShort(date)).toBe(short);
    expect(clock12(date)).toBe(full);
  });
});
