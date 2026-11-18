// How long the guide takes to parse: the parser the app ships against the
// reference parser it replaced (src/parsers/__tests__/reference).
//
//   node scripts/bench-guide-parse.cjs                       # the fixture in test_data
//   curl -s http://<host>:8409/iptv/xmltv.xml > /tmp/live.xml
//   node scripts/bench-guide-parse.cjs /tmp/live.xml         # the station's feed as it is today
//   node --jitless scripts/bench-guide-parse.cjs /tmp/live.xml --rounds 15
//
// `--jitless` runs V8 as an interpreter only. The phone runs Hermes, which
// has no JIT either; there is no Hermes here to run, so this is the nearest
// stand-in, not a measurement of the phone.
//
// The two parsers take turns, round by round, in one process, so whatever
// else the machine is doing lands on both. Before any timing the two outputs
// are compared in full; a difference stops the run.
// TypeScript is already a development dependency. No source files are rewritten.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');

require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText,
    file,
  );

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let feed = path.join(root, 'test_data', 'xmltv.xml');
let rounds = 41;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rounds') rounds = Number(args[++i]);
  else feed = path.resolve(args[i]);
}
if (!Number.isInteger(rounds) || rounds < 1) {
  console.error('Usage: node scripts/bench-guide-parse.cjs [xmltv.xml] [--rounds N]');
  process.exit(2);
}

const current = require(path.join(root, 'src/parsers/xmltv.ts')).parseXMLTV;
const reference = require(path.join(root, 'src/parsers/__tests__/reference/xmltvReference.ts')).parseXMLTV;
const raw = fs.readFileSync(feed, 'utf8');

const guide = current(raw, '192.168.50.188', 8409);
assert.deepStrictEqual(guide, reference(raw, '192.168.50.188', 8409), 'the two parsers disagree on this feed');
console.log(
  `${path.relative(process.cwd(), feed)}: ${raw.length} characters, ${guide.channels.length} channels, `
  + `${guide.programmes.length} programmes; both parsers agree`,
);

const parsers = [['reference (fast-xml-parser)', reference], ['current (forward scan)', current]];
for (const [, parse] of parsers) for (let i = 0; i < 5; i++) parse(raw, '192.168.50.188', 8409);
const times = parsers.map(() => []);
for (let round = 0; round < rounds; round++) {
  parsers.forEach(([, parse], k) => {
    const start = performance.now();
    parse(raw, '192.168.50.188', 8409);
    times[k].push(performance.now() - start);
  });
}
const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
const medians = times.map(median);
parsers.forEach(([label], k) => {
  console.log(`  ${label.padEnd(28)} median ${medians[k].toFixed(1).padStart(6)} ms   fastest ${Math.min(...times[k]).toFixed(1).padStart(6)} ms`);
});
console.log(`  ${rounds} rounds after 5 warm-up parses each; ${(medians[0] / medians[1]).toFixed(1)} times faster at the median`);
