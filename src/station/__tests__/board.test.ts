import {
  CURSOR_HOME,
  ROWS_DS6,
  ROWS_DS8M,
  SCROLL_MAX,
  SCROLL_MIN,
  boundedStep,
  clampScroll,
  pageScroll,
  stepCursor,
  wrapIndex,
} from '../board';

describe('board constants (WS-08: declared once)', () => {
  it('names the literals watch.tsx repeats', () => {
    expect(ROWS_DS6).toBe(8);
    expect(ROWS_DS8M).toBe(7);
    expect(SCROLL_MIN).toBe(-8);
    expect(SCROLL_MAX).toBe(30);
    expect(CURSOR_HOME).toBe(2);
  });
});

describe('clampScroll / pageScroll', () => {
  it('keeps the scroll inside the board', () => {
    expect(clampScroll(0)).toBe(0);
    expect(clampScroll(31)).toBe(30);
    expect(clampScroll(-9)).toBe(-8);
    expect(clampScroll(30)).toBe(30);
    expect(clampScroll(-8)).toBe(-8);
  });

  it('pages exactly as the one-sided clamps at watch.tsx:757, 759, 794, 797, 937, 941', () => {
    for (let s = SCROLL_MIN; s <= SCROLL_MAX; s += 1) {
      expect(pageScroll(s, 1)).toBe(Math.min(s + 1, 30));
      expect(pageScroll(s, -1)).toBe(Math.max(s - 1, -8));
    }
  });
});

describe('stepCursor (watch.tsx:936-941, 793-797)', () => {
  it('walks the cursor down the eight rows, then pages', () => {
    for (let c = 0; c < ROWS_DS6 - 1; c += 1) {
      expect(stepCursor(c, 0, 1, ROWS_DS6)).toEqual({ cursor: c + 1, scroll: 0 });
    }
    expect(stepCursor(ROWS_DS6 - 1, 0, 1, ROWS_DS6)).toEqual({ cursor: ROWS_DS6 - 1, scroll: 1 });
  });

  it('walks the cursor back up, then pages', () => {
    for (let c = ROWS_DS6 - 1; c > 0; c -= 1) {
      expect(stepCursor(c, 0, -1, ROWS_DS6)).toEqual({ cursor: c - 1, scroll: 0 });
    }
    expect(stepCursor(0, 0, -1, ROWS_DS6)).toEqual({ cursor: 0, scroll: -1 });
  });

  it('stops paging at the cap and the floor', () => {
    expect(stepCursor(ROWS_DS6 - 1, SCROLL_MAX, 1, ROWS_DS6)).toEqual({ cursor: ROWS_DS6 - 1, scroll: SCROLL_MAX });
    expect(stepCursor(0, SCROLL_MIN, -1, ROWS_DS6)).toEqual({ cursor: 0, scroll: SCROLL_MIN });
  });

  it('matches the literal 7 the code uses for the console board', () => {
    // `if (boardCursor < 7) setBoardCursor(boardCursor + 1); else page` — the 7 is ROWS_DS6 - 1.
    for (let c = 0; c <= 7; c += 1) {
      const expected = c < 7 ? { cursor: c + 1, scroll: 3 } : { cursor: c, scroll: 4 };
      expect(stepCursor(c, 3, 1, ROWS_DS6)).toEqual(expected);
    }
  });

  it('pages a row earlier on the seven-row phone board when asked to', () => {
    expect(stepCursor(ROWS_DS8M - 1, 0, 1, ROWS_DS8M)).toEqual({ cursor: ROWS_DS8M - 1, scroll: 1 });
    // Today watch.tsx passes the DS-6 bound on the phone path too (WS-08).
    expect(stepCursor(ROWS_DS8M - 1, 0, 1, ROWS_DS6)).toEqual({ cursor: ROWS_DS8M, scroll: 0 });
  });
});

describe('wrapIndex', () => {
  it('equals (i + dir + n) % n for every station and both directions', () => {
    for (const n of [1, 2, 3, 6, 10]) {
      for (let i = 0; i < n; i += 1) {
        expect(wrapIndex(i + 1, n)).toBe((i + 1 + n) % n);
        expect(wrapIndex(i - 1, n)).toBe((i - 1 + n) % n);
      }
    }
  });

  it('wraps at both ends', () => {
    expect(wrapIndex(10, 10)).toBe(0);
    expect(wrapIndex(-1, 10)).toBe(9);
    expect(wrapIndex(-11, 10)).toBe(9);
    expect(wrapIndex(0, 1)).toBe(0);
    expect(wrapIndex(1, 1)).toBe(0);
  });

  it('answers 0 with no channels, where the code formula is NaN', () => {
    expect((0 + 1 + 0) % 0).toBeNaN();
    expect(wrapIndex(1, 0)).toBe(0);
  });
});

describe('boundedStep', () => {
  it('steps inside the dial and refuses the ends', () => {
    expect(boundedStep(3, 1, 10)).toBe(4);
    expect(boundedStep(3, -1, 10)).toBe(2);
    expect(boundedStep(9, 1, 10)).toBeNull();
    expect(boundedStep(0, -1, 10)).toBeNull();
    expect(boundedStep(0, 1, 10)).toBe(1);
    expect(boundedStep(9, -1, 10)).toBe(8);
  });

  it('has nowhere to go on a one-channel station', () => {
    expect(boundedStep(0, 1, 1)).toBeNull();
    expect(boundedStep(0, -1, 1)).toBeNull();
  });

  it('matches the guards at watch.tsx:989-993 for every station', () => {
    const n = 10;
    for (let i = 0; i < n; i += 1) {
      expect(boundedStep(i, 1, n)).toBe(i < n - 1 ? i + 1 : null);
      expect(boundedStep(i, -1, n)).toBe(i > 0 ? i - 1 : null);
    }
  });
});
