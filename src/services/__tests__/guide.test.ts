import fs from 'fs';
import path from 'path';
import { parseM3U } from '../../parsers/m3u';
import { getNowPlaying, getUpcoming, parseXMLTV } from '../../parsers/xmltv';
import type { Channel, Programme } from '../../types';
import { indexProgrammes, programmeMaps } from '../guide';

const channel = (id: string): Channel => ({ id, name: id, number: 1, streamUrl: '' });
const at = (minutes: number) => new Date(minutes * 60_000);
const programme = (title: string, start: number, stop: number, channelId = 'one'): Programme => ({
  title, start: at(start), stop: at(stop), channelId, categories: [], previouslyShown: false,
});

describe('indexed receiver guide', () => {
  it('preserves feed order, object identity, and the input array', () => {
    const late = programme('Late', 20, 30);
    const early = programme('Early', 0, 10);
    const other = programme('Other', 0, 10, 'two');
    const input = Object.freeze([late, other, early]);
    const index = indexProgrammes(input);
    expect(index.get('one')).toEqual([late, early]);
    expect(index.get('one')![0]).toBe(late);
    expect(index.get('two')).toEqual([other]);
    programmeMaps([channel('one')], index, at(0));
    expect(index.get('one')).toEqual([late, early]);
    expect(input).toEqual([late, other, early]);
  });

  it('keeps the first feed entry for overlapping airings, but sorts upcoming entries', () => {
    const first = programme('First in feed', 5, 25);
    const earlier = programme('Starts earlier', 0, 15);
    const next = programme('Next', 20, 30);
    const later = programme('Later', 30, 40);
    const maps = programmeMaps([channel('one')], indexProgrammes([first, later, next, earlier]), at(10));
    expect(maps.nowPlayingMap.get('one')).toBe(first);
    expect(maps.upNextMap.get('one')).toBe(next);
  });

  it('uses inclusive starts, exclusive stops, and strictly future next entries', () => {
    const ended = programme('Ended', 0, 10);
    const current = programme('Current', 10, 20);
    const tiny = programme('Zero duration', 11, 11);
    const maps = programmeMaps([channel('one')], indexProgrammes([ended, current, tiny]), at(10));
    expect(maps.nowPlayingMap.get('one')).toBe(current);
    expect(maps.upNextMap.get('one')).toBe(tiny);
  });

  it('retains the six-entry limit before excluding interstitials', () => {
    const glue = Array.from({ length: 6 }, (_, i) => programme('INTERSTITIAL', i + 1, i + 2));
    const next = programme('Real programme', 7, 8);
    expect(programmeMaps([channel('one')], indexProgrammes([...glue, next]), at(0)).upNextMap.size).toBe(0);
    expect(programmeMaps([channel('one')], indexProgrammes([...glue.slice(1), next]), at(0)).upNextMap.get('one')).toBe(next);
  });

  it('keeps feed order when future start times tie', () => {
    const first = programme('First', 10, 20);
    const second = programme('Second', 10, 20);
    expect(programmeMaps([channel('one')], indexProgrammes([first, second]), at(0)).upNextMap.get('one')).toBe(first);
  });

  it('omits missing or expired guide entries and channels absent from the playlist', () => {
    const maps = programmeMaps([channel('one'), channel('missing')], indexProgrammes([
      programme('Expired', 0, 5), programme('Unlisted', 0, 30, 'two'),
    ]), at(10));
    expect(maps.nowPlayingMap.size).toBe(0);
    expect(maps.upNextMap.size).toBe(0);
    expect(indexProgrammes([]).size).toBe(0);
  });

  it('matches the former full-guide lookups on real XMLTV at every programme boundary', () => {
    const fixtures = path.join(__dirname, '../../../test_data');
    const channels = parseM3U(fs.readFileSync(path.join(fixtures, 'channels.m3u'), 'utf8'), '127.0.0.1', 8409);
    const { programmes } = parseXMLTV(fs.readFileSync(path.join(fixtures, 'xmltv.xml'), 'utf8'));
    const index = indexProgrammes(programmes);
    for (const entry of programmes) {
      for (const now of [entry.start, entry.stop]) {
        const maps = programmeMaps(channels, index, now);
        for (const ch of channels) {
          expect(maps.nowPlayingMap.get(ch.id)).toBe(getNowPlaying(programmes, ch.id, now));
          const next = getUpcoming(programmes, ch.id, 6, now).find(
            (p) => p.start > now && !/interstitial/i.test(p.title),
          );
          expect(maps.upNextMap.get(ch.id)).toBe(next);
        }
      }
    }
  });
});
