import * as fs from 'fs';
import * as path from 'path';
import { parseXMLTV } from '../xmltv';
import { parseXMLTV as parseReference } from './reference/xmltvReference';
import { fuzzDocument, rng } from './reference/xmltvFuzz';

/**
 * The forward-scan parser against the parser it replaced.
 *
 * `reference/xmltvReference.ts` is the fast-xml-parser implementation the
 * app shipped until this change, kept verbatim and imported by nothing but
 * this file. Every document below must come out of both the same: the same
 * objects, key for key and `undefined` for `undefined`, or both refusing it.
 */

const TEST_DATA = path.join(__dirname, '../../../test_data');

type Outcome = { parsed: ReturnType<typeof parseXMLTV> } | { threw: true };

function outcome(parse: typeof parseXMLTV, xml: string, host?: string, port?: number): Outcome {
  try {
    return { parsed: parse(xml, host, port) };
  } catch {
    return { threw: true };
  }
}

function expectParity(xml: string): void {
  expect(outcome(parseXMLTV, xml)).toStrictEqual(outcome(parseReference, xml));
  expect(outcome(parseXMLTV, xml, 'tv.local', 8409)).toStrictEqual(outcome(parseReference, xml, 'tv.local', 8409));
}

/** One programme per argument, each around the given children, in an otherwise tidy document. */
function doc(...inners: string[]): string {
  return '<?xml version="1.0" encoding="utf-8"?><tv generator-info-name="ersatztv">'
    + '<channel id="c1"><display-name>One</display-name></channel>'
    + inners
      .map((inner) => `<programme start="20260215070314 -0800" stop="20260215080314 -0800" channel="c1">${inner}</programme>`)
      .join('')
    + '</tv>';
}

describe('XMLTV parser parity with the reference parser', () => {
  describe('every fixture in test_data', () => {
    const fixtures = fs.readdirSync(TEST_DATA).filter((name) => name.endsWith('.xml'));

    it('finds at least the station fixture', () => {
      expect(fixtures).toContain('xmltv.xml');
    });

    it.each(fixtures)('%s parses to the same guide', (name) => {
      const raw = fs.readFileSync(path.join(TEST_DATA, name), 'utf-8');
      const parsed = parseXMLTV(raw, '192.168.50.188', 8409);
      const reference = parseReference(raw, '192.168.50.188', 8409);
      expect(parsed.programmes.length).toBeGreaterThan(1000);
      // Compared piecewise first, so a difference names its programme
      // instead of printing three megabytes.
      expect(parsed.channels).toStrictEqual(reference.channels);
      expect(parsed.programmes.length).toBe(reference.programmes.length);
      for (let i = 0; i < reference.programmes.length; i++) {
        if (JSON.stringify(parsed.programmes[i]) !== JSON.stringify(reference.programmes[i])) {
          expect({ index: i, ...parsed.programmes[i] }).toStrictEqual({ index: i, ...reference.programmes[i] });
        }
      }
      expect(parsed).toStrictEqual(reference);
      expect(parseXMLTV(raw)).toStrictEqual(parseReference(raw));
    });

    it.each(fixtures)('%s parses the same with a BOM, with CRLF line endings, and cut short', (name) => {
      const raw = fs.readFileSync(path.join(TEST_DATA, name), 'utf-8');
      expect(parseXMLTV(`﻿${raw}`)).toStrictEqual(parseReference(`﻿${raw}`));
      const crlf = raw.replace(/\n/g, '\r\n');
      expect(crlf).not.toBe(raw);
      expect(parseXMLTV(crlf)).toStrictEqual(parseReference(crlf));
      // A download that stopped part-way: inside an essay, inside a tag.
      const essay = raw.indexOf('</desc>', Math.floor(raw.length / 2)) - 40;
      expect(outcome(parseXMLTV, raw.slice(0, essay))).toStrictEqual(outcome(parseReference, raw.slice(0, essay)));
      const tag = raw.indexOf('<programme ', Math.floor(raw.length / 3)) + 20;
      expect(outcome(parseXMLTV, raw.slice(0, tag))).toStrictEqual(outcome(parseReference, raw.slice(0, tag)));
    });
  });

  describe('awkward documents', () => {
    const cases: Array<[string, string]> = [
      ['nothing at all', ''],
      ['no tags', 'just some text'],
      ['a BOM and nothing', '﻿'],
      ['an empty <tv/>', '<tv/>'],
      ['an empty <tv></tv>', '<?xml version="1.0"?><tv></tv>'],
      ['<tv> holding only text', '<tv>hello &amp; goodbye</tv>'],
      ['two <tv> elements', '<tv><channel id="a"/></tv><tv><channel id="b"/></tv>'],
      ['<tv> inside another element', '<root><tv><channel id="a"/></tv></root>'],
      ['a programme outside <tv>', '<programme start="20260215070314 -0800"><title>x</title></programme><tv/>'],
      ['a programme inside a channel', '<tv><channel id="a"><programme channel="a"><title>x</title></programme></channel></tv>'],
      ['a programme inside a programme', doc('<title>Outer</title><programme channel="z"><title>Inner</title></programme><desc>after</desc>')],
      ['a programme with no attributes or children', '<tv><programme></programme><programme/><programme>text only</programme></tv>'],
      ['a channel with no attributes or children', '<tv><channel></channel><channel/><channel>text only</channel></tv>'],
      ['one, two, three and four display-names', '<tv><channel id="a"><display-name>1 A</display-name></channel>'
        + '<channel id="b"><display-name>2 B</display-name><display-name>2</display-name></channel>'
        + '<channel id="c"><display-name>3 C</display-name><display-name>3</display-name><display-name>C</display-name></channel>'
        + '<channel id="d"><display-name>4 D</display-name><display-name>4</display-name><display-name>D</display-name><display-name>extra</display-name></channel></tv>'],
      ['an empty last display-name falls back to the id', '<tv><channel id="a"><display-name>A</display-name><display-name></display-name></channel><channel id="b"><display-name/></channel></tv>'],
      ['a display-name with an attribute', '<tv><channel id="a"><display-name lang="en">A</display-name></channel></tv>'],
      ['channel icons: none, two, one without src, one with text', '<tv><channel id="a"/><channel id="b"><icon src="http://localhost:8409/one.png"/><icon src="http://localhost:8409/two.png"/></channel>'
        + '<channel id="c"><icon/><icon src="http://localhost:8409/later.png"/></channel><channel id="d"><icon>http://localhost:8409/text.png</icon></channel>'
        + '<channel id="e"><icon src=""/></channel><channel id="f"><icon src="http://localhost:8409/a&amp;b=localhost:1"/></channel></tv>'],
      ['programme icons: first wins, src optional', doc('<icon width="3"/><icon src="second.png"/>', '<icon src="a.png" src="b.png"/>', '<icon>text.png</icon><icon src="late.png"/>')],
      ['no title', doc('<desc lang="en">only a description</desc>')],
      ['an empty title, then a real one', doc('<title></title><title>Real</title>')],
      ['two titles, two descriptions, two sub-titles', doc('<title>First</title><title>Second</title><desc>d1</desc><desc>d2</desc><sub-title>s1</sub-title><sub-title>s2</sub-title>')],
      ['an attribute and no text reads as an object', doc('<title lang="en"></title><sub-title lang="en"/><desc lang="en"> </desc><category lang="en"></category><category></category><date lang="en"></date>')],
      ['an empty sub-title and description are empty strings', doc('<title>T</title><sub-title></sub-title><desc/>')],
      ['a child element inside a title', doc('<title>Foo <b>bar</b> baz</title><desc><i>all inside</i></desc><sub-title><b/></sub-title>')],
      ['whitespace around text and between elements', doc('\n  <title lang="en">\n   Padded  Title \t</title>\n  <desc> 　nbsp and ideographic ﻿</desc>\n')],
      ['entity-encoded spaces at the edges survive the trim', doc('<title>&#32;kept&#32;</title><desc>&nbsp;x&#160;y&#0160;z&#xA0;</desc>')],
      ['every entity the reference knows', doc('<title>&apos;&#39;&#x27;&gt;&#62;&#x3E;&lt;&#60;&#x3C;&quot;&#34;&#x22;&amp;&#38;&#x26;</title>'
        + '<desc>&nbsp;&#160;&cent;&#162;&pound;&#163;&yen;&#165;&euro;&#8364;&copy;&#169;&reg;&#174;&inr;&#8377;&#232;&#233;&#215;&#128136;&#128308;&#x1F488;&#x1f488;</desc>')],
      ['entities that are not entities', doc('<title>&foo; &AMP; &#X41; &; &# &#; &#x; &amp &constructor; &toString; &#12345678; &#x1234567; &#1114112; &#x110000; AT&T</title>')],
      ['entities decoded twice, and not', doc('<title>&#38;amp; &#38;lt; &amp;lt; &#x26;#65; &am&#112;; &#38;#x41; &#3&#57;; &&#35;39; &amp;amp; &#38;#38; &l&#116;; &#x26;quot;</title>')],
      ['numeric references to digits, letters and punctuation', doc('<title>&#48;&#57;&#65;&#90;&#97;&#122;&#35;&#59;&#x3b;&#0;&#9;&#10;&#xD800;&#55357;&#56840;</title>')],
      ['an entity straddling the trimmed edge', doc('<title>&#39; </title><desc> &quot</desc><sub-title>&</sub-title>')],
      ['entities in attributes', '<tv><channel id=" c&amp;1 "><icon src="http://localhost:8409/gen?v=1&amp;text=Nana%27s+Picks"/></channel>'
        + '<programme start=" 20260215070314 -0800 " stop="20260215080314&#32;-0800" channel="c&amp;1"><episode-num system="on&#115;creen">S01E01</episode-num></programme></tv>'],
      ['CDATA is neither trimmed nor decoded', doc('<title><![CDATA[ Raw &amp; <b>bold</b> ]]></title><desc> before <![CDATA[]]> after <![CDATA[ mid ]]> end </desc><sub-title><![CDATA[]]></sub-title>')],
      ['CDATA closing oddly', doc('<title><![CDATA[a]]]]><![CDATA[>b]]></title><desc><![x]]>short</desc>')],
      ['a comment does not split a text; other things do', doc('<title> a <!-- c --> b </title><desc> a <?pi?> b </desc><sub-title> a <b/> b </sub-title><category>x<!---->y<!-- > -->z</category>')],
      ['a DOCTYPE in the prologue', `<?xml version="1.0"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n${doc('<title>T</title>')}`],
      ['a DOCTYPE in the middle of a text', doc('<title> a <!DOCTYPE x> b </title><desc>x<!DOCTYPE y [ ] >y</desc>')],
      ['a DOCTYPE holding a comment', `<!DOCTYPE tv <!-- <tv> --> >${doc('<title>T</title>')}`],
      ['something that is not a DOCTYPE', `<!DATA>${doc('<title>T</title>')}`],
      ['a DOCTYPE that never ends', `<!DOCTYPE tv ${doc('<title>T</title>')}`],
      ['a declaration-like tag', doc('<!ELEMENT x><title>T</title></!ELEMENT>')],
      ['processing instructions in odd places', `<?a?><?b c="?>"?>${doc('<?pi?><title>T<?pi x="1"?></title><?pi?>')}<?z?>`],
      ['a processing instruction that never ends', doc('<title>T</title><?pi')],
      ['a closing tag with the wrong name still closes', doc('<title>T</wrong><desc>D</title><sub-title>S</>')],
      ['a closing tag with spaces and attributes', doc('<title>T</title ><desc>D</ desc x="1">')],
      ['more closing tags than opening ones', `${doc('<title>T</title>')}</tv>`],
      ['a comment after the document closed twice', `${doc('<title>T</title>')}</tv><!-- fine -->`],
      ['an element after the document closed twice', `${doc('<title>T</title>')}</tv><late/>`],
      ['CDATA after the document closed twice', `${doc('<title>T</title>')}</tv><![CDATA[x]]>`],
      ['a processing instruction after the document closed twice', `${doc('<title>T</title>')}</tv><?pi?>`],
      ['cut off inside a text', '<tv><programme start="20260215070314 -0800" channel="c1"><title>Complete</title><desc>The essay stops he'],
      ['cut off after a field opened', '<tv><channel id="a"><display-name>A</display-name><display-name>'],
      ['cut off inside an opening tag', '<tv><programme start="20260215070314 -0800" chan'],
      ['cut off inside a closing tag', '<tv><programme><title>T</titl'],
      ['cut off inside a comment', '<tv><programme><title>T<!-- never'],
      ['cut off inside CDATA', '<tv><programme><title><![CDATA[never'],
      ['a lone < at the end', `${doc('<title>T</title>')}<`],
      ['a > inside a quoted attribute', '<tv><channel id="a>b"><display-name>A</display-name></channel><programme channel=\'c>d\' start="20260215070314 -0800"><title lang="a>b">T</title></programme></tv>'],
      ['single quotes, spaces around =, no quotes, no value', doc('<title lang=\'en\'>A</title><desc lang = "en">B</desc><sub-title lang=en>C</sub-title><category lang>D</category>')],
      ['attributes run together and repeated', '<tv><programme start="20260215070314 -0800"stop="20260215080314 -0800" channel="first" channel="second"><title>T</title></programme></tv>'],
      ['an unterminated attribute quote', '<tv><programme start="20260215070314 -0800><title>T</title></programme></tv>'],
      ['a quote in an attribute name, a tab outside the quotes', doc('<icon a\'b src="x\'y\tz" "/>')],
      ['tabs as separators and inside values', '<tv><channel\tid="a\tb"><display-name\tlang="en">A</display-name></channel><programme\tstart="20260215070314 -0800"\tchannel="a\tb"><title\t>T</title></programme></tv>'],
      ['carriage returns everywhere', '<tv>\r\n<channel id="a\r\nb">\r<display-name>A\r\nB\rC</display-name>\r\n</channel>\r\n<programme channel="a\r\nb"\r\nstart="20260215070314 -0800"><title>\r\nT\r\n</title><desc>line one\r\nline two\rline three</desc></programme></tv>'],
      ['newlines and odd spaces as tag separators', '<tv><channel\nid="a"><display-name lang="en">A</display-name></channel><programme　start="20260215070314 -0800"\n channel="a"><title\n lang="en"\n>T</title></programme></tv>'],
      ['self-closing spellings', doc('<previously-shown />', '<title/><desc /><sub-title lang="en"/><date/><category/>', '<previously-shown></previously-shown>', '<previously-shown lang="en">x</previously-shown>')],
      ['the name carrying the slash', doc('<title/ x/><title>Real</title><previously-shown/ >', '<title/ lang="en"/>', '<desc/ >x</desc>').replace('<display-name>One</display-name>', '<display-name/ x/><display-name>One</display-name>')],
      ['near-miss names', doc('<Title>no</Title><titles>no</titles><tit>no</tit><title-x>no</title-x><x:title>no</x:title><title/x>no</title/x><descr>no</descr><previously-shown-x/>')],
      ['an element with an empty name', doc('< title>no</ title><>x</><title>T</title>')],
      ['episode numbers: onscreen first, onscreen later, onscreen empty, none', doc(
        '<episode-num system="xmltv_ns">0.0.0/1</episode-num><episode-num system="onscreen">S01E01</episode-num><episode-num system="onscreen">S09E09</episode-num>',
        '<episode-num system="onscreen"></episode-num><episode-num system="onscreen">S01E02</episode-num>',
        '<episode-num>S01E03</episode-num><episode-num system=" onscreen ">S01E04</episode-num><episode-num system="Onscreen">S01E05</episode-num>',
        '<episode-num system="xmltv_ns">0.0.0/1</episode-num><episode-num>plain</episode-num>',
      )],
      ['dates: the sentinel, several, empty, with an attribute', doc('<date>0</date>', '<date>1967</date><date>1968</date>', '<date></date>', '<date/><date/>', '<date lang="en">1999</date>', '<date> 2026 </date>', '<date>0</date><date>0</date>', '<date><b/>1984</date>')],
      ['categories: empty ones dropped, objects kept', doc('<category lang="en">Drama</category><category></category><category lang="en"></category><category><b/></category><category> Mystery </category>')],
      ['timestamps of every shape', '<tv>' + [
        '20260215070314 -0800', '20260215120000 +0530', '20260215120000', '20260215070314-0800', '2026021507031 -0800', '', 'garbage',
        '00990215070314 +0000', '20261345996161 +9999', '20260215070314  -0800', '20260215070314 -08', '20260215070314 UTC', '２０２６0215070314 -0800',
      ].map((t) => `<programme start="${t}" stop="${t}" channel="c"/>`).join('') + '<programme channel="c"/></tv>'],
      ['the Unicode the station carries', doc('<title lang="en">？：＂ ’ “ ” — – ‑ 💈 🔴 ☀️ 瑞士默劇團 ⧸ É Í á ä å è é ë ó ö</title><desc lang="en">&#128136; 💈&#232;é\n\nSecond paragraph — “quoted”.</desc>')],
      ['a text with a lone surrogate', doc('<title>\ud83d</title><desc>\udc88 x</desc>')],
      ['unknown elements with everything inside', doc('<rating system="MPAA"><value>PG</value><title>not the title</title></rating><credits><actor>A</actor></credits><title>T</title>')],
      ['a title after text and a stray >', doc('stray > text " \' <title>T</title> more ]]> text')],
    ];

    it.each(cases)('%s', (_label, xml) => {
      expectParity(xml);
    });

    it('none of the awkward documents is trivially empty in both', () => {
      // A guard on the cases themselves: most must actually produce a guide.
      const productive = cases.filter(([, xml]) => {
        const result = outcome(parseReference, xml);
        return 'parsed' in result && result.parsed.channels.length + result.parsed.programmes.length > 0;
      });
      expect(productive.length).toBeGreaterThan(55);
    });
  });

  describe('whitespace', () => {
    // Every UTF-16 code unit as padding around a text. One document, one
    // <category> per code unit: whatever the reference trims, so must we.
    it('trims exactly the characters the reference trims', () => {
      let inner = '';
      for (let c = 0; c < 0x10000; c++) {
        if (c === 60 || c === 38 || c === 13) continue; // <, & and \r are covered above
        const ch = String.fromCharCode(c);
        inner += `<category>${ch}x${ch}</category>`;
      }
      const xml = doc(inner);
      const parsed = parseXMLTV(xml);
      expect(parsed.programmes[0].categories).toHaveLength(0x10000 - 3);
      expect(parsed).toStrictEqual(parseReference(xml));
    });

    it('ends a tag name at exactly the characters the reference does', () => {
      for (let c = 0; c < 0x10000; c++) {
        // Quotes, <, > and / change the tag itself; they are covered above.
        if (c === 34 || c === 39 || c === 60 || c === 62 || c === 47) continue;
        // Past the last whitespace block, a sample is enough.
        if (c > 0x3100 && c !== 0xfeff && c % 97 !== 0) continue;
        const ch = String.fromCharCode(c);
        const xml = `<tv><channel${ch}id="a"><display-name${ch}lang="en">A</display-name></channel>`
          + `<programme${ch}channel="a"><title${ch}lang="en">T</title><previously-shown${ch}/></programme></tv>`;
        const parsed = outcome(parseXMLTV, xml);
        const reference = outcome(parseReference, xml);
        if (JSON.stringify(parsed) !== JSON.stringify(reference)) {
          expect({ codeUnit: c, ...parsed }).toStrictEqual({ codeUnit: c, ...reference });
        }
      }
    });
  });

  describe('timestamps', () => {
    // The feed's one timestamp shape is read by arithmetic rather than by the
    // exported parseXmltvTimestamp; hold the two together on that shape, on
    // near-misses of it, and on impossible dates.
    it('reads 6000 seeded timestamps as the reference does', () => {
      const rand = rng(20260215);
      const alphabet = '0123456789 +-:/a\uff10';
      let programmes = '';
      for (let i = 0; i < 6000; i++) {
        let stamp = '';
        if (rand() < 0.75) {
          for (let k = 0; k < 14; k++) stamp += Math.floor(rand() * 10);
          stamp += ` ${rand() < 0.5 ? '+' : '-'}`;
          for (let k = 0; k < 4; k++) stamp += Math.floor(rand() * 10);
          if (rand() < 0.3) {
            const at = Math.floor(rand() * 20);
            stamp = stamp.slice(0, at) + alphabet[Math.floor(rand() * alphabet.length)] + stamp.slice(at + 1);
          }
        } else {
          const length = 18 + Math.floor(rand() * 4);
          for (let k = 0; k < length; k++) stamp += alphabet[Math.floor(rand() * alphabet.length)];
        }
        // Now and then the next programme starts where this one stopped.
        const stop = rand() < 0.5 ? stamp : stamp.split('').reverse().join('');
        programmes += `<programme start="${stamp}" stop="${stop}" channel="c"/>`;
      }
      const xml = `<tv>${programmes}</tv>`;
      const parsed = parseXMLTV(xml);
      expect(parsed.programmes).toHaveLength(6000);
      expect(parsed.programmes.filter((p) => p.start.getTime() !== 0).length).toBeGreaterThan(3000);
      expect(parsed).toStrictEqual(parseReference(xml));
    });
  });

  describe('generated documents', () => {
    // Seeded, so a failure names a document anyone can regenerate:
    // `fuzzDocument(seed)`. Two thirds are deliberately damaged.
    it('agrees with the reference on 4000 seeded documents, tidy and damaged', () => {
      let parsedDocuments = 0;
      let programmes = 0;
      for (let seed = 1; seed <= 4000; seed++) {
        const xml = fuzzDocument(seed);
        const host = seed % 2 === 0 ? 'tv.local' : undefined;
        const port = seed % 2 === 0 ? 8409 : undefined;
        const parsed = outcome(parseXMLTV, xml, host, port);
        const reference = outcome(parseReference, xml, host, port);
        if ('parsed' in reference) {
          parsedDocuments++;
          programmes += reference.parsed.programmes.length;
        }
        try {
          expect(parsed).toStrictEqual(reference);
        } catch (error) {
          throw new Error(`fuzzDocument(${seed}) differs:\n${xml}\n\n${(error as Error).message}`);
        }
      }
      // The generator must keep producing documents that mean something.
      expect(parsedDocuments).toBeGreaterThan(2000);
      expect(programmes).toBeGreaterThan(2000);
    });
  });

  describe('the one deliberate difference', () => {
    // The reference expanded entities a DOCTYPE declared for itself. ErsatzTV
    // writes no DOCTYPE; rather than carry a DTD reader for a feed that will
    // never send one, the new parser refuses such a document outright (the
    // app then keeps the last good guide), and never half-reads it.
    it('refuses a DOCTYPE that declares its own entities', () => {
      const xml = `<!DOCTYPE tv [<!ENTITY station "Booth">]>${doc('<title>&station;</title>')}`;
      expect(parseReference(xml).programmes[0].title).toBe('Booth');
      expect(() => parseXMLTV(xml)).toThrow('DOCTYPE');
    });
  });
});
