import { flapNote } from '../flapNote';

describe('flapNote', () => {
  it('leaves a remark that fits alone', () => {
    expect(flapNote('A short remark.', 56)).toBe('A short remark.');
    expect(flapNote(undefined, 56)).toBe('');
    expect(flapNote('  spaced \n out  ', 56)).toBe('spaced out');
  });

  it('ends on a whole word, never mid-word', () => {
    const text = 'The title is from Goethe. "Du mußt Amboß oder Hammer sein," which the script renders plainly.';
    const cut = flapNote(text, 56);
    expect(cut.length).toBeLessThanOrEqual(56);
    expect(text.startsWith(cut)).toBe(true);
    // The character after the cut is a space: the cut fell between words.
    expect(text[cut.length]).toMatch(/[\s,]/);
  });

  it('takes the first sentence when it fills enough of the run', () => {
    expect(flapNote('Patrick McGoohan was bored. That was his word for it, and he said so.', 56))
      .toBe('Patrick McGoohan was bored.');
  });

  it('does not take a first sentence too short to be a remark', () => {
    const cut = flapNote('No. It was the sixth episode they shot but the sixteenth they aired, by a distance.', 56);
    expect(cut.length).toBeGreaterThan(30);
  });

  it('does not leave the line hanging on a leading word', () => {
    //                   0         1         2         3         4         5
    //                   0123456789012345678901234567890123456789012345678901234567
    const cut = flapNote('This episode was the fourth produced but the eighth of the series to be broadcast', 56);
    expect(cut).toBe('This episode was the fourth produced but the eighth');
  });

  it('drops trailing joining punctuation', () => {
    expect(flapNote('Shot back to back with the one before it, and then some more words follow here', 43))
      .toBe('Shot back to back with the one before it');
  });

  it('cuts a single unbreakable word rather than show nothing', () => {
    expect(flapNote('Supercalifragilisticexpialidocious', 10)).toBe('Supercalif');
  });
});
