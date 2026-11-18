// What the web bundle is made of, measured from its source map.
//
//   npx expo export --platform web --source-maps --output-dir dist/map
//   node scripts/bundle-report.cjs dist/map                 # every bundle, by package, largest first
//   node scripts/bundle-report.cjs dist/map --top 15        # only the 15 largest packages (--top 0: none)
//   node scripts/bundle-report.cjs dist/map --modules 25    # also the 25 largest single modules
//   node scripts/bundle-report.cjs dist/map --find skia --find hls.js --find fast-xml-parser
//
// Each byte of a generated file is credited to the source file the map says
// it came from: a mapping segment owns the text from its column to the next
// segment's (or the end of the line). Sources under node_modules are grouped
// by package; the app's own files by their top folder. Text no segment
// claims (module wrappers, the module table) is listed as "(unmapped)".
//
// It reads the map itself; there is no dependency to install. A bundle
// loaded on demand is its own file with its own map, so "is hls.js in the
// entry or lazily loaded" is answered by which file it is listed under.
const fs = require('node:fs');
const path = require('node:path');

function usage() {
  console.error('Usage: node scripts/bundle-report.cjs <export-dir | bundle.js.map> [--top N] [--modules N] [--find name]...');
  process.exit(2);
}

const args = process.argv.slice(2);
let target = null;
let top = Infinity;
let modules = 0;
const finds = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--top') top = Number(args[++i]);
  else if (args[i] === '--modules') modules = Number(args[++i]);
  else if (args[i] === '--find') finds.push(String(args[++i]).toLowerCase());
  else if (args[i].startsWith('--')) usage();
  else target = args[i];
}
if (!target || Number.isNaN(top) || Number.isNaN(modules)) usage();

function findMaps(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findMaps(full));
    else if (entry.name.endsWith('.js.map')) found.push(full);
  }
  return found;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i++) BASE64_VALUE[BASE64.charCodeAt(i)] = i;

/**
 * Walk a `mappings` string, calling `segment(line, column, sourceIndex)` for
 * each segment in order (`sourceIndex` is -1 for a segment that names no
 * source). Lines and columns are zero-based, columns in UTF-16 code units.
 */
function walkMappings(mappings, segment) {
  let line = 0;
  let column = 0;
  let source = 0;
  let i = 0;
  const length = mappings.length;
  const fields = [0, 0, 0, 0, 0];
  while (i < length) {
    const c = mappings.charCodeAt(i);
    if (c === 59) { line++; column = 0; i++; continue; } // ;
    if (c === 44) { i++; continue; } // ,
    let count = 0;
    while (i < length) {
      const start = mappings.charCodeAt(i);
      if (start === 59 || start === 44) break;
      let value = 0;
      let shift = 0;
      let digit;
      do {
        digit = BASE64_VALUE[mappings.charCodeAt(i++)];
        if (digit < 0) throw new Error(`bad base64 in mappings at ${i - 1}`);
        value += (digit & 31) * 2 ** shift;
        shift += 5;
      } while (digit & 32);
      fields[count++] = value % 2 ? -Math.floor(value / 2) : Math.floor(value / 2);
    }
    column += fields[0];
    if (count >= 4) {
      source += fields[1];
      segment(line, column, source);
    } else {
      segment(line, column, -1);
    }
  }
}

/** node_modules/<pkg> or node_modules/@scope/<pkg>; the app's files by top folder. */
function owner(source) {
  const normal = source.replace(/\\/g, '/');
  const at = normal.lastIndexOf('/node_modules/');
  if (at !== -1) {
    const parts = normal.slice(at + '/node_modules/'.length).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  if (normal.startsWith('__') || !normal.includes('/')) return `(runtime) ${normal}`;
  // Metro names the app's own files from the project root: "/app/watch.tsx".
  const root = path.resolve(__dirname, '..').replace(/\\/g, '/');
  const relative = (normal.startsWith(`${root}/`) ? normal.slice(root.length + 1) : normal).replace(/^(\.{0,2}\/)+/, '');
  const [first, second] = relative.split('/');
  // src/ is told apart by its folders (src/components, src/parsers, …).
  return `(app) ${first === 'src' && second && !second.includes('.') ? `src/${second}` : first}`;
}

function bytesOf(text) {
  return Buffer.byteLength(text, 'utf8');
}

function report(mapPath) {
  const jsPath = mapPath.slice(0, -'.map'.length);
  if (!fs.existsSync(jsPath)) {
    console.log(`\n${mapPath}: no generated file beside it, skipped`);
    return;
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const js = fs.readFileSync(jsPath, 'utf8');
  const lines = js.split('\n');
  const total = bytesOf(js);

  // An index map (`sections`) is a list of ordinary maps at line offsets.
  const sections = map.sections
    ? map.sections.map((s) => ({ offset: s.offset.line, map: s.map }))
    : [{ offset: 0, map }];

  const bySource = new Map();
  let mapped = 0;
  const credit = (name, text) => {
    if (text.length === 0) return;
    const size = bytesOf(text);
    bySource.set(name, (bySource.get(name) || 0) + size);
    mapped += size;
  };

  for (const { offset, map: part } of sections) {
    const sources = part.sources || [];
    let openLine = -1;
    let openColumn = 0;
    let openSource = -1;
    const close = (toLine, toColumn) => {
      if (openLine === -1 || openSource === -1) return;
      // A segment never runs past its own line.
      const text = lines[openLine] || '';
      const end = toLine === openLine ? toColumn : text.length;
      credit(sources[openSource] ?? '(unknown source)', text.slice(openColumn, end));
    };
    walkMappings(part.mappings || '', (line, column, source) => {
      const at = line + offset;
      close(at, column);
      openLine = at;
      openColumn = column;
      openSource = source;
    });
    close(-2, 0);
  }

  const byOwner = new Map();
  for (const [source, size] of bySource) {
    const name = owner(source);
    byOwner.set(name, (byOwner.get(name) || 0) + size);
  }
  const unmapped = total - mapped;
  if (unmapped > 0) byOwner.set('(unmapped) module wrappers, newlines', unmapped);

  // Decimal units, as `expo export` prints them: 1 kB = 1000 bytes.
  const kb = (n) => `${(n / 1000).toFixed(1).padStart(8)} kB`;
  const pct = (n) => `${((n / total) * 100).toFixed(1).padStart(5)}%`;
  console.log(`\n${path.relative(process.cwd(), jsPath)}`);
  console.log(`  ${total} bytes (${(total / 1e6).toFixed(2)} MB), ${bySource.size} source files, ${byOwner.size} packages/groups`);

  const owners = [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
  if (top > 0) {
    console.log(`\n  By package${top < owners.length ? ` (largest ${top} of ${owners.length})` : ''}:`);
    owners.slice(0, top).forEach(([name, size]) => console.log(`  ${kb(size)} ${pct(size)}  ${name}`));
    if (top < owners.length) {
      const rest = owners.slice(top).reduce((sum, [, size]) => sum + size, 0);
      console.log(`  ${kb(rest)} ${pct(rest)}  (everything else: ${owners.length - top} more)`);
    }
  }

  if (modules > 0) {
    console.log(`\n  Largest ${modules} modules:`);
    [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, modules).forEach(([source, size]) => {
      const at = source.lastIndexOf('/node_modules/');
      console.log(`  ${kb(size)} ${pct(size)}  ${at === -1 ? source : source.slice(at + '/node_modules/'.length)}`);
    });
  }

  for (const needle of finds) {
    const hits = [...bySource.entries()].filter(([source]) => source.toLowerCase().includes(needle));
    const size = hits.reduce((sum, [, n]) => sum + n, 0);
    console.log(`\n  --find ${needle}: ${hits.length === 0 ? 'not in this bundle' : `${hits.length} modules, ${kb(size).trim()} (${pct(size).trim()})`}`);
    hits.sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([source, n]) => {
      const at = source.lastIndexOf('/node_modules/');
      console.log(`  ${kb(n)}        ${at === -1 ? source : source.slice(at + '/node_modules/'.length)}`);
    });
  }
}

const stat = fs.statSync(target);
const maps = stat.isDirectory() ? findMaps(target) : [target];
if (maps.length === 0) {
  console.error(`No .js.map under ${target}. Export with --source-maps.`);
  process.exit(1);
}
// Largest generated file first: that is the entry.
maps
  .map((file) => ({ file, size: fs.existsSync(file.slice(0, -4)) ? fs.statSync(file.slice(0, -4)).size : 0 }))
  .sort((a, b) => b.size - a.size)
  .forEach(({ file }) => report(file));
