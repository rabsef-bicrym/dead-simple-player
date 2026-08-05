import { conjoinEvening, boardTitle } from '../evening';
import type { Programme } from '../../types';

function prog(over: Partial<Programme>): Programme {
  return {
    channelId: 'C7',
    start: new Date('2026-08-05T20:00:00'),
    stop: new Date('2026-08-05T21:30:00'),
    title: 'Mystery Science Theater 3000',
    ...over,
  } as Programme;
}

describe('conjoinEvening', () => {
  it('does not conjoin distinct episodes sharing a series title', () => {
    const evening = conjoinEvening(
      [
        prog({ subtitle: 'Girls Town', start: new Date('2026-08-05T20:00:00'), stop: new Date('2026-08-05T21:30:00') }),
        prog({ subtitle: 'Invasion USA', start: new Date('2026-08-05T21:30:00'), stop: new Date('2026-08-05T23:00:00') }),
        prog({ subtitle: 'The Dead Talk Back', start: new Date('2026-08-05T23:00:00'), stop: new Date('2026-08-06T00:30:00') }),
      ],
      'C7',
    );
    expect(evening).toHaveLength(3);
    expect(evening.map(boardTitle)).toEqual(['Girls Town', 'Invasion USA', 'The Dead Talk Back']);
  });

  it('still conjoins a true back-to-back repeat of the same airing', () => {
    const evening = conjoinEvening(
      [
        prog({ title: 'A Race Horse', subtitle: undefined, start: new Date('2026-08-05T20:00:00'), stop: new Date('2026-08-05T20:10:00') }),
        prog({ title: 'A Race Horse', subtitle: undefined, start: new Date('2026-08-05T20:10:00'), stop: new Date('2026-08-05T20:20:00') }),
      ],
      'C7',
    );
    expect(evening).toHaveLength(1);
    expect(evening[0].stop).toEqual(new Date('2026-08-05T20:20:00'));
  });

  it('keys on episode number when no sub-title exists', () => {
    const evening = conjoinEvening(
      [
        prog({ subtitle: undefined, episodeNum: 'S06E01', stop: new Date('2026-08-05T21:30:00') }),
        prog({ subtitle: undefined, episodeNum: 'S06E02', start: new Date('2026-08-05T21:30:00'), stop: new Date('2026-08-05T23:00:00') }),
      ],
      'C7',
    );
    expect(evening).toHaveLength(2);
  });

  it('filters interstitial glue and other channels', () => {
    const evening = conjoinEvening(
      [
        prog({ subtitle: 'Girls Town' }),
        prog({ title: 'Interstitial: Station Ident', subtitle: undefined }),
        prog({ channelId: 'C1', subtitle: 'The Chimes of Big Ben' }),
      ],
      'C7',
    );
    expect(evening).toHaveLength(1);
  });
});

describe('boardTitle', () => {
  it('prefers the episode name; the series is the channel context', () => {
    expect(boardTitle(prog({ subtitle: 'Manhunt in Space' }))).toBe('Manhunt in Space');
    expect(boardTitle(prog({ title: 'The Dark Crystal', subtitle: undefined }))).toBe('The Dark Crystal');
  });
});
