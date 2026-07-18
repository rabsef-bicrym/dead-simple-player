import * as fs from 'fs';
import * as path from 'path';
import { parseM3U } from '../m3u';

const TEST_DATA = path.join(__dirname, '../../../test_data/channels.m3u');

describe('M3U Parser', () => {
  let raw: string;

  beforeAll(() => {
    raw = fs.readFileSync(TEST_DATA, 'utf-8');
  });

  it('should parse all 6 channels from real data', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    expect(channels).toHaveLength(6);
  });

  it('should extract channel IDs correctly', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    const ids = channels.map((c) => c.id);
    expect(ids).toContain('C1.145.ersatztv.org');
    expect(ids).toContain('C2.146.ersatztv.org');
    expect(ids).toContain('C3.147.ersatztv.org');
    expect(ids).toContain('C4.148.ersatztv.org');
    expect(ids).toContain('C5.149.ersatztv.org');
    expect(ids).toContain('C6.150.ersatztv.org');
  });

  it('should extract channel names', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    const names = channels.map((c) => c.name);
    expect(names).toContain('The Prisoner');
    expect(names).toContain("Nana's Picks");
    expect(names).toContain('Television');
    expect(names).toContain('Movies');
    expect(names).toContain('Oddities');
    expect(names).toContain('Music');
  });

  it('should sort channels by number', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    const numbers = channels.map((c) => c.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should parse HLS segmenter stream URLs including query strings', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    channels.forEach((ch) => {
      expect(ch.streamUrl).toMatch(/\/iptv\/channel\/\d+\.m3u8\?mode=segmenter$/);
    });
  });

  it('should rewrite localhost URLs to server address', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    channels.forEach((ch) => {
      expect(ch.streamUrl).not.toContain('localhost');
      expect(ch.streamUrl).toContain('192.168.50.150:8409');
    });
  });

  it('should extract logo URLs and rewrite them', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    const prisoner = channels.find((c) => c.name === 'The Prisoner');
    expect(prisoner?.logo).toBeDefined();
    expect(prisoner?.logo).toContain('192.168.50.150:8409');
  });

  it('should handle URL-encoded logo paths', () => {
    const channels = parseM3U(raw, '192.168.50.150', 8409);
    const nana = channels.find((c) => c.id === 'C2.146.ersatztv.org');
    // Logo URL has percent-encoded apostrophe (Nana%27s)
    expect(nana?.logo).toContain('gen?text=');
  });
});
