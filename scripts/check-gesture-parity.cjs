// Characterize the actual watch-screen swipe callback against a Git baseline.
// Runs its state updates and action calls in isolation; it does not emulate a device.
// TypeScript is already a development dependency. No source files are rewritten.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const baseline = process.argv[2];
if (!baseline)
  throw new Error("Usage: node scripts/check-gesture-parity.cjs <base-ref>");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    file,
  );
const { swipeToCommand } = require(root + "/src/station/remote.ts");
function handler(text) {
  const source = ts.createSourceFile(
    "watch.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let arrow;
  function walk(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "onGestureEvent"
    )
      arrow = node.initializer.arguments[0];
    else ts.forEachChild(node, walk);
  }
  walk(source);
  assert(arrow);
  const code = ts.transpileModule("const handler = " + arrow.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return (config, dx, dy, ended) => {
    const state = {
      boardIndex: config.boardIndex,
      boardScroll: config.boardScroll,
      boardCursor: config.boardCursor,
      dialIndex: config.dialIndex,
      boardClosing: false,
    };
    const actions = [];
    const scope = {
      ...config,
      channels: Array(config.count),
      State: { END: 5 },
      SWIPE_THRESHOLD: 70,
      CURSOR_HOME: 2,
      ROWS_DS6: 8,
      SCROLL_MAX: 30,
      SCROLL_MIN: -8,
      swipeToCommand,
    };
    for (const key of Object.keys(state))
      scope["set" + key[0].toUpperCase() + key.slice(1)] = (v) => {
        state[key] = typeof v === "function" ? v(state[key]) : v;
      };
    for (const name of [
      "onGate",
      "requestTune",
      "tuneTo",
      "openHome",
      "openBoard",
    ])
      scope[name] = (...args) => actions.push([name, ...args]);
    new Function(
      ...Object.keys(scope),
      code +
        ";handler({nativeEvent:{translationX:" +
        dx +
        ",translationY:" +
        dy +
        ",state:" +
        (ended ? 5 : 2) +
        "}});",
    )(...Object.values(scope));
    return { state, actions };
  };
}
const before = handler(
  execFileSync("git", ["show", baseline + ":app/watch.tsx"], {
    cwd: root,
    encoding: "utf8",
  }),
);
const after = handler(fs.readFileSync(root + "/app/watch.tsx", "utf8"));
let checked = 0;
const distances = [-150, -71, -70, -69, 0, 69, 70, 71, 150];
for (const [isPhone, isLandscape] of [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])
  for (const count of [1, 6])
    for (const safeIndex of [...new Set([0, count - 1])])
      for (const boardVisible of [false, true])
        for (const homeVisible of [false, true])
          for (const signOff of [false, true])
            for (const detailProgramme of [null, {}])
              for (const boardCursor of [0, 2, 7])
                for (const boardScroll of [-8, 0, 30])
                  for (const dx of distances)
                    for (const dy of distances) {
                      const config = {
                        isPhone,
                        isLandscape,
                        count,
                        safeIndex,
                        boardVisible,
                        homeVisible,
                        signOff,
                        detailProgramme,
                        boardCursor,
                        boardScroll,
                        boardIndex: count - 1,
                        dialIndex: count - 1,
                      };
                      assert.deepEqual(
                        after(config, dx, dy, true),
                        before(config, dx, dy, true),
                        JSON.stringify({ config, dx, dy }),
                      );
                      checked++;
                    }
console.log(
  "PASS: " +
    checked +
    " current watch-handler gesture cases match before/after, including phone orientations, thresholds, diagonals, modes, cursor/scroll bounds, and dial ends",
);
