import type { Cabinet } from '../commands';
import {
  DIAL_END_POLICY,
  SWIPE_THRESHOLD,
  dialEndPolicy,
  keyToCommand,
  keyboardShouldIgnore,
  mediaSessionToCommand,
  stepIndex,
  swipeToCommand,
  type Mode,
  type TuneStepOrigin,
} from '../remote';

const CONSOLE: Cabinet = { isPhone: false, landscape: true };
const PHONE_L: Cabinet = { isPhone: true, landscape: true };
const PHONE_P: Cabinet = { isPhone: true, landscape: false };

const at = { index: 3, dial: 5, boardIndex: 7, count: 10 };
const watching: Mode = { base: 'watching', board: false, notes: false, ...at };
const home: Mode = { base: 'home', board: false, notes: false, ...at };
const board: Mode = { base: 'watching', board: true, notes: false, ...at };

describe('keyboardShouldIgnore (PW-01)', () => {
  it('ignores everything when the screen is not focused (the Service Panel keeps watch mounted beneath it)', () => {
    expect(keyboardShouldIgnore({}, false)).toBe(true);
  });

  it('ignores held keys — one tune, not a pipeline teardown per repeat', () => {
    expect(keyboardShouldIgnore({ repeat: true }, true)).toBe(true);
  });

  it('ignores modified keys — Cmd+L is the address bar, not STOP', () => {
    expect(keyboardShouldIgnore({ metaKey: true }, true)).toBe(true);
    expect(keyboardShouldIgnore({ ctrlKey: true }, true)).toBe(true);
    expect(keyboardShouldIgnore({ altKey: true }, true)).toBe(true);
  });

  it('does not treat shift as a modifier: P is a key of its own', () => {
    expect(keyboardShouldIgnore({ shiftKey: true }, true)).toBe(false);
  });

  it('ignores keys typed into a field', () => {
    expect(keyboardShouldIgnore({ target: { tagName: 'INPUT' } }, true)).toBe(true);
    expect(keyboardShouldIgnore({ target: { tagName: 'textarea' } }, true)).toBe(true);
    expect(keyboardShouldIgnore({ target: { tagName: 'DIV', isContentEditable: true } }, true)).toBe(true);
  });

  it('lets a plain key on a plain target through', () => {
    expect(keyboardShouldIgnore({ target: { tagName: 'DIV' } }, true)).toBe(false);
    expect(keyboardShouldIgnore({ target: { tagName: 'BODY', isContentEditable: false } }, true)).toBe(false);
    expect(keyboardShouldIgnore({ target: null }, true)).toBe(false);
    expect(keyboardShouldIgnore({}, true)).toBe(false);
  });
});

describe('keyToCommand — the rows the matrix cannot say in prose', () => {
  it('lets the arrows belong to the notes in every mode', () => {
    for (const mode of [watching, home, board]) {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        expect(keyToCommand({ ...mode, notes: true }, key, CONSOLE)).toBeNull();
      }
    }
  });

  it('closes the board with the shade on phone portrait and outright elsewhere', () => {
    expect(keyToCommand(board, 'g', PHONE_P)).toEqual({ type: 'BOARD_CLOSING' });
    expect(keyToCommand(board, 'Escape', PHONE_P)).toEqual({ type: 'BOARD_CLOSING' });
    expect(keyToCommand(board, 'g', PHONE_L)).toEqual({ type: 'CLOSE_BOARD' });
    expect(keyToCommand(board, 'Escape', CONSOLE)).toEqual({ type: 'CLOSE_BOARD' });
  });

  it('closes the notes before the board on g/Escape/n', () => {
    const closeNotes = { type: 'NOTES', programme: null };
    expect(keyToCommand({ ...board, notes: true }, 'g', PHONE_P)).toEqual(closeNotes);
    expect(keyToCommand({ ...board, notes: true }, 'Escape', CONSOLE)).toEqual(closeNotes);
    expect(keyToCommand({ ...board, notes: true }, 'n', CONSOLE)).toEqual(closeNotes);
  });

  it('has a dead Escape at the receiver and no key that closes notes there', () => {
    expect(keyToCommand(home, 'Escape', CONSOLE)).toBeNull();
    expect(keyToCommand({ ...home, notes: true }, 'Escape', CONSOLE)).toBeNull();
    expect(keyToCommand({ ...home, notes: true }, 'n', CONSOLE)).toBeNull();
  });

  it('tunes bounded from the keyboard while watching', () => {
    expect(keyToCommand(watching, 'ArrowUp', CONSOLE)).toEqual({ type: 'TUNE_REQUESTED', index: 4, origin: 'remote' });
    expect(keyToCommand(watching, 'ArrowDown', CONSOLE)).toEqual({ type: 'TUNE_REQUESTED', index: 2, origin: 'remote' });
    expect(keyToCommand({ ...watching, index: 9 }, 'ArrowUp', CONSOLE)).toBeNull();
    expect(keyToCommand({ ...watching, index: 0 }, 'ArrowDown', CONSOLE)).toBeNull();
  });

  it('offers PICTURE OUT only when the cabinet does', () => {
    expect(keyToCommand(watching, 'p', CONSOLE)).toBeNull();
    expect(keyToCommand({ ...watching, pictureOutAvailable: true }, 'p', CONSOLE)).toEqual({ type: 'PICTURE_OUT' });
    expect(keyToCommand({ ...watching, pictureOutAvailable: true }, 'P', CONSOLE)).toEqual({ type: 'PICTURE_OUT' });
  });

  it('routes by the board first, whatever the base', () => {
    expect(keyToCommand({ ...home, board: true }, 'Enter', CONSOLE)).toEqual({ type: 'TUNE', index: 7, origin: 'board' });
    expect(keyToCommand({ ...watching, base: 'stopping', board: true }, 'h', CONSOLE)).toEqual({ type: 'OPEN_HOME', index: 7, entrance: 'none' });
  });

  it('falls through to the watching vocabulary for stopping, off and signoff', () => {
    for (const base of ['stopping', 'off', 'signoff'] as const) {
      expect(keyToCommand({ ...watching, base }, 'g', CONSOLE)).toEqual({ type: 'OPEN_BOARD', index: 3 });
      expect(keyToCommand({ ...watching, base }, 'h', CONSOLE)).toEqual({ type: 'STOP' });
      expect(keyToCommand({ ...watching, base }, 'Escape', CONSOLE)).toEqual({ type: 'STOP' });
    }
  });

  it('answers nothing to a key outside the vocabulary', () => {
    for (const mode of [watching, home, board]) {
      expect(keyToCommand(mode, 'x', CONSOLE)).toBeNull();
      expect(keyToCommand(mode, ' ', CONSOLE)).toBeNull();
      expect(keyToCommand(mode, 'Tab', CONSOLE)).toBeNull();
    }
  });
});

describe('swipeToCommand — the guards', () => {
  it('acts only on a pan that ended', () => {
    expect(swipeToCommand(watching, { dx: -200, dy: 0, ended: false }, CONSOLE)).toBeNull();
    expect(swipeToCommand(watching, { dx: -200, dy: 0, ended: true }, CONSOLE)).toEqual({ type: 'OPEN_HOME', index: 3, entrance: 'none' });
    expect(swipeToCommand(watching, { dx: -200, dy: 0 }, CONSOLE)).toEqual({ type: 'OPEN_HOME', index: 3, entrance: 'none' });
  });

  it('needs more than the threshold everywhere but at the board, which takes exactly it', () => {
    expect(SWIPE_THRESHOLD).toBe(70);
    expect(swipeToCommand(watching, { dx: -70, dy: 0 }, CONSOLE)).toBeNull();
    expect(swipeToCommand(watching, { dx: -71, dy: 0 }, CONSOLE)).not.toBeNull();
    expect(swipeToCommand(home, { dx: -70, dy: 0 }, CONSOLE)).toBeNull();
    expect(swipeToCommand(home, { dx: -71, dy: 0 }, CONSOLE)).toEqual({ type: 'DIAL', dir: 1 });
    expect(swipeToCommand(board, { dx: -69, dy: 0 }, CONSOLE)).toBeNull();
    expect(swipeToCommand(board, { dx: -70, dy: 0 }, CONSOLE)).toEqual({ type: 'BOARD_CHANNEL', dir: 1 });
    expect(swipeToCommand(board, { dx: -70, dy: 0 }, PHONE_P)).toEqual({ type: 'BOARD_CHANNEL', dir: 1 });
  });

  it('reads equal travel as vertical', () => {
    expect(swipeToCommand(watching, { dx: 100, dy: 100 }, CONSOLE)).toEqual({ type: 'TUNE', index: 2, origin: 'swipe' });
    expect(swipeToCommand(watching, { dx: -100, dy: -100 }, CONSOLE)).toEqual({ type: 'TUNE', index: 4, origin: 'swipe' });
    expect(swipeToCommand(board, { dx: 100, dy: 100 }, CONSOLE)).toEqual({ type: 'BOARD_CURSOR', dir: -1 });
  });

  it('leaves the fingers to the reading while notes are projected, before any other guard', () => {
    expect(swipeToCommand({ ...watching, notes: true, base: 'signoff' }, { dx: -200, dy: 0 }, PHONE_L)).toBeNull();
    expect(swipeToCommand({ ...board, notes: true }, { dx: -200, dy: 0 }, CONSOLE)).toBeNull();
  });

  it('swallows every swipe on the phone during sign-off, and only there', () => {
    for (const swipe of [{ dx: -200, dy: 0 }, { dx: 200, dy: 0 }, { dx: 0, dy: -200 }, { dx: 0, dy: 200 }]) {
      expect(swipeToCommand({ ...watching, base: 'signoff' }, swipe, PHONE_L)).toBeNull();
      expect(swipeToCommand({ ...watching, base: 'signoff' }, swipe, PHONE_P)).toBeNull();
    }
    // A console-sized display never shows sign-off; the handler has no guard for it there.
    expect(swipeToCommand({ ...watching, base: 'signoff' }, { dx: 200, dy: 0 }, CONSOLE)).toEqual({ type: 'OPEN_BOARD', index: 3 });
  });

  it('wraps the phone and the shifter, bounds the console', () => {
    expect(swipeToCommand({ ...watching, index: 9 }, { dx: -200, dy: 0 }, PHONE_L)).toEqual({ type: 'TUNE_REQUESTED', index: 0, origin: 'swipe' });
    expect(swipeToCommand({ ...watching, index: 0 }, { dx: 200, dy: 0 }, PHONE_P)).toEqual({ type: 'TUNE_REQUESTED', index: 9, origin: 'swipe' });
    expect(swipeToCommand({ ...home, dial: 9 }, { dx: -200, dy: 0 }, PHONE_L)).toEqual({ type: 'GATE', index: 0 });
    expect(swipeToCommand({ ...watching, index: 9 }, { dx: 0, dy: -200 }, CONSOLE)).toBeNull();
    expect(swipeToCommand({ ...watching, index: 0 }, { dx: 0, dy: 200 }, CONSOLE)).toBeNull();
  });

  it('gives portrait Home to the column: no swipe does anything there', () => {
    for (const swipe of [{ dx: -200, dy: 0 }, { dx: 200, dy: 0 }, { dx: 0, dy: -200 }, { dx: 0, dy: 200 }]) {
      expect(swipeToCommand(home, swipe, PHONE_P)).toBeNull();
    }
  });
});

describe('mediaSessionToCommand (watch.tsx:1059-1066)', () => {
  it('is a bounded dial', () => {
    expect(mediaSessionToCommand(watching, 'nexttrack')).toEqual({ type: 'TUNE_REQUESTED', index: 4, origin: 'remote' });
    expect(mediaSessionToCommand(watching, 'previoustrack')).toEqual({ type: 'TUNE_REQUESTED', index: 2, origin: 'remote' });
    expect(mediaSessionToCommand({ ...watching, index: 9 }, 'nexttrack')).toBeNull();
    expect(mediaSessionToCommand({ ...watching, index: 0 }, 'previoustrack')).toBeNull();
  });
});

describe('dial ends (decision 9: today’s split, in one table)', () => {
  it('bounds the console remote and keyboard; wraps the board, the dial and the phone', () => {
    expect(DIAL_END_POLICY).toEqual({
      'keyboard-watching': 'bounded',
      'media-session': 'bounded',
      'console-swipe-watching': 'bounded',
      'home-keys': 'wrapping',
      'home-swipe': 'wrapping',
      'board-keys': 'wrapping',
      'board-swipe': 'wrapping',
      shifter: 'wrapping',
      'phone-swipe-watching': 'wrapping',
      column: 'wrapping',
    });
  });

  it('steps each origin its own way at both ends', () => {
    for (const origin of Object.keys(DIAL_END_POLICY) as TuneStepOrigin[]) {
      const wraps = dialEndPolicy(origin) === 'wrapping';
      expect(stepIndex(9, 1, 10, origin)).toBe(wraps ? 0 : null);
      expect(stepIndex(0, -1, 10, origin)).toBe(wraps ? 9 : null);
      expect(stepIndex(4, 1, 10, origin)).toBe(5);
      expect(stepIndex(4, -1, 10, origin)).toBe(3);
    }
  });
});
