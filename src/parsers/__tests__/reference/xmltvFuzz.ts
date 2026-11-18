/**
 * A seeded generator of XMLTV-shaped documents, tidy and untidy, for holding
 * the forward-scan parser to the reference one (`xmltvParity.test.ts`).
 *
 * It writes the shapes ErsatzTV writes, then the shapes nobody should write:
 * wrong closing tags, tags that never close, attributes in every quoting,
 * entities in every spelling (and broken ones), CDATA, comments, processing
 * instructions, DOCTYPEs, tabs, carriage returns, truncation. Two things it
 * never writes, because the new parser deliberately does not follow the old
 * one there: a DOCTYPE with its own declarations, and nesting deep enough to
 * overflow the old parser's recursion.
 */

/** mulberry32: small, fast, and the same on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function chance(rand: Rand, p: number): boolean {
  return rand() < p;
}

const WORDS = [
  'The Prisoner', 'Free for All', 'Nana', 'Picks', 'É', '瑞士默劇團', '💈', '☀️', '—', '？：＂', '⧸', 'x', '0', '2026',
  'S01E16', 'onscreen', 'a b', '=', ';', '#', '1999', 'amp', 'lt;', '#39;', 'localhost:8409/logo.png',
];

const ENTITIES = [
  '&#39;', '&quot;', '&amp;', '&lt;', '&gt;', '&apos;', '&#232;', '&#233;', '&#215;', '&#128136;', '&#128308;',
  '&nbsp;', '&#160;', '&#0160;', '&#xA0;', '&#xa0;', '&cent;', '&#162;', '&pound;', '&#163;', '&yen;', '&#165;',
  '&euro;', '&#8364;', '&copy;', '&#169;', '&reg;', '&#174;', '&inr;', '&#8377;', '&#34;', '&#60;', '&#62;',
  '&#x27;', '&#x3E;', '&#x3C;', '&#x22;', '&#x3e;', '&#38;', '&#x26;', '&#038;', '&#65;', '&#x41;', '&#48;',
  '&#35;', '&#59;', '&#x3b;', '&#0;', '&#32;', '&#9;', '&#10;', '&#1114111;', '&#1114112;', '&#9999999;',
  '&#12345678;', '&#x10FFFF;', '&#x110000;', '&#xFFFFFF;', '&#x1234567;', '&#xD800;', '&#55357;', '&#;', '&#x;',
  '&;', '&', '&&', '&#', '&#x', '&amp', '&AMP;', '&Quot;', '&#X41;', '&foo;', '&constructor;', '&toString;',
  '&#38;amp;', '&#38;lt;', '&amp;lt;', '&#x26;#65;', '&am&#112;;', '&#38;#x41;', '&#3&#57;;', '&&#35;39;',
  '&amp;amp;', '&#38;#38;', '&l&#116;;', '&#x26;quot;', '&#00039;', '&#39', '& #39;', '&#3 9;', '&#-1;', '&#+1;',
  // A numeric reference that decodes to `#`, `;` or a digit, completing an entity a later pass then reads.
  '&&#35;x41;', '&&#35;38;', '&&#x23;x41;', '&amp&#59;', '&#x41&#59;', '&lt&#59;', '&#3&#56;;', '&#x4&#49;;', '&#x2&#54;;',
  // Too many digits even when the value is small; an uppercase X; a name cut short or run long.
  '&#00000233;', '&#0000233;', '&#x00000E9;', '&#x0000E9;', '&#XE9;', '&#xe9;', '&poun;', '&pounds;', '&quot', '&quot ;',
];

const SPACES = [' ', ' ', ' ', '  ', '\n', '\t', '\r\n', '\r', ' ', ' ', '　', '﻿', '​', '\v', '\f'];

const NAMES = [
  'tv', 'channel', 'programme', 'title', 'sub-title', 'desc', 'category', 'episode-num', 'date', 'icon',
  'previously-shown', 'display-name', 'rating', 'value', 'b', 'Title', 'titles', 'tit', 'x:title', '!foo', '',
];

const ATTR_NAMES = ['lang', 'start', 'stop', 'channel', 'system', 'id', 'src', 'x', 'xml:lang', 'SRC', 'Lang'];

const ATTR_VALUES = [
  'en', 'onscreen', 'xmltv_ns', ' onscreen ', 'C1.145.ersatztv.org', '20260215070314 -0800', '20260215120000 +0530',
  '20260215120000', ' 20260215070314 -0800 ', '2026021507031 -0800', '20260215070314-0800', '00990215070314 +0000',
  '20261345996161 +9999', 'garbage', '', 'http://localhost:8409/iptv/logos/a.jpg?v=1&amp;text=Nana%27s+Picks',
  'a>b', 'a<b', "it's", 'say "hi"', 'a\tb', 'a\nb', 'a\r\nb', '&#39;', '&amp;', 'x=y', 'a b', '/',
];

function text(rand: Rand): string {
  let out = '';
  const parts = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < parts; i++) {
    const roll = rand();
    if (roll < 0.45) out += pick(rand, WORDS);
    else if (roll < 0.75) out += pick(rand, ENTITIES);
    else if (roll < 0.9) out += pick(rand, SPACES);
    else if (roll < 0.94) out += `<![CDATA[${pick(rand, ['', ' ', 'raw &amp; <b>', ']]', ' x ', '&#39;'])}]]>`;
    else if (roll < 0.97) out += `<!--${pick(rand, ['', ' c ', '-', ' <b> ', '&amp;', '>'])}-->`;
    else if (roll < 0.985) out += `<?${pick(rand, ['pi', 'pi a="b"', 'xml version="1.0"', 'pi "?>"', ''])}?>`;
    else out += pick(rand, ['>', '"', "'", '/', ']]>', '-->', '?>']);
  }
  return out;
}

function attribute(rand: Rand, name?: string, value?: string): string {
  const n = name ?? pick(rand, ATTR_NAMES);
  const v = value ?? pick(rand, ATTR_VALUES);
  const roll = rand();
  if (roll < 0.8) return `${n}="${v.replace(/"/g, '&quot;')}"`;
  if (roll < 0.88) return `${n}='${v.replace(/'/g, '&#39;')}'`;
  if (roll < 0.91) return `${n} = "${v.replace(/"/g, '')}"`;
  if (roll < 0.94) return `${n}=${v.replace(/[\s"'<>]/g, '')}`;
  if (roll < 0.97) return n;
  // The rest unbalance the tag's quotes, which usually (not always) ends in
  // both parsers refusing the document; kept rare so most documents parse.
  if (roll < 0.985) return `${n}="${v}"`; // quotes inside the value left as they fall
  if (roll < 0.995) return `a'b="${v.replace(/["']/g, '')}' c='d"`; // a quote in a name
  return `${n}="${v.replace(/"/g, '')}`; // never closed
}

function gap(rand: Rand): string {
  return chance(rand, 0.9) ? ' ' : pick(rand, SPACES);
}

function openTag(rand: Rand, name: string, attrs: string[], selfClosing: boolean): string {
  let out = `<${name}`;
  attrs.forEach((a, index) => {
    // Now and then two attributes run together with nothing between.
    out += (index > 0 && chance(rand, 0.03) ? '' : gap(rand)) + a;
  });
  if (chance(rand, 0.04)) out += gap(rand);
  if (selfClosing) out += pick(rand, ['/', '/', ' /', '/ ']);
  return `${out}>`;
}

function element(rand: Rand, name: string, attrs: string[], body: string | null): string {
  if (body === null) return openTag(rand, name, attrs, true);
  const roll = rand();
  const close = roll < 0.93 ? `</${name}>` : roll < 0.96 ? `</${pick(rand, NAMES)}>` : roll < 0.98 ? `</${name} >` : '';
  return openTag(rand, name, attrs, false) + body + close;
}

function maybeLang(rand: Rand): string[] {
  const roll = rand();
  if (roll < 0.6) return ['lang="en"'];
  if (roll < 0.8) return [];
  return Array.from({ length: 1 + Math.floor(rand() * 2) }, () => attribute(rand));
}

function nested(rand: Rand, depth: number): string {
  if (depth > 3 || chance(rand, 0.4)) return text(rand);
  const name = pick(rand, NAMES);
  return text(rand) + element(rand, name, maybeLang(rand), chance(rand, 0.2) ? null : nested(rand, depth + 1)) + text(rand);
}

function fieldBody(rand: Rand): string | null {
  const roll = rand();
  if (roll < 0.05) return null;
  if (roll < 0.1) return '';
  if (roll < 0.8) return text(rand);
  return nested(rand, 0);
}

function programme(rand: Rand): string {
  const attrs: string[] = [];
  if (chance(rand, 0.95)) attrs.push(attribute(rand, 'start', chance(rand, 0.85) ? '20260215070314 -0800' : undefined));
  if (chance(rand, 0.95)) attrs.push(attribute(rand, 'stop', chance(rand, 0.85) ? '20260215080314 -0800' : undefined));
  if (chance(rand, 0.95)) attrs.push(attribute(rand, 'channel', chance(rand, 0.85) ? 'C1.145.ersatztv.org' : undefined));
  if (chance(rand, 0.05)) attrs.push(attribute(rand));
  if (chance(rand, 0.03)) return openTag(rand, 'programme', attrs, true);

  const children: string[] = [];
  const count = Math.floor(rand() * 9);
  for (let i = 0; i < count; i++) {
    const roll = rand();
    if (roll < 0.2) children.push(element(rand, 'title', maybeLang(rand), fieldBody(rand)));
    else if (roll < 0.3) children.push(element(rand, 'sub-title', maybeLang(rand), fieldBody(rand)));
    else if (roll < 0.45) children.push(element(rand, 'desc', maybeLang(rand), fieldBody(rand)));
    else if (roll < 0.58) children.push(element(rand, 'category', maybeLang(rand), fieldBody(rand)));
    else if (roll < 0.7) {
      const system = chance(rand, 0.9)
        ? [attribute(rand, 'system', pick(rand, ['onscreen', 'xmltv_ns', ' onscreen ', 'Onscreen']))]
        : maybeLang(rand);
      children.push(element(rand, 'episode-num', system, fieldBody(rand)));
    } else if (roll < 0.8) {
      children.push(element(rand, 'date', chance(rand, 0.85) ? [] : maybeLang(rand), chance(rand, 0.6) ? pick(rand, ['1967', '0', ' 2026 ', '']) : fieldBody(rand)));
    } else if (roll < 0.88) {
      children.push(element(rand, 'icon', chance(rand, 0.85) ? [attribute(rand, 'src')] : maybeLang(rand), chance(rand, 0.85) ? null : text(rand)));
    } else if (roll < 0.95) {
      children.push(element(rand, 'previously-shown', chance(rand, 0.9) ? [] : maybeLang(rand), chance(rand, 0.85) ? null : text(rand)));
    } else {
      children.push(element(rand, pick(rand, NAMES), maybeLang(rand), fieldBody(rand)));
    }
    if (chance(rand, 0.1)) children.push(text(rand));
  }
  return element(rand, 'programme', attrs, children.join(chance(rand, 0.2) ? pick(rand, SPACES) : ''));
}

function channel(rand: Rand): string {
  const attrs = chance(rand, 0.95) ? [attribute(rand, 'id', chance(rand, 0.85) ? 'C1.145.ersatztv.org' : undefined)] : [];
  const children: string[] = [];
  const names = pick(rand, [3, 3, 3, 3, 0, 1, 2, 4]);
  for (let i = 0; i < names; i++) {
    children.push(element(rand, 'display-name', chance(rand, 0.85) ? [] : maybeLang(rand), fieldBody(rand)));
  }
  const icons = pick(rand, [1, 1, 1, 0, 2]);
  for (let i = 0; i < icons; i++) {
    children.push(element(rand, 'icon', chance(rand, 0.9) ? [attribute(rand, 'src')] : maybeLang(rand), chance(rand, 0.9) ? null : text(rand)));
  }
  if (chance(rand, 0.1)) children.push(element(rand, pick(rand, NAMES), maybeLang(rand), fieldBody(rand)));
  if (chance(rand, 0.15)) children.reverse();
  return element(rand, 'channel', attrs, children.join(''));
}

const HOSTILE = ['<', '>', '&', ';', '"', "'", '/', '=', '!', '?', '[', ']', '-', ' ', '\t', '\r', '\n', '#', 'x', '</', '/>', '<!', '<?'];

function mutate(rand: Rand, doc: string): string {
  let out = doc;
  const edits = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < edits; i++) {
    const at = Math.floor(rand() * (out.length + 1));
    const roll = rand();
    if (roll < 0.35) out = out.slice(0, at) + pick(rand, HOSTILE) + out.slice(at);
    else if (roll < 0.6) out = out.slice(0, at) + out.slice(at + 1 + Math.floor(rand() * 3));
    else if (roll < 0.8) out = out.slice(0, at); // truncated mid-flight
    else if (roll < 0.9) {
      const from = Math.floor(rand() * out.length);
      out = out.slice(0, at) + out.slice(from, from + Math.floor(rand() * 40)) + out.slice(at);
    } else out = out.slice(0, at) + pick(rand, HOSTILE) + out.slice(at + 1);
  }
  return out;
}

/** One document. About a third are left tidy; the rest are damaged somewhere. */
export function fuzzDocument(seed: number): string {
  const rand = rng(seed);
  const parts: string[] = [];
  const channels = Math.floor(rand() * 3);
  const programmes = Math.floor(rand() * 5);
  for (let i = 0; i < channels; i++) parts.push(channel(rand));
  for (let i = 0; i < programmes; i++) parts.push(programme(rand));
  if (chance(rand, 0.1)) parts.push(channel(rand));
  if (chance(rand, 0.08)) parts.push(text(rand));
  if (chance(rand, 0.05)) parts.push(element(rand, pick(rand, NAMES), maybeLang(rand), programme(rand)));

  const join = chance(rand, 0.7) ? '' : pick(rand, SPACES);
  const tvAttrs = chance(rand, 0.8) ? ['generator-info-name="ersatztv"'] : [];
  let doc = element(rand, chance(rand, 0.97) ? 'tv' : pick(rand, NAMES), tvAttrs, parts.join(join));

  const prologue = rand();
  if (prologue < 0.6) doc = `<?xml version="1.0" encoding="utf-8"?>${doc}`;
  else if (prologue < 0.7) doc = `<?xml version="1.0"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n${doc}`;
  else if (prologue < 0.75) doc = `<!DOCTYPE tv ${pick(rand, ['', 'SYSTEM "a>b"', '<!-- c -->', '[ ]', '[<!-- <!ENTITY --> ]'])}>${doc}`;
  if (chance(rand, 0.3)) doc = `﻿${doc}`;
  if (chance(rand, 0.05)) doc += pick(rand, ['</tv>', '<tv/>', '<tv></tv>', 'trailing', '<!-- end -->', '</tv><x/>', '</tv><?pi?>', '</tv></tv><![CDATA[x]]>']);

  return chance(rand, 0.35) ? doc : mutate(rand, doc);
}
