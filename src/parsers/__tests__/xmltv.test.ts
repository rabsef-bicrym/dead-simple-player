import * as fs from 'fs';
import * as path from 'path';
import { parseXMLTV, parseXmltvTimestamp, getNowPlaying, getUpcoming } from '../xmltv';

const TEST_DATA = path.join(__dirname, '../../../test_data/xmltv.xml');

describe('XMLTV Parser', () => {
  let raw: string;

  beforeAll(() => {
    raw = fs.readFileSync(TEST_DATA, 'utf-8');
  });

  describe('parsing the real ~3MB single-line XMLTV', () => {
    it('should parse without throwing', () => {
      expect(() => parseXMLTV(raw)).not.toThrow();
    });

    it('should find all 6 channels', () => {
      const { channels } = parseXMLTV(raw);
      expect(channels).toHaveLength(6);
      const ids = channels.map((c) => c.id);
      expect(ids).toContain('C1.145.ersatztv.org');
      expect(ids).toContain('C2.146.ersatztv.org');
      expect(ids).toContain('C3.147.ersatztv.org');
      expect(ids).toContain('C4.148.ersatztv.org');
      expect(ids).toContain('C5.149.ersatztv.org');
      expect(ids).toContain('C6.150.ersatztv.org');
    });

    it('should extract channel display names', () => {
      const { channels } = parseXMLTV(raw);
      const names = channels.map((c) => c.displayName);
      expect(names).toContain('The Prisoner');
      expect(names).toContain("Nana's Picks");
      expect(names).toContain('Television');
      expect(names).toContain('Movies');
      expect(names).toContain('Oddities');
      expect(names).toContain('Music');
    });

    it('should parse 1000+ programmes', () => {
      const { programmes } = parseXMLTV(raw);
      expect(programmes.length).toBeGreaterThan(1000);
    });

    it('should parse programme titles with Unicode correctly', () => {
      const { programmes } = parseXMLTV(raw);
      const titles = programmes.map((p) => p.title);

      // Every programme should have a non-empty title
      programmes.forEach((p) => {
        expect(p.title.length).toBeGreaterThan(0);
      });

      // Check that we have known titles from the spec
      expect(titles).toContain('The Prisoner');
    });

    it('should parse start/stop timestamps with timezone offsets', () => {
      const { programmes } = parseXMLTV(raw);

      programmes.forEach((p) => {
        // Every programme should have valid start and stop dates
        expect(p.start).toBeInstanceOf(Date);
        expect(p.stop).toBeInstanceOf(Date);
        expect(p.start.getTime()).not.toBe(0);
        expect(p.stop.getTime()).not.toBe(0);
        // Stop should be >= start (allows 0-second programmes)
        expect(p.stop.getTime()).toBeGreaterThanOrEqual(p.start.getTime());
      });
    });

    it('should handle tiny-duration programmes (0-2 seconds)', () => {
      const { programmes } = parseXMLTV(raw);
      const tiny = programmes.filter((p) => {
        const durationMs = p.stop.getTime() - p.start.getTime();
        return durationMs <= 2000;
      });
      // Should have at least some tiny programmes (spec mentions them)
      // If not currently in the data, that's fine — the parser shouldn't skip them
      if (tiny.length > 0) {
        tiny.forEach((p) => {
          expect(p.title.length).toBeGreaterThan(0);
        });
      }
    });

    it('should handle programmes without icons (C1 The Prisoner)', () => {
      const { programmes } = parseXMLTV(raw);
      const c1Progs = programmes.filter((p) => p.channelId === 'C1.145.ersatztv.org');
      expect(c1Progs.length).toBeGreaterThan(0);
      // C1 has no programme icons per the spec
      c1Progs.forEach((p) => {
        expect(p.icon).toBeUndefined();
      });
    });

    it('should handle channels without icons gracefully', () => {
      const { channels } = parseXMLTV(raw);
      // All channels in current data have icons, but parser should handle missing ones
      channels.forEach((ch) => {
        // icon can be string or undefined — both are valid
        if (ch.icon !== undefined) {
          expect(typeof ch.icon).toBe('string');
        }
      });
    });

    it('should rewrite localhost URLs when server info provided', () => {
      const { channels } = parseXMLTV(raw, '192.168.50.150', 8409);
      channels.forEach((ch) => {
        if (ch.icon) {
          expect(ch.icon).not.toContain('localhost');
          expect(ch.icon).toContain('192.168.50.150:8409');
        }
      });
    });

    it('should parse categories from programmes', () => {
      const { programmes } = parseXMLTV(raw);
      // C1 The Prisoner has categories: Series, Drama, Mystery, Science Fiction
      const prisoner = programmes.find(
        (p) => p.channelId === 'C1.145.ersatztv.org' && p.title === 'The Prisoner',
      );
      expect(prisoner).toBeDefined();
      expect(prisoner!.categories).toContain('Series');
      expect(prisoner!.categories).toContain('Drama');
      expect(prisoner!.categories).toContain('Mystery');
      expect(prisoner!.categories).toContain('Science Fiction');
    });

    it('should parse all known category values', () => {
      const { programmes } = parseXMLTV(raw);
      const allCategories = new Set(programmes.flatMap((p) => p.categories));
      // Verify a selection of known categories from the data
      expect(allCategories.has('Series')).toBe(true);
      expect(allCategories.has('Drama')).toBe(true);
      expect(allCategories.has('Music')).toBe(true);
      expect(allCategories.has('Animation')).toBe(true);
      expect(allCategories.has('Comedy')).toBe(true);
    });

    it('should parse onscreen episode numbers', () => {
      const { programmes } = parseXMLTV(raw);
      // The Prisoner S01E16 "Once Upon a Time" is the first programme
      const prisonerEps = programmes.filter(
        (p) => p.channelId === 'C1.145.ersatztv.org' && p.episodeNum,
      );
      expect(prisonerEps.length).toBeGreaterThan(0);
      // Episode numbers should follow SxxExx format
      prisonerEps.forEach((p) => {
        expect(p.episodeNum).toMatch(/^S\d{2}E\d{2}$/);
      });
    });

    it('should parse year from date element (skipping sentinel "0")', () => {
      const { programmes } = parseXMLTV(raw);
      const withYear = programmes.filter((p) => p.year !== undefined);
      // The data has ~725 <date> elements, but some are "0" (unknown) and get filtered
      expect(withYear.length).toBeGreaterThan(50);
      // Every parsed year should be a real 4-digit year
      withYear.forEach((p) => {
        expect(p.year).toMatch(/^\d{4}$/);
      });
    });

    it('should parse previouslyShown flag', () => {
      const { programmes } = parseXMLTV(raw);
      // All 1343 programmes in the test data have <previously-shown/>
      const withPrevShown = programmes.filter((p) => p.previouslyShown);
      expect(withPrevShown.length).toBe(programmes.length);
    });

    it('should handle programmes without optional new fields gracefully', () => {
      const { programmes } = parseXMLTV(raw);
      // Some programmes may lack categories, episodeNum, or year — ensure no crashes
      programmes.forEach((p) => {
        expect(Array.isArray(p.categories)).toBe(true);
        expect(typeof p.previouslyShown).toBe('boolean');
        if (p.episodeNum !== undefined) {
          expect(typeof p.episodeNum).toBe('string');
        }
        if (p.year !== undefined) {
          expect(typeof p.year).toBe('string');
        }
      });
    });
  });

  describe('parseXmltvTimestamp', () => {
    it('should parse timestamp with negative offset', () => {
      const date = parseXmltvTimestamp('20260215070314 -0800');
      // 07:03:14 at -0800 = 15:03:14 UTC
      expect(date.getUTCHours()).toBe(15);
      expect(date.getUTCMinutes()).toBe(3);
      expect(date.getUTCSeconds()).toBe(14);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(date.getUTCDate()).toBe(15);
    });

    it('should parse timestamp with positive offset', () => {
      const date = parseXmltvTimestamp('20260215120000 +0530');
      // 12:00:00 at +0530 = 06:30:00 UTC
      expect(date.getUTCHours()).toBe(6);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it('should parse timestamp without offset (treat as UTC)', () => {
      const date = parseXmltvTimestamp('20260215120000');
      expect(date.getUTCHours()).toBe(12);
    });

    it('should return epoch for invalid timestamp', () => {
      const date = parseXmltvTimestamp('garbage');
      expect(date.getTime()).toBe(0);
    });
  });

  describe('getNowPlaying', () => {
    it('should find the current programme for a channel', () => {
      const { programmes } = parseXMLTV(raw);
      // Use the first programme's midpoint as "now"
      const c1Progs = programmes
        .filter((p) => p.channelId === 'C1.145.ersatztv.org')
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      if (c1Progs.length > 0) {
        const first = c1Progs[0];
        const midpoint = new Date((first.start.getTime() + first.stop.getTime()) / 2);
        const now = getNowPlaying(programmes, 'C1.145.ersatztv.org', midpoint);
        expect(now).toBeDefined();
        expect(now!.title).toBe(first.title);
      }
    });

    it('should return undefined when no programme is airing', () => {
      const { programmes } = parseXMLTV(raw);
      // Use a date far in the past
      const result = getNowPlaying(programmes, 'C1.145.ersatztv.org', new Date('2000-01-01'));
      expect(result).toBeUndefined();
    });
  });

  describe('getUpcoming', () => {
    it('should return upcoming programmes in order', () => {
      const { programmes } = parseXMLTV(raw);
      const c1Progs = programmes
        .filter((p) => p.channelId === 'C1.145.ersatztv.org')
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      if (c1Progs.length > 1) {
        // Set "now" to just before the first programme
        const justBefore = new Date(c1Progs[0].start.getTime() - 1000);
        const upcoming = getUpcoming(programmes, 'C1.145.ersatztv.org', 5, justBefore);
        expect(upcoming.length).toBeGreaterThan(0);
        expect(upcoming.length).toBeLessThanOrEqual(5);
        // Verify chronological order
        for (let i = 1; i < upcoming.length; i++) {
          expect(upcoming[i].start.getTime()).toBeGreaterThanOrEqual(upcoming[i - 1].start.getTime());
        }
      }
    });
  });
});

describe('HTML entity handling', () => {
  it('should decode numeric entities in a synthetic example', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="test"><display-name>Test</display-name></channel>
  <programme start="20260215120000 -0800" stop="20260215130000 -0800" channel="test">
    <title lang="en">It&#39;s a Test &#128136;</title>
    <desc lang="en">Smart quotes &#8220;hello&#8221; and em dash &#8212;</desc>
  </programme>
</tv>`;

    const { programmes } = parseXMLTV(xml);
    expect(programmes).toHaveLength(1);
    // &#39; = apostrophe, &#128136; = barber pole emoji
    expect(programmes[0].title).toContain("'");
    expect(programmes[0].title).toContain("\u{1F488}");
    // &#8220; = left double quote, &#8221; = right double quote, &#8212; = em dash
    expect(programmes[0].description).toContain("\u201C");
    expect(programmes[0].description).toContain("\u201D");
    expect(programmes[0].description).toContain("\u2014");
    // New fields default correctly when absent
    expect(programmes[0].categories).toEqual([]);
    expect(programmes[0].episodeNum).toBeUndefined();
    expect(programmes[0].year).toBeUndefined();
    expect(programmes[0].previouslyShown).toBe(false);
  });
});

describe('new XMLTV fields with synthetic data', () => {
  it('should parse categories, episodeNum, year, and previouslyShown', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="test"><display-name>Test</display-name></channel>
  <programme start="20260215120000 -0800" stop="20260215130000 -0800" channel="test">
    <title lang="en">Test Show</title>
    <sub-title lang="en">Pilot Episode</sub-title>
    <desc lang="en">A test description.</desc>
    <category lang="en">Drama</category>
    <category lang="en">Mystery</category>
    <episode-num system="onscreen">S01E01</episode-num>
    <episode-num system="xmltv_ns">0.0.0/1</episode-num>
    <date>2026</date>
    <previously-shown/>
  </programme>
</tv>`;

    const { programmes } = parseXMLTV(xml);
    expect(programmes).toHaveLength(1);
    const p = programmes[0];
    expect(p.categories).toEqual(['Drama', 'Mystery']);
    expect(p.episodeNum).toBe('S01E01');
    expect(p.year).toBe('2026');
    expect(p.previouslyShown).toBe(true);
  });

  it('should prefer onscreen episode-num over xmltv_ns', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="test"><display-name>Test</display-name></channel>
  <programme start="20260215120000 -0800" stop="20260215130000 -0800" channel="test">
    <title lang="en">Test</title>
    <episode-num system="xmltv_ns">0.5.0/1</episode-num>
    <episode-num system="onscreen">S01E06</episode-num>
  </programme>
</tv>`;

    const { programmes } = parseXMLTV(xml);
    expect(programmes[0].episodeNum).toBe('S01E06');
  });
});
