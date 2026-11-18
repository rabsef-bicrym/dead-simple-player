import { elapsedFraction } from '../elapsed';

const span = (startMin: number, stopMin: number) => ({
  start: new Date(Date.UTC(2026, 10, 18, 20, startMin)),
  stop: new Date(Date.UTC(2026, 10, 18, 20, stopMin)),
});
const at = (min: number) => Date.UTC(2026, 10, 18, 20, min);

describe('elapsedFraction', () => {
  it('runs from nothing at the start to the whole at the end', () => {
    expect(elapsedFraction(span(0, 40), at(0))).toBe(0);
    expect(elapsedFraction(span(0, 40), at(10))).toBeCloseTo(0.25);
    expect(elapsedFraction(span(0, 40), at(40))).toBe(1);
  });

  it('never runs off either end of the plate', () => {
    expect(elapsedFraction(span(10, 40), at(0))).toBe(0);
    expect(elapsedFraction(span(10, 40), at(59))).toBe(1);
  });

  it('draws nothing when there is no programme or no span', () => {
    expect(elapsedFraction(undefined, at(5))).toBeNull();
    expect(elapsedFraction(span(30, 30), at(30))).toBeNull();
    expect(elapsedFraction(span(40, 10), at(20))).toBeNull();
    expect(elapsedFraction({ start: new Date(NaN), stop: new Date(at(9)) }, at(5))).toBeNull();
  });
});
