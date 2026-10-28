# Behavior-preserving code review

Reviewed against `0844d706eb042fdd4881b89c0e4ead21b7840560` on 2026-10-28. The scope includes the Expo screens, both cabinet layouts, guide parsing/storage, playback controllers and surfaces, the local Swift module, and the Electron shell. This change does not redesign the interface, change timing constants, or implement the future behavior changes recorded in the station matrix.

## Findings and changes

| Hotspot | Evidence | Change |
| --- | --- | --- |
| Swipe routing in `app/watch.tsx` | The deeply nested handler duplicates the already tested `swipeToCommand` table. Its cognitive complexity was 80. | Route through the existing command function, split its decisions by surface, and retain a small local switch that performs the same state updates and calls. |
| Guide boards during drum animation | Both boards filtered and sorted the entire guide, found the live row, and rebuilt rows on every timer-driven render. The fixture contains 1,356 programmes. | Memoize the evening by guide identity and channel ID, and rows by evening, clock, and scroll. No new state, effects, or timers. |
| Receiver guide summaries | Every channel searched the whole guide separately; the selected channel repeated a current-airing lookup. | Build a channel index once per guide refresh, reuse the existing lookup functions on each channel's entries, and read the selected programme from the existing map. |
| Identical board row construction | Console and phone independently implemented the same row fields, missing-row rules, and live/past/next flags. | One pure `boardRows` helper, parameterized by the existing seven/eight-row constants. Cabinet-specific column lengths, drum keys, and animation mechanics remain local. |
| Clock formatting | Eight components repeated the same local 12-hour formatting. | Two small pure functions, with midnight/noon and minute-padding tests. No locale-dependent formatting substitution. |
| Tuning overlay | Native and web repeated the vignette, plate markup, and styles. | Share only that presentation in `TuningOverlay`. Native trace events, Swift snow, web canvas, and their different black/gray fallback backgrounds retain their existing ownership. |

The guide preserves feed-order selection for overlapping airings, stable order for tied start times, half-open airing boundaries, and the existing six-entry window **before** excluding interstitials. It deliberately preserves the board's existing no-live fallback, including its first-row next marker. These details are tested rather than silently corrected.

The swipe refactor preserves the different horizontal/vertical threshold comparisons, the portrait board's up-to-close/down-to-page vocabulary, notes and sign-off guards, cursor limits, wrapping versus bounded channel changes, and the distinction between `tuneTo`, `requestTune`, and `onGate`.

## Measurement

Cyclomatic complexity counts independent control-flow paths. Cognitive complexity also accounts for the mental cost of nested control flow. Neither is a measure of runtime speed, and a large score is a review signal rather than proof of a defect. A state-machine switch can legitimately have many paths.

Measured using ESLint 9.39.5, TypeScript parser 8.72.1, and eslint-plugin-sonarjs 3.0.7. Threshold zero was used to report individual scores, not as a proposed project lint limit.

| Function | Cyclomatic before → after | Cognitive before → after |
| --- | --- | --- |
| Watch-screen gesture callback | 39 → 21 | 80 → 15 |
| `swipeToCommand` | 34 → 7 | 63 → 5 |
| New board/home/watching swipe helpers | 10 / 6 / 12 | 12 / 4 / 15 |

The watch screen remains large. Its top-level score changes from 87 to 88 cyclomatic and 32 to 33 cognitive because the selected-programme conditional now lives directly in render instead of inside a memo callback. That is a local metric-placement effect, not a claim that the whole screen has been simplified. The substantive reduction is eliminating a second copy of gesture decisions and making their branches shallower.

jscpd 4.3.0 found 9 exact clone pairs / 179 duplicated lines before, and 4 pairs / 53 lines after the presentation refactors. The scan covered `app`, `src`, `modules`, and `apps/desktop-electron`, excluding tests, dependencies, lockfiles, and the declarative station matrix; minimums were 10 lines / 70 tokens. These thresholds omit shorter repetition such as most clock helpers. Clone counts do not establish semantic equivalence.

A Node 22.23.4 microbenchmark on the real six-channel fixture measured median guide-map calculation at approximately 0.428 ms before and 0.268 ms with the index reused. Index construction cost about 0.073 ms per refresh. Each result used seven samples of 500 iterations after warmup. The absolute saving is modest for six channels; the clearer scaling improvement is removing repeated full-guide scans. Board memoization also removes repeated filtering/sorting during unchanged animation renders. These are isolated data-calculation measurements, **not** a native frame-rate or startup-speed claim.

## Research and how it informs the change

Primary documentation was retrieved from its official source repositories because this cloud environment blocks some documentation hosts. The sources support specific choices here; they are not a checklist applied indiscriminately.

1. [React: `useMemo`](https://react.dev/reference/react/useMemo) ([retrieved source](https://github.com/reactjs/react.dev/blob/main/src/content/reference/react/useMemo.md)). React recommends measuring expensive calculations, caching only when inputs are stable, and treating memoization as an optimization rather than a correctness guarantee. The boards process a large array during frequent animation renders, while programme data changes infrequently. The helpers remain pure and correct if React discards a cache. Cheap formatting and every callback were not blanket-memoized.
2. [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) ([source](https://github.com/reactjs/react.dev/blob/main/src/content/learn/you-might-not-need-an-effect.md)). Filtering and presentation derivation belong in render or a memo, not in an effect that copies derived values into state and causes another render. The guide changes introduce no synchronization effect.
3. [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) ([source](https://github.com/reactjs/react.dev/blob/main/src/content/learn/choosing-the-state-structure.md)). Avoid redundant/contradictory state. The selected programme now comes from the same current-airing map supplied to the receiver, instead of a separate search; the index is derived, not independently mutable app state.
4. [React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) ([source](https://github.com/reactjs/react.dev/blob/main/src/content/learn/reusing-logic-with-custom-hooks.md)). Custom hooks should describe concrete use cases; they share logic, not state. This is why the refactor uses ordinary pure helpers where possible and does not hide the watch screen in a generic lifecycle hook or introduce a global command bus.
5. [React Native 0.81: Performance Overview](https://reactnative.dev/docs/0.81/performance) ([source for this app's RN version](https://github.com/facebook/react-native-website/blob/main/website/versioned_docs/version-0.81/performance.md)). JS-thread work can delay JS-driven animations and input, and performance must be evaluated in release builds. Removing avoidable guide work is justified; changing animation drivers or timing without native profiling is not.
6. [ESLint: complexity](https://eslint.org/docs/latest/rules/complexity) ([source](https://github.com/eslint/eslint/blob/main/docs/src/rules/complexity.md)) and [SonarSource: cognitive-complexity](https://github.com/SonarSource/eslint-plugin-sonarjs/blob/master/docs/rules/cognitive-complexity.md). These distinguish path counts from understandability. The goal is fewer duplicated decisions and less nesting, not moving branches into arbitrary functions to satisfy a numeric target.
7. [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots) ([source](https://github.com/microsoft/playwright/blob/main/docs/src/test-snapshots-js.md)). Baseline and changed screenshots must use the same browser/environment and wait for a stable image. Browser comparisons here use the same Chromium, deterministic guide time, settled board text, and the same viewports. Random video noise is masked; application UI is not. A phone-sized browser remains a web test, not native iOS validation.
8. [Expo: Development builds](https://docs.expo.dev/develop/development-builds/introduction/) ([source](https://github.com/expo/expo/blob/main/docs/pages/develop/development-builds/introduction.mdx)). Custom native libraries require an app binary containing them. Expo Go cannot validate `modules/dsp-picture`. An iOS JS bundle is a useful build check, but cannot validate Swift, safe-area layout, AVPlayer, or native gestures.
9. The native test harness uses Maestro's supported [orientation command parser](https://github.com/mobile-dev-inc/maestro/blob/main/maestro-orchestra/src/main/java/maestro/orchestra/yaml/YamlSetOrientation.kt) and [CLI artifact options](https://github.com/mobile-dev-inc/maestro/blob/main/maestro-cli/src/main/java/maestro/cli/command/TestCommand.kt). Screenshots and failures are retained for inspection rather than treating successful compilation as visual approval.

## Validation and limits

Completed locally:

- All 993 Jest tests in 21 suites passed, including 23 added tests for guide/row/clock behavior. The real-guide parity test compares old full-guide queries against indexed queries at every programme's start and stop.
- TypeScript passed, and the production web export/PWA patch passed.
- iOS Metro/Hermes export passed, resolving the native JS/TS surface and shared overlay. This is not an Xcode build.
- `node scripts/check-gesture-parity.cjs 0844d70` compared the actual old/new watch callbacks in 139,968 combinations of cabinet, orientation, mode flags, positive channel counts, dial ends, cursor/scroll bounds, and swipe distances. It checks resulting state updates and action calls; it does not emulate React batching or native gesture recognition.
- Browser checks exercise home, guide, channel changes, cursor navigation, and tuning at 1440×900, 844×390, and 390×844. All 15 settled baseline/current screenshots and their rendered text matched exactly, with only the randomized tuning canvas masked. TV layout inspection also covers 1920×1080 and 3840×2160 CSS pixels. No browser exceptions were observed.
- The native workflow YAML and shell blocks parse. Its local fixture server supplies six channels, current guide entries, HEAD/GET HLS responses, and a stream successfully decoded by FFmpeg.

Native display validation remains required before merge. The `iOS Simulator review` workflow builds baseline and current source on macOS, runs the same Maestro flow on an iPhone simulator, and uploads `ios-review-baseline` and `ios-review-current` artifacts. It covers setup, portrait home/board/playing, orientation changes, landscape home/board/playing, and board gestures. It generates a local HLS signal, so it does not need the private ErsatzTV server. Simulator builds require neither App Store distribution credentials nor an Expo/EAS token. The initial push trigger is restricted to this refactor branch; later comparisons can be dispatched manually with a baseline ref.

This workflow has been prepared, not yet demonstrated on an Apple runner. Inspect its build logs, assertions, and baseline/current screenshots before declaring native UI parity. It cannot replace physical-device checks for PiP, interruptions, hardware decoding, or real ErsatzTV session behavior. Do not claim those were validated by a successful simulator smoke test.

## Remaining hotspots and the TV issue

| Area | Assessment and next step |
| --- | --- |
| Watch-screen lifecycle and state | Data fetching, focus changes, tuning, overlays, input, and transition timers still share one large component. Extracting a named data-loading hook or modelling transitions explicitly is promising, but needs integration coverage for server changes, cancellation, and native playback first. Preserve generation guards and synchronous gesture activation. |
| Keyboard handling | The inline keyboard handler (cognitive 39) and pure key table remain separate. It is a candidate for the same characterization-and-routing approach, but needs focused coverage of input fields, held keys, notes priority, and PiP's transient user activation. Do not silently enable future keyboard rules recorded in the table. |
| Native playback state machines | `reduceJoin` (cognitive 52) and `reduceGate` (32) are substantial but pure, explicitly model time, and have extensive tests. Their branches encode interruptions, pause attribution, first-frame evidence, and stale generations. Avoid flattening them by merging distinct states or changing retry behavior merely to lower a score. |
| Web player effect | HLS ownership, visibility, wake locks, recovery, and cleanup are concentrated in one effect. Named lifecycle boundaries may help, but real Safari/HLS and teardown tests should precede ownership changes. |
| Board animation mechanics | The two cabinets still differ in reduced-motion handling, field lengths, presentation keys, and shade sequencing. Their remaining repeated mechanics are not safely interchangeable just because the code looks similar. |
| Dependency footprint | `CLAUDE.md` records Skia as unimported and reserved for a tooling pass. Measure native binary/pod impact and rebuild both platforms before removing it; no dependency changes are included here. |
| Large TV spacing | Reproduced at 4K. `Home` caps the register at 286 points, the programme panel at 460, and the dial at 560, while the overall row spans the viewport. Fixed typography and largely fixed guide rows compound the empty-space effect. A centered cabinet with an intentional TV-scale rule is a reasonable design direction. It changes visible layout and must be separately proposed and approved. CSS viewport size, display scaling, viewing distance, and TV resolution all matter; physical diagonal alone is insufficient. No spacing fix is included in this refactor. |
