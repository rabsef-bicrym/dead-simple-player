import { consoleMetrics, consoleScale, stageTransform, CONSOLE_MAX_SCALE } from '../consoleScale';

describe('consoleScale', () => {
  it('is exactly 1 at the reference drawing', () => {
    expect(consoleScale(1440, 900)).toBe(1);
  });

  it('is exactly 1 on anything smaller: the kids laptop, the iPad, a phone', () => {
    expect(consoleScale(1366, 768)).toBe(1);
    expect(consoleScale(1024, 768)).toBe(1);
    expect(consoleScale(768, 1024)).toBe(1);
    expect(consoleScale(390, 844)).toBe(1);
    expect(consoleScale(844, 390)).toBe(1);
  });

  it('is 1 when only one axis exceeds the reference', () => {
    expect(consoleScale(1920, 900)).toBe(1);
    expect(consoleScale(1440, 1400)).toBe(1);
    expect(consoleScale(2560, 800)).toBe(1);
  });

  it('enlarges televisions by the tighter axis', () => {
    expect(consoleScale(1920, 1080)).toBeCloseTo(1.2, 12);
    expect(consoleScale(2560, 1440)).toBeCloseTo(1.6, 12);
    expect(consoleScale(3840, 2160)).toBeCloseTo(2.4, 12);
    expect(consoleScale(3440, 1440)).toBeCloseTo(1.6, 12);
    expect(consoleScale(1600, 1200)).toBeCloseTo(1600 / 1440, 12);
  });

  it('never enlarges past the ceiling', () => {
    expect(consoleScale(5120, 2880)).toBe(CONSOLE_MAX_SCALE);
    expect(consoleScale(7680, 4320)).toBe(CONSOLE_MAX_SCALE);
  });

  it('answers 1 for a viewport that has not been measured yet', () => {
    expect(consoleScale(0, 0)).toBe(1);
    expect(consoleScale(NaN, 900)).toBe(1);
    expect(consoleScale(-1, -1)).toBe(1);
  });
});

describe('consoleMetrics', () => {
  it('leaves the reference and everything smaller untouched', () => {
    expect(consoleMetrics(1440, 900)).toEqual({ scale: 1, width: 1440, height: 900, gutter: 0 });
    expect(consoleMetrics(1366, 768)).toEqual({ scale: 1, width: 1366, height: 768, gutter: 0 });
    expect(consoleMetrics(1024, 768)).toEqual({ scale: 1, width: 1024, height: 768, gutter: 0 });
    expect(consoleMetrics(390, 844)).toEqual({ scale: 1, width: 390, height: 844, gutter: 0 });
  });

  it('gives a 16:9 television the 1600 by 900 drawing, exactly', () => {
    for (const [w, h] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
      const m = consoleMetrics(w, h);
      expect(m.width).toBe(1600);
      expect(m.height).toBe(900);
      expect(m.gutter).toBe(0);
    }
  });

  it('enlarged, the logical space fills the viewport', () => {
    for (const [w, h] of [[1920, 1080], [1920, 1000], [2560, 1080], [3440, 1440], [5120, 2880], [1600, 1200], [1500, 2000]]) {
      const m = consoleMetrics(w, h);
      expect(m.width * m.scale).toBeCloseTo(w, 9);
      expect(m.height * m.scale).toBeCloseTo(h, 9);
      // The drawing is never given less room than it was drawn in.
      expect(m.width).toBeGreaterThanOrEqual(1440);
      expect(m.height).toBeGreaterThanOrEqual(900);
    }
  });

  it('keeps an ultrawide composition together and centred', () => {
    const m = consoleMetrics(3440, 1440);
    expect(m.scale).toBeCloseTo(1.6, 12);
    expect(m.width).toBe(2150);
    expect(m.height).toBe(900);
    // 1600 of composition, 275 of margin each side.
    expect(m.gutter).toBe(275);
    expect(m.width - 2 * m.gutter).toBe(1600);
  });

  it('gives no margin to any display that is 16:9 or narrower', () => {
    expect(consoleMetrics(5120, 2880).gutter).toBe(0);
    expect(consoleMetrics(1600, 1200).gutter).toBe(0);
    expect(consoleMetrics(1366, 768).gutter).toBe(0);
  });

  it('margins a wide unscaled window too', () => {
    expect(consoleMetrics(1920, 800)).toEqual({ scale: 1, width: 1920, height: 800, gutter: 160 });
  });

  it('is the plain viewport when the stage does not scale (native)', () => {
    expect(consoleMetrics(3840, 2160, false)).toEqual({ scale: 1, width: 3840, height: 2160, gutter: 0 });
    expect(consoleMetrics(1024, 768, false)).toEqual({ scale: 1, width: 1024, height: 768, gutter: 0 });
  });
});

describe('stageTransform', () => {
  it('carries the stage so its top-left corner stays on the viewport corner', () => {
    for (const [w, h] of [[1920, 1080], [3840, 2160], [3440, 1440], [2560, 1080]]) {
      const m = consoleMetrics(w, h);
      const [{ translateX }, { translateY }, { scale }] = stageTransform(m);
      // A view scales about its centre: a point p lands at centre + s·(p − centre) + t.
      const landX = (p: number) => m.width / 2 + scale * (p - m.width / 2) + translateX;
      const landY = (p: number) => m.height / 2 + scale * (p - m.height / 2) + translateY;
      expect(landX(0)).toBeCloseTo(0, 9);
      expect(landY(0)).toBeCloseTo(0, 9);
      expect(landX(m.width)).toBeCloseTo(w, 9);
      expect(landY(m.height)).toBeCloseTo(h, 9);
    }
  });

  it('is the identity at scale 1', () => {
    expect(stageTransform(consoleMetrics(1440, 900))).toEqual([
      { translateX: 0 }, { translateY: 0 }, { scale: 1 },
    ]);
  });
});
