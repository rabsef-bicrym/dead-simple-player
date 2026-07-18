import { parseEssay } from '../essay';

describe('parseEssay', () => {
  it('renders a flattened single-line essay as one section, one paragraph', () => {
    const sections = parseEssay(
      'Orson Welles was twenty-five years old and had never made a film. RKO gave him final cut.',
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBeUndefined();
    expect(sections[0].paragraphs).toHaveLength(1);
  });

  it('honors paragraph breaks when the server preserves them', () => {
    const sections = parseEssay('First paragraph.\n\nSecond paragraph.\n\nThird.');
    expect(sections).toHaveLength(1);
    expect(sections[0].paragraphs).toEqual([
      'First paragraph.',
      'Second paragraph.',
      'Third.',
    ]);
  });

  it('detects MST3K section markers even in flattened text', () => {
    const text =
      'The third episode of the national run. THE MOVIE: "The Mad Monster" (1942), directed by Sam Newfield. THE SHORT: Chapter 2 of "Radar Men from the Moon". THIS RECORDING: A rerun airing May 17, 1991.';
    const sections = parseEssay(text);
    expect(sections).toHaveLength(4);
    expect(sections[0].header).toBeUndefined();
    expect(sections[1].header).toBe('THE MOVIE');
    expect(sections[2].header).toBe('THE SHORT');
    expect(sections[3].header).toBe('THIS RECORDING');
    expect(sections[1].paragraphs[0]).toContain('Sam Newfield');
  });

  it('handles empty and whitespace-only text', () => {
    expect(parseEssay('')).toHaveLength(0);
    expect(parseEssay('   ')).toHaveLength(0);
  });

  it('collapses internal whitespace within paragraphs', () => {
    const sections = parseEssay('Text  with   runs\tof spaces.');
    expect(sections[0].paragraphs[0]).toBe('Text with runs of spaces.');
  });
});
