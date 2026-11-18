import type { Programme, XmltvChannel, EpgData } from '../types';

/**
 * Parse an ErsatzTV XMLTV document into structured EPG data.
 *
 * Key challenges handled:
 * - Single-line XML (3.5 MB, every programme carrying a long essay)
 * - Unicode: fullwidth punctuation, smart quotes, emoji, CJK, accented Latin
 * - HTML entities: &#39; &#128136; &amp; etc.
 * - Tiny-duration programmes (0-2 seconds) — kept as-is, layout handles them
 * - Timezone offsets in timestamps: "20260215070314 -0800"
 * - Missing icons on some channels (C1 The Prisoner)
 *
 * This is one forward scan over the document. It used to be fast-xml-parser
 * building a whole tree (one character at a time) that fifteen entity regexes
 * then walked; that cost the phone's single JS thread a visible hitch every
 * half hour, under a programme that was playing. The scan here jumps from
 * `<` to `<` with the engine's own indexOf, reads only the eleven elements
 * the set shows, slices a text out of the document once, and decodes
 * entities only where a text holds an `&`.
 *
 * The old parser is kept verbatim as a test-only reference
 * (`__tests__/reference/xmltvReference.ts`) and `xmltvParity.test.ts` holds
 * the two to the same output, quirks included: a closing tag closes whatever
 * is open whatever its name, an element with an attribute and no text reads
 * as "[object Object]", `&nbsp;` is a plain space, entities are not decoded
 * inside CDATA, a truncated document yields what had opened. Each such rule
 * below says which line of the old behaviour it reproduces. One thing is not
 * carried over: a DOCTYPE that declares its own entities is refused (the old
 * parser expanded them; ErsatzTV writes no DOCTYPE at all).
 */

// What the open element is, as far as the guide cares.
const ROOT = 0; // outside every element
const TV = 1; // the top-level <tv>
const CHANNEL = 2; // <channel> directly under <tv>
const PROGRAMME = 3; // <programme> directly under <tv>
const FIELD = 4; // a text-bearing child of the two above (which one: `field`)
const OTHER = 5; // anything else: skipped, only its nesting is tracked
const DEAD = 6; // more closing tags than opening ones; any further element is an error

const TITLE = 1;
const SUB_TITLE = 2;
const DESC = 3;
const CATEGORY = 4;
const EPISODE_NUM = 5;
const DATE = 6;
const DISPLAY_NAME = 7;

/** What an element with an attribute or a child, and no text, used to stringify to. */
const OBJECT_TEXT = '[object Object]';

/** JS whitespace: exactly what `String.prototype.trim` strips and `/\s/` matches. */
function isSpace(c: number): boolean {
  if (c <= 32) return c === 32 || (c >= 9 && c <= 13);
  if (c < 0xa0) return false;
  return c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028
    || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

// ── Entities ──

function fromCodePoint(str: string, base: number, prefix: string): string {
  const codePoint = Number.parseInt(str, base);
  return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : `${prefix}${str};`;
}

// The reference's replacements, in the reference's order: each is a whole
// pass over the text, so a later pass can pick up what an earlier one wrote
// (`&#38;amp;` comes out as `&`). Only texts where that could matter take
// this road; see `decode`.
const SEQUENTIAL: ReadonlyArray<readonly [RegExp, string | ((match: string, digits: string) => string)]> = [
  [/&(apos|#39|#x27);/g, "'"],
  [/&(gt|#62|#x3E);/g, '>'],
  [/&(lt|#60|#x3C);/g, '<'],
  [/&(quot|#34|#x22);/g, '"'],
  [/&(nbsp|#160);/g, ' '],
  [/&(cent|#162);/g, '¢'],
  [/&(pound|#163);/g, '£'],
  [/&(yen|#165);/g, '¥'],
  [/&(euro|#8364);/g, '€'],
  [/&(copy|#169);/g, '©'],
  [/&(reg|#174);/g, '®'],
  [/&(inr|#8377);/g, '₹'],
  [/&#([0-9]{1,7});/g, (_, digits) => fromCodePoint(digits, 10, '&#')],
  [/&#x([0-9a-fA-F]{1,6});/g, (_, digits) => fromCodePoint(digits, 16, '&#x')],
  [/&(amp|#38|#x26);/g, '&'],
];

function decodeSequential(text: string): string {
  let val = text;
  for (const [regex, replacement] of SEQUENTIAL) {
    // The two overloads of `replace` do not unify over a union argument.
    val = typeof replacement === 'string' ? val.replace(regex, replacement) : val.replace(regex, replacement);
  }
  return val;
}

const NAMED = new Map<string, string>([
  ['apos', "'"], ['gt', '>'], ['lt', '<'], ['quot', '"'], ['amp', '&'],
  ['nbsp', ' '], ['cent', '¢'], ['pound', '£'], ['yen', '¥'], ['euro', '€'], ['copy', '©'], ['reg', '®'], ['inr', '₹'],
]);

/**
 * Decode `s[from, to)`, whose first `&` is at `amp`, in one pass.
 *
 * One pass equals the reference's fifteen as long as nothing a numeric
 * reference decodes to could become part of another entity; when one decodes
 * to a letter, a digit, `&`, `#` or `;` the whole text is handed to the
 * reference's own sequence instead. (No such text is in the station's feed.)
 */
function decode(s: string, from: number, to: number, amp: number): string {
  // Appended to, not collected and joined: under V8 the appended pieces stay
  // slices of the document (which is held anyway), where a join would copy
  // every decoded essay at two bytes a character; measured, that is 3.6 MB
  // less kept per guide and a quarter less time. (Measured under V8 only;
  // there was no Hermes to run. The old parser appended character by
  // character, so appending by the piece is no new demand on it.)
  let out = '';
  let last = from;
  while (amp !== -1 && amp < to) {
    // An entity is `&`, at most eight characters, `;`. `after` is the index
    // just past its `;` once one is recognised.
    let value: string | undefined;
    let after = 0;
    const first = s.charCodeAt(amp + 1);
    if (first === 35) {
      // Numeric: `&#` and one to seven digits, or `&#x` and one to six hex digits.
      let k = amp + 2;
      let codePoint = 0;
      let count = 0;
      const hex = s.charCodeAt(k) === 120;
      if (hex) {
        for (k++; count < 7; k++, count++) {
          const c = s.charCodeAt(k);
          const digit = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1;
          if (digit < 0) break;
          codePoint = codePoint * 16 + digit;
        }
      } else {
        for (; count < 8; k++, count++) {
          const c = s.charCodeAt(k);
          if (c < 48 || c > 57) break;
          codePoint = codePoint * 10 + (c - 48);
        }
      }
      if (count > 0 && count <= (hex ? 6 : 7) && k < to && s.charCodeAt(k) === 59 && codePoint <= 0x10ffff) {
        if (
          codePoint < 128
          && ((codePoint >= 48 && codePoint <= 57) || (codePoint >= 65 && codePoint <= 90)
            || (codePoint >= 97 && codePoint <= 122) || codePoint === 38 || codePoint === 35 || codePoint === 59)
        ) {
          return decodeSequential(s.slice(from, to));
        }
        // `&#160;` spelled exactly so is the reference's plain space.
        value = codePoint === 160 && !hex && count === 3 ? ' ' : String.fromCodePoint(codePoint);
        after = k + 1;
      }
    } else if (first === 113 && amp + 5 < to && s.startsWith('uot;', amp + 2)) {
      // The essays are full of quotation marks; this one skips the lookup.
      value = '"';
      after = amp + 6;
    } else {
      let semi = amp + 1;
      const limit = amp + 7 < to ? amp + 7 : to; // the longest name is `pound`
      while (semi < limit && s.charCodeAt(semi) !== 59) semi++;
      if (semi < limit) {
        value = NAMED.get(s.slice(amp + 1, semi));
        after = semi + 1;
      }
    }
    if (value === undefined) {
      amp = s.indexOf('&', amp + 1);
    } else {
      if (amp > last) out += s.slice(last, amp);
      out += value;
      last = after;
      amp = s.indexOf('&', last);
    }
  }
  if (last === from) return s.slice(from, to);
  return last < to ? out + s.slice(last, to) : out;
}

/** Trim, then decode: the reference's order, so `&#32;` at an edge survives. */
function trimDecode(s: string): string {
  const t = s.trim();
  const amp = t.indexOf('&');
  return amp === -1 ? t : decode(t, 0, t.length, amp);
}

// ── Attributes ──

// The reference's attribute expression, verbatim.
const ATTRS = /([^\s=]+)\s*(=\s*(['"])([\s\S]*?)\3)?/gm;

// Attributes of the tag being opened, in document order; a later one of the
// same name wins, as it did when they were assigned onto an object.
const attrNames: string[] = [];
const attrValues: string[] = [];
let attrCount = 0;

function addAttr(name: string, value: string): void {
  attrNames[attrCount] = name;
  attrValues[attrCount] = trimDecode(value);
  attrCount++;
}

/**
 * Read an attribute expression into `attrNames`/`attrValues`.
 *
 * The plain shape every ErsatzTV tag has (`name="value"`, one space between,
 * names the guide knows) is read with indexOf; anything else goes through
 * the reference's expression, which gives the same answer for the plain shape.
 */
function readAttrs(expr: string): void {
  attrCount = 0;
  const end = expr.length;
  let pos = 0;
  while (pos < end) {
    const eq = expr.indexOf('="', pos);
    if (eq === -1) break;
    const name = expr.slice(pos, eq);
    if (
      name !== 'lang' && name !== 'start' && name !== 'stop' && name !== 'channel'
      && name !== 'system' && name !== 'id' && name !== 'src'
    ) break;
    const close = expr.indexOf('"', eq + 2);
    if (close === -1) break;
    addAttr(name, expr.slice(eq + 2, close));
    pos = close + 1;
    if (pos === end) return;
    if (expr.charCodeAt(pos) !== 32) break;
    pos++;
  }
  if (end === 0) return;

  attrCount = 0;
  ATTRS.lastIndex = 0;
  for (let match = ATTRS.exec(expr); match; match = ATTRS.exec(expr)) {
    if (match[4] !== undefined) addAttr(match[1], match[4]);
  }
}

function attr(name: string): string | undefined {
  for (let k = attrCount - 1; k >= 0; k--) {
    if (attrNames[k] === name) return attrValues[k];
  }
  return undefined;
}

// ── Tags ──

/**
 * If the tag expression `s[from, to)` (the text between `<` and `>`) names
 * exactly `name`, the index just past the name; otherwise -1.
 */
function named(s: string, from: number, to: number, name: string): number {
  if (!s.startsWith(name, from)) return -1;
  const k = from + name.length;
  if (k > to) return -1;
  if (k === to) return k;
  const c = s.charCodeAt(k);
  if (isSpace(c)) return k;
  // `<name/>`, and the reference's reading of `<name/ …/>` as the same.
  if (c === 47 && s.charCodeAt(to - 1) === 47 && (k === to - 1 || isSpace(s.charCodeAt(k + 1)))) return k;
  return -1;
}

/**
 * Read the attributes of a tag whose name ended at `k` (see `named`): none
 * when nothing follows the name, or when the name carried the closing slash.
 */
function readTagAttrs(s: string, k: number, to: number, selfClosing: boolean): void {
  attrCount = 0;
  if (k === to || !isSpace(s.charCodeAt(k))) return;
  readAttrs(s.slice(k + 1, selfClosing ? to - 1 : to).trimStart());
}

/** Rewrite localhost URLs to real server address. */
function rewriteUrl(url: string, host: string, port: number): string {
  return url.replace(/localhost:\d+/, `${host}:${port}`);
}

/**
 * Parse XMLTV string into EpgData.
 * The input may be a single enormous line — that's fine.
 */
export function parseXMLTV(raw: string, serverHost?: string, serverPort?: number): EpgData {
  // The feed opens with a BOM. It is text before the first tag, which is
  // ignored like all text outside the elements read here, so it is left
  // where it is: slicing it off would copy 3.5 MB on Hermes.
  //
  // Line endings are normalised over the whole document (attribute values
  // and essays alike). ErsatzTV writes no \r, so this is normally one indexOf.
  const xml = raw.indexOf('\r') === -1 ? raw : raw.replace(/\r\n?/g, '\n');
  const length = xml.length;

  const channels: XmltvChannel[] = [];
  const programmes: Programme[] = [];
  let tvCount = 0;

  // Open elements, innermost in `top`.
  const stack: number[] = [];
  let top = ROOT;

  // The next quote, tab and ampersand at or after the last place asked
  // (`length` when there is none), so each is searched for once across the
  // document rather than once per tag.
  let nextDouble = -1;
  let nextSingle = -1;
  let nextTab = xml.indexOf('\t');
  if (nextTab === -1) nextTab = length;
  let nextAmp = -1;

  // The channel being read.
  let cId = '';
  let cIconSeen = false;
  let cIcon: string | undefined;
  let cNames: string[] = [];

  // The programme being read.
  let pChannel = '';
  let pStart = '';
  let pStop = '';
  let pTitle: string | undefined;
  let pTitleSeen = false;
  let pSub: string | undefined;
  let pSubSeen = false;
  let pDesc: string | undefined;
  let pDescSeen = false;
  let pIcon: string | undefined;
  let pIconSeen = false;
  let pCategories: string[] = [];
  let pEpisode: string | undefined;
  let pEpisodeSeen = false;
  let pDate: string | undefined;
  let pDateCount = 0;
  let pPreviouslyShown = false;

  // The text-bearing element being read. `fieldObject`: it has an attribute
  // or a child element, so the reference held it as an object, not a string.
  let field = 0;
  let fieldText = '';
  let fieldObject = false;
  let fieldOnscreen = false;
  // Its current run of text: `xml[runStart, …)`, after `runPrefix` when a
  // comment or DOCTYPE has interrupted it (they do not end a run).
  let runStart = 0;
  let runPrefix = '';

  /** End the current run of text at `end`: trim, decode, append. */
  const flushText = (end: number): void => {
    let piece: string;
    if (runPrefix === '') {
      let a = runStart;
      let b = end;
      while (a < b && isSpace(xml.charCodeAt(a))) a++;
      while (b > a && isSpace(xml.charCodeAt(b - 1))) b--;
      if (a === b) return;
      if (nextAmp < a) {
        nextAmp = xml.indexOf('&', a);
        if (nextAmp === -1) nextAmp = length;
      }
      piece = nextAmp < b ? decode(xml, a, b, nextAmp) : xml.slice(a, b);
    } else {
      piece = trimDecode(runPrefix + xml.slice(runStart, end));
      runPrefix = '';
      if (piece === '') return;
    }
    fieldText = fieldText === '' ? piece : fieldText + piece;
  };

  const finishField = (): void => {
    // What `extractText` made of it, and what `String()` made of it.
    const text = fieldObject && fieldText === '' ? OBJECT_TEXT : fieldText;
    const str = fieldObject ? OBJECT_TEXT : fieldText;
    switch (field) {
      case TITLE:
        if (!pTitleSeen) { pTitleSeen = true; pTitle = text; }
        break;
      case SUB_TITLE:
        if (!pSubSeen) { pSubSeen = true; pSub = text; }
        break;
      case DESC:
        if (!pDescSeen) { pDescSeen = true; pDesc = text; }
        break;
      case CATEGORY:
        if (text) pCategories.push(text);
        break;
      case EPISODE_NUM:
        // Prefer "onscreen" format (e.g. "S01E16") over xmltv_ns: the first one wins.
        if (!pEpisodeSeen && fieldOnscreen) { pEpisodeSeen = true; pEpisode = text; }
        break;
      case DATE:
        // Several <date>s used to stringify as an array: joined with commas.
        pDate = pDateCount === 0 ? str : `${pDate},${str}`;
        pDateCount++;
        break;
      case DISPLAY_NAME:
        cNames.push(str);
        break;
    }
  };

  const finishChannel = (): void => {
    // ETV puts three display-names: "1 The Prisoner", "1", "The Prisoner".
    // We want the plain name (the third, or else the last one).
    const count = cNames.length;
    const displayName = count >= 3 ? cNames[2] : (count > 0 && cNames[count - 1]) || cId;
    let icon = cIcon;
    if (icon && serverHost && serverPort) icon = rewriteUrl(icon, serverHost, serverPort);
    channels.push({ id: cId, displayName, icon });
  };

  const finishProgramme = (): void => {
    // Year from <date> (ErsatzTV uses "0" as sentinel for unknown — treat as absent).
    programmes.push({
      channelId: pChannel,
      start: timestamp(pStart),
      stop: timestamp(pStop),
      title: pTitle || 'Untitled',
      subtitle: pSub,
      description: pDesc,
      icon: pIcon,
      categories: pCategories,
      episodeNum: pEpisode,
      year: pDate && pDate !== '0' ? pDate : undefined,
      previouslyShown: pPreviouslyShown,
    });
  };

  // A schedule is contiguous: nearly every programme starts at the instant
  // the one before it stopped, so the last timestamp read is asked for again.
  let lastStamp = '';
  let lastStampMs = 0;
  const timestamp = (ts: string): Date => {
    if (ts !== lastStamp) {
      lastStampMs = timestampMs(ts);
      lastStamp = ts;
    }
    return new Date(lastStampMs);
  };

  const finish = (kind: number): void => {
    if (kind === FIELD) finishField();
    else if (kind === PROGRAMME) finishProgramme();
    else if (kind === CHANNEL) finishChannel();
  };

  /**
   * The index of the `>` (or the `?` of `?>`) that ends the tag scanned from
   * `from`: the first one outside quotes. -1 when the tag never ends.
   */
  const tagEnd = (from: number, processingInstruction: boolean): number => {
    let p = from;
    for (;;) {
      const end = processingInstruction ? xml.indexOf('?>', p) : xml.indexOf('>', p);
      if (end === -1) return -1;
      if (nextDouble < p) {
        nextDouble = xml.indexOf('"', p);
        if (nextDouble === -1) nextDouble = length;
      }
      if (nextSingle < p) {
        nextSingle = xml.indexOf("'", p);
        if (nextSingle === -1) nextSingle = length;
      }
      const quote = nextDouble < nextSingle ? nextDouble : nextSingle;
      if (quote > end) return end;
      const close = xml.indexOf(quote === nextDouble ? '"' : "'", quote + 1);
      if (close === -1) return -1;
      p = close + 1;
    }
  };

  /** An element opens: `s[from, to)` is its tag expression. */
  const open = (s: string, from: number, to: number): void => {
    const selfClosing = to > from && s.charCodeAt(to - 1) === 47;
    let kind = OTHER;
    let k: number;

    if (top === PROGRAMME) {
      // Told apart by first letter, then confirmed in full.
      switch (s.charCodeAt(from)) {
        case 116: // title
          if ((k = named(s, from, to, 'title')) !== -1) { kind = FIELD; field = TITLE; }
          break;
        case 115: // sub-title
          if ((k = named(s, from, to, 'sub-title')) !== -1) { kind = FIELD; field = SUB_TITLE; }
          break;
        case 100: // desc, date
          if ((k = named(s, from, to, 'desc')) !== -1) { kind = FIELD; field = DESC; }
          else if ((k = named(s, from, to, 'date')) !== -1) { kind = FIELD; field = DATE; }
          break;
        case 99: // category
          if ((k = named(s, from, to, 'category')) !== -1) { kind = FIELD; field = CATEGORY; }
          break;
        case 101: // episode-num
          if ((k = named(s, from, to, 'episode-num')) !== -1) { kind = FIELD; field = EPISODE_NUM; }
          break;
        case 112: // previously-shown — the element existing is the whole of it
          if (named(s, from, to, 'previously-shown') !== -1) pPreviouslyShown = true;
          break;
        case 105: // icon — the first one's src, even when that is absent
          if ((k = named(s, from, to, 'icon')) !== -1 && !pIconSeen) {
            pIconSeen = true;
            readTagAttrs(s, k, to, selfClosing);
            pIcon = attr('src');
          }
          break;
      }
    } else if (top === TV) {
      if ((k = named(s, from, to, 'programme')) !== -1) {
        kind = PROGRAMME;
        readTagAttrs(s, k, to, selfClosing);
        pChannel = attr('channel') || '';
        pStart = attr('start') || '';
        pStop = attr('stop') || '';
        pTitle = undefined; pTitleSeen = false;
        pSub = undefined; pSubSeen = false;
        pDesc = undefined; pDescSeen = false;
        pIcon = undefined; pIconSeen = false;
        pCategories = [];
        pEpisode = undefined; pEpisodeSeen = false;
        pDate = undefined; pDateCount = 0;
        pPreviouslyShown = false;
      } else if ((k = named(s, from, to, 'channel')) !== -1) {
        kind = CHANNEL;
        readTagAttrs(s, k, to, selfClosing);
        cId = attr('id') || '';
        cIconSeen = false;
        cIcon = undefined;
        cNames = [];
      }
    } else if (top === CHANNEL) {
      if ((k = named(s, from, to, 'display-name')) !== -1) { kind = FIELD; field = DISPLAY_NAME; }
      else if ((k = named(s, from, to, 'icon')) !== -1 && !cIconSeen) {
        cIconSeen = true;
        readTagAttrs(s, k, to, selfClosing);
        cIcon = attr('src');
      }
    } else if (top === ROOT) {
      if (named(s, from, to, 'tv') !== -1) { kind = TV; tvCount++; }
    }

    if (kind === FIELD) {
      // Nearly every text element in the feed is `<name lang="en">`.
      const nameEnd = from + FIELD_NAME_LENGTH[field];
      if (!selfClosing && to - nameEnd === 10 && s.startsWith(' lang="en"', nameEnd)) {
        fieldObject = true;
        fieldOnscreen = false;
      } else {
        readTagAttrs(s, nameEnd, to, selfClosing);
        fieldObject = attrCount > 0;
        fieldOnscreen = field === EPISODE_NUM && attr('system') === 'onscreen';
      }
      fieldText = '';
    }

    if (selfClosing) {
      finish(kind);
    } else {
      stack.push(top);
      top = kind;
    }
  };

  let i = 0;
  for (;;) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    const c = xml.charCodeAt(lt + 1);

    if (c === 47) {
      // A closing tag closes whatever is open; its name is not consulted.
      const gt = xml.indexOf('>', lt);
      if (gt === -1) throw new Error('XMLTV: closing tag is not closed');
      if (top === FIELD) flushText(lt);
      finish(top);
      if (top !== DEAD) top = stack.length > 0 ? (stack.pop() as number) : DEAD;
      i = gt + 1;
    } else if (c === 63) {
      // A processing instruction ends a run of text and counts as a child.
      const end = tagEnd(lt + 1, true);
      if (end === -1) throw new Error('XMLTV: processing instruction is not closed');
      if (top === DEAD) throw new Error('XMLTV: content after the document closed');
      if (top === FIELD) { flushText(lt); fieldObject = true; }
      i = end + 2;
    } else if (c === 33 && xml.startsWith('--', lt + 2)) {
      // A comment is dropped and does NOT end a run of text.
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('XMLTV: comment is not closed');
      if (top === FIELD) runPrefix += xml.slice(runStart, lt);
      i = end + 3;
      runStart = i;
      continue;
    } else if (c === 33 && xml.charCodeAt(lt + 2) === 68) {
      // <!DOCTYPE …>: stepped over, and like a comment it does not end a run.
      const end = docTypeEnd(xml, lt);
      if (top === FIELD) runPrefix += xml.slice(runStart, lt);
      i = end + 1;
      runStart = i;
      continue;
    } else if (c === 33 && xml.charCodeAt(lt + 2) === 91) {
      // CDATA ends a run and is appended as written: not trimmed, not decoded.
      const close = xml.indexOf(']]>', lt);
      if (close === -1) throw new Error('XMLTV: CDATA is not closed');
      if (top === DEAD) throw new Error('XMLTV: content after the document closed');
      if (top === FIELD) {
        flushText(lt);
        fieldText += xml.substring(lt + 9, close);
      }
      i = close + 3;
    } else {
      const gt = tagEnd(lt + 1, false);
      if (gt === -1) throw new Error('XMLTV: tag is not closed');
      if (top === DEAD) throw new Error('XMLTV: content after the document closed');
      if (top === FIELD) { flushText(lt); fieldObject = true; }
      if (nextTab < lt) {
        nextTab = xml.indexOf('\t', lt);
        if (nextTab === -1) nextTab = length;
      }
      if (nextTab < gt) {
        // A tab outside quotes reads as a space; rebuild the expression as
        // the reference did. (Rare: the feed has no tabs at all.)
        const expr = untabbed(xml, lt + 1, gt);
        open(expr, 0, expr.length);
      } else {
        open(xml, lt + 1, gt);
      }
      i = gt + 1;
    }
    runStart = i;
    runPrefix = '';
  }

  // The document ended with elements still open: they count as far as they
  // got (a text still being read does not), exactly as before.
  while (top !== ROOT && top !== DEAD) {
    finish(top);
    top = stack.length > 0 ? (stack.pop() as number) : DEAD;
  }

  // Two top-level <tv> elements used to read as an array with no channels.
  if (tvCount !== 1) return { channels: [], programmes: [] };
  return { channels, programmes };
}

// Indexed by the field constants above.
const FIELD_NAME_LENGTH = ['', 'title', 'sub-title', 'desc', 'category', 'episode-num', 'date', 'display-name']
  .map((name) => name.length);

/** The tag expression `xml[from, to)` with tabs outside quotes made spaces. */
function untabbed(xml: string, from: number, to: number): string {
  let expr = '';
  let boundary = 0;
  for (let k = from; k < to; k++) {
    const c = xml.charCodeAt(k);
    if (boundary) {
      if (c === boundary) boundary = 0;
    } else if (c === 34 || c === 39) {
      boundary = c;
    } else if (c === 9) {
      expr += ' ';
      continue;
    }
    expr += xml[k];
  }
  return expr;
}

/** The index of the `>` closing the `<!DOCTYPE` that starts at `at`. */
function docTypeEnd(xml: string, at: number): number {
  if (!xml.startsWith('OCTYPE', at + 3)) throw new Error('XMLTV: invalid tag instead of DOCTYPE');
  let angles = 1;
  let hasBody = false;
  let comment = false;
  let k = at + 9;
  for (; k < xml.length; k++) {
    const c = xml.charCodeAt(k);
    if (c === 60 && !comment) {
      if (xml.startsWith('!--', k + 1)) {
        comment = true;
      } else if (
        hasBody && (xml.startsWith('!ENTITY', k + 1) || xml.startsWith('!ELEMENT', k + 1)
          || xml.startsWith('!ATTLIST', k + 1) || xml.startsWith('!NOTATION', k + 1))
      ) {
        throw new Error('XMLTV: a DOCTYPE with its own declarations is not supported');
      } else {
        throw new Error('XMLTV: invalid DOCTYPE');
      }
      angles++;
    } else if (c === 62) {
      if (comment) {
        if (xml.charCodeAt(k - 1) === 45 && xml.charCodeAt(k - 2) === 45) {
          comment = false;
          angles--;
        }
      } else {
        angles--;
      }
      if (angles === 0) break;
    } else if (c === 91) {
      hasBody = true;
    }
  }
  if (angles !== 0) throw new Error('XMLTV: unclosed DOCTYPE');
  return k;
}

/**
 * `parseXmltvTimestamp(ts).getTime()`. The one shape ErsatzTV writes,
 * fourteen digits, a space, a sign and four digits, is read by arithmetic;
 * every other string goes to `parseXmltvTimestamp` itself.
 */
function timestampMs(ts: string): number {
  const sign = ts.charCodeAt(15);
  if (ts.length !== 20 || ts.charCodeAt(14) !== 32 || (sign !== 43 && sign !== 45)) {
    return parseXmltvTimestamp(ts).getTime();
  }
  const y0 = ts.charCodeAt(0) - 48, y1 = ts.charCodeAt(1) - 48, y2 = ts.charCodeAt(2) - 48, y3 = ts.charCodeAt(3) - 48;
  const m0 = ts.charCodeAt(4) - 48, m1 = ts.charCodeAt(5) - 48, d0 = ts.charCodeAt(6) - 48, d1 = ts.charCodeAt(7) - 48;
  const h0 = ts.charCodeAt(8) - 48, h1 = ts.charCodeAt(9) - 48, n0 = ts.charCodeAt(10) - 48, n1 = ts.charCodeAt(11) - 48;
  const s0 = ts.charCodeAt(12) - 48, s1 = ts.charCodeAt(13) - 48;
  const a0 = ts.charCodeAt(16) - 48, a1 = ts.charCodeAt(17) - 48, b0 = ts.charCodeAt(18) - 48, b1 = ts.charCodeAt(19) - 48;
  // Each must be a digit: 0..9 once 48 is taken off (a lower character goes negative).
  if (
    y0 < 0 || y0 > 9 || y1 < 0 || y1 > 9 || y2 < 0 || y2 > 9 || y3 < 0 || y3 > 9
    || m0 < 0 || m0 > 9 || m1 < 0 || m1 > 9 || d0 < 0 || d0 > 9 || d1 < 0 || d1 > 9
    || h0 < 0 || h0 > 9 || h1 < 0 || h1 > 9 || n0 < 0 || n0 > 9 || n1 < 0 || n1 > 9
    || s0 < 0 || s0 > 9 || s1 < 0 || s1 > 9
    || a0 < 0 || a0 > 9 || a1 < 0 || a1 > 9 || b0 < 0 || b0 > 9 || b1 < 0 || b1 > 9
  ) {
    return parseXmltvTimestamp(ts).getTime();
  }
  const utcMs = Date.UTC(
    y0 * 1000 + y1 * 100 + y2 * 10 + y3,
    m0 * 10 + m1 - 1,
    d0 * 10 + d1,
    h0 * 10 + h1,
    n0 * 10 + n1,
    s0 * 10 + s1,
  );
  const offsetMinutes = (sign === 43 ? 1 : -1) * ((a0 * 10 + a1) * 60 + b0 * 10 + b1);
  return utcMs - offsetMinutes * 60 * 1000;
}

/**
 * Parse XMLTV timestamp format: "YYYYMMDDHHmmss +/-HHMM"
 * Example: "20260215070314 -0800"
 * Returns a UTC Date object.
 */
export function parseXmltvTimestamp(ts: string): Date {
  const trimmed = ts.trim();
  // Match: 14 digits, optional space, optional timezone offset
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!match) {
    return new Date(0);
  }

  const [, year, month, day, hour, minute, second, tz] = match;

  // Build an ISO-ish string with offset for correct parsing
  let offsetMinutes = 0;
  if (tz) {
    const sign = tz[0] === '+' ? 1 : -1;
    const tzHours = parseInt(tz.slice(1, 3), 10);
    const tzMins = parseInt(tz.slice(3, 5), 10);
    offsetMinutes = sign * (tzHours * 60 + tzMins);
  }

  // Create Date in UTC, then adjust for the offset
  const utcMs = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );

  // The timestamp is local time + offset, so subtract offset to get UTC
  return new Date(utcMs - offsetMinutes * 60 * 1000);
}

/**
 * Get programmes currently airing on a channel.
 * Returns the programme whose start <= now < stop.
 */
export function getNowPlaying(programmes: Programme[], channelId: string, now?: Date): Programme | undefined {
  const t = now || new Date();
  return programmes.find(
    (p) => p.channelId === channelId && p.start <= t && p.stop > t
  );
}

/**
 * Get upcoming programmes for a channel (starting after now).
 * Returns them in chronological order, limited to `count`.
 */
export function getUpcoming(
  programmes: Programme[],
  channelId: string,
  count: number = 10,
  now?: Date
): Programme[] {
  const t = now || new Date();
  return programmes
    .filter((p) => p.channelId === channelId && p.stop > t)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}
