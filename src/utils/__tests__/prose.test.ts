import { greeting, timeToProse } from '../prose';

describe('timeToProse', () => {
  it('uses singular minute after the hour', () => {
    expect(timeToProse(new Date(2026, 7, 3, 9, 1))).toBe('one minute past nine');
  });

  it('uses singular minute before the hour', () => {
    expect(timeToProse(new Date(2026, 7, 3, 9, 59))).toBe('one minute to ten');
  });

  it('carries the singular form into the Home greeting', () => {
    expect(greeting(new Date(2026, 7, 3, 9, 59))).toBe('Good morning. It is Monday, one minute to ten.');
  });
});
