import type { Programme } from '../../types';
import { boardRows } from '../boardRows';
import { conjoinEvening } from '../evening';

const at = (hour: number, minute = 0) => new Date(2026, 6, 18, hour, minute);
const programme = (hour: number, extra: Partial<Programme> = {}): Programme => ({
  channelId: 'one', start: at(hour), stop: at(hour + 1), title: `Programme ${hour}`,
  categories: [], previouslyShown: false, ...extra,
});
const evening = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(hour => programme(hour));

describe('board rows shared by both cabinets', () => {
  it.each([7, 8])('shows two past airings above live in a %i-row cabinet', (count) => {
    const rows = boardRows(evening, at(4, 30), 0, count);
    expect(rows).toHaveLength(count);
    expect(rows.map(row => row.prog)).toEqual(evening.slice(2, 2 + count));
    expect(rows.map(row => row.past)).toEqual([true, true, ...Array(count - 2).fill(false)]);
    expect(rows[2].live).toBe(true);
    expect(rows[3].next).toBe(true);
    expect(rows.filter(row => row.live)).toHaveLength(1);
    expect(rows.filter(row => row.next)).toHaveLength(1);
  });

  it('keeps formatting, episode titles, descriptions, and original programme identity', () => {
    const p = programme(12, { subtitle: 'Episode', year: '1967', description: 'Notes' });
    expect(boardRows([p], at(12, 15), 0, 7)[2]).toEqual({
      time: '12:00', title: 'Episode', year: '1967', note: 'Notes',
      live: true, past: false, next: false, prog: p,
    });
    expect(boardRows([p], at(12, 15), 0, 7)[2].prog).toBe(p);
  });

  it('uses blank rows before and after the schedule', () => {
    const rows = boardRows([programme(0)], at(0, 30), 0, 7);
    expect(rows.map(row => row.prog?.title)).toEqual([undefined, undefined, 'Programme 0', undefined, undefined, undefined, undefined]);
    for (const row of [rows[0], rows[1], rows[3]]) {
      expect(row).toEqual({ time: '', title: '', year: '', note: '', live: false, past: false, next: false });
    }
  });

  it('preserves the existing no-live fallback, including its first-row next marker', () => {
    for (const now of [at(0), at(12)]) {
      const rows = boardRows([programme(4), programme(5)], now, 0, 7);
      expect(rows[0].prog?.title).toBe('Programme 4');
      expect(rows[0].next).toBe(true);
      expect(rows.every(row => !row.live && !row.past)).toBe(true);
    }
  });

  it('uses half-open airing boundaries and keeps the first overlapping airing', () => {
    expect(boardRows(evening, at(4), 0, 7)[2].prog).toBe(evening[4]);
    const overlap = [programme(2, { stop: at(5) }), programme(3)];
    expect(boardRows(overlap, at(3, 30), 0, 7)[2].prog).toBe(overlap[0]);
  });

  it('pages in either direction without moving the live airing or mutating the schedule', () => {
    const input = Object.freeze([...evening]);
    expect(boardRows(input, at(4, 30), 1, 7)[1].prog).toBe(evening[4]);
    expect(boardRows(input, at(4, 30), -1, 7)[3].prog).toBe(evening[4]);
    expect(boardRows(input, at(4, 30), -8, 7)[6].prog).toBe(evening[0]);
    expect(boardRows(input, at(4, 30), 30, 7).every(row => !row.prog)).toBe(true);
    expect(input).toEqual(evening);
  });

  it('handles an empty guide and optional metadata', () => {
    expect(boardRows([], at(4), 0, 7).every(row => !row.prog)).toBe(true);
    expect(boardRows(evening, at(4), 0, 7)[2]).toMatchObject({ title: 'Programme 4', year: '', note: '' });
  });

  it('shows the same conjoined airing while retaining separate episodes', () => {
    const input = [
      programme(1, { title: 'Series', subtitle: 'Episode one' }),
      programme(2, { title: 'Series', subtitle: 'Episode one' }),
      programme(3, { title: 'Series', subtitle: 'Episode two' }),
    ];
    const rows = boardRows(conjoinEvening(input, 'one'), at(2, 30), 0, 7);
    expect(rows[2]).toMatchObject({ title: 'Episode one', live: true, time: '1:00' });
    expect(rows[2].prog?.stop).toEqual(at(3));
    expect(rows[3]).toMatchObject({ title: 'Episode two', next: true });
  });
});
