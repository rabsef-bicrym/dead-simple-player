/**
 * The native carrier, pinned as text (there is no Xcode on the box that runs
 * this; EAS is the compile gate — docs/native-witness.md §4.6): the one patch
 * hunk, the local module's shape, the Swift invariants a grep can hold, and
 * the surface's discipline about play() and timers. The Swift is pinned as
 * text because nothing else here can read it; the JS pins are token-level,
 * and the behaviour they border has its own tests (firstFrameGate.test.ts).
 */
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');
/** Swift with its comments removed, so a word in prose cannot pass for a symbol. */
const code = (swift: string) => swift.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('patches/expo-video+3.0.16.patch — one hunk, the continuation', () => {
  const patch = read('patches', 'expo-video+3.0.16.patch');

  it('touches VideoPlayer.swift and nothing else', () => {
    const files = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
    expect(files).toEqual(['node_modules/expo-video/ios/VideoPlayer.swift']);
  });

  it('makes replaceAsync resolve only after the item is current', () => {
    expect(patch).toMatch(/^\+\s*await withCheckedContinuation \{ continuation in$/m);
    expect(patch).toMatch(/^\+\s*self\.ref\.replaceCurrentItem\(with: playerItem\)$/m);
    expect(patch).toMatch(/^\+\s*continuation\.resume\(\)$/m);
  });

  it('carries no witness: the view-level Swift lives in modules/dsp-picture', () => {
    expect(patch).not.toMatch(/VideoView\.swift/);
    expect(patch).not.toMatch(/armFirstFrameWitness|CADisplayLink|onFirstFrameRender/);
  });
});

describe('modules/dsp-picture — the local module', () => {
  const dir = ['modules', 'dsp-picture'];
  const module = read(...dir, 'ios', 'DSPPictureModule.swift');
  const picture = read(...dir, 'ios', 'DSPPictureView.swift');
  const staticView = read(...dir, 'ios', 'DSPStaticView.swift');
  const index = read(...dir, 'index.ts');

  const eventsDeclared = (swift: string, view: string): string[] => {
    const block = swift.slice(swift.indexOf(`View(${view}.self)`));
    const m = /Events\(([^)]*)\)/.exec(block);
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
  const dispatchers = (swift: string): string[] => [...swift.matchAll(/^\s*let (\w+) = EventDispatcher\(\)/gm)].map((m) => m[1]);

  it('is Apple-only (decision 5) and names its module', () => {
    const config = JSON.parse(read(...dir, 'expo-module.config.json')) as { platforms: string[]; apple: { modules: string[] } };
    expect(config.platforms).toEqual(['apple']);
    expect(config.apple.modules).toEqual(['DSPPictureModule']);
    expect(module).toMatch(/Name\("DSPPicture"\)/);
  });

  it('declares each view\'s events by the exact names of its EventDispatcher properties (the Mirror match)', () => {
    expect(eventsDeclared(module, 'DSPPictureView').sort()).toEqual(dispatchers(picture).sort());
    expect(eventsDeclared(module, 'DSPStaticView').sort()).toEqual(dispatchers(staticView).sort());
    expect(eventsDeclared(module, 'DSPPictureView')).toEqual(['onTrace', 'onFirstFrame', 'onItemLost', 'onItemFailed', 'onPictureInPictureChange']);
  });

  it('exports the two views under the names index.ts requires', () => {
    expect(module).toMatch(/View\(DSPPictureView\.self\)/);
    expect(module).toMatch(/View\(DSPStaticView\.self\)/);
    expect(index).toMatch(/tryRequire<.+>\('DSPPictureView', 'expect'\);/);
    expect(index).toMatch(/tryRequire<.+>\('DSPStaticView'\);/);
    expect(index).toMatch(/requireNativeViewManager<P>\('DSPPicture', view\)/);
  });

  it('index.ts reads availability from the module object: requireNativeViewManager never throws for a missing module', () => {
    expect(index).toMatch(/requireOptionalNativeModule<[^>]+>\('DSPPicture'\)/);
    expect(index).toMatch(/ViewPrototypes\?\.\[`DSPPicture_\$\{view\}`\]/);
    const body = index.slice(index.indexOf('function tryRequire<'), index.indexOf('export const DSPPictureNativeView'));
    const gate = body.indexOf('if (!proto) return null');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf("requireNativeViewManager<P>('DSPPicture', view)"));
    expect(index).not.toMatch(/try\s*\{\s*return requireNativeViewManager/);
  });

  it('runs every view function on main, offers the ones the surface calls, and types every one on the handle', () => {
    const fns = [...module.matchAll(/AsyncFunction\("(\w+)"\)/g)].map((m) => m[1]);
    expect(fns).toEqual(expect.arrayContaining(['expect', 'startPlayback', 'startPictureInPicture']));
    expect((module.match(/\.runOnQueue\(\.main\)/g) ?? []).length).toBe(fns.length);
    const handle = index.slice(index.indexOf('export interface DSPPictureHandle'), index.indexOf('export interface DSPStaticViewProps'));
    for (const fn of fns) expect(handle).toMatch(new RegExp(`^\\s+${fn}\\(`, 'm'));
  });

  it('the witness decides on nothing wall-clock: no display link, no timer, the item\'s own clock samples', () => {
    expect(code(picture)).not.toMatch(/CADisplayLink|Timer\.|asyncAfter|DispatchWorkItem/);
    expect(picture).toMatch(/addPeriodicTimeObserver\(forInterval: CMTime\(value: 1, timescale: 30\), queue: \.main\)/);
    expect(picture).toMatch(/removeTimeObserver/);
  });

  it('the witness reads the conjuncts the design names', () => {
    expect(picture).toMatch(/timeControlStatus == \.playing && p\.rate > 0 && tb > 0/);          // C4
    expect(picture).toMatch(/CMTimeCompare\(cur, prev\) > 0/);                                     // C5
    expect(picture).toMatch(/copyPixelBuffer\(forItemTime: itemTime, itemTimeForDisplay: &display\)/); // C6
    expect(picture).toMatch(/rfdNow && \(rfdKvo \|\| displayAdvanced\)/);                          // C3
    expect(picture).toMatch(/applicationState == \.background/);                                   // C7
    expect(picture).toMatch(/isExternalPlaybackActive/);                                           // external
    expect(picture).toMatch(/running && advanced && b\.copyOK && c3 && screen/);
  });

  it('rate 0 across the swap; playImmediately is the one starter; the output is removed only at unbind', () => {
    expect(picture).toMatch(/func expect\(generation: Int, uri: String\) \{\s*if let p = player, p\.rate != 0 \{ p\.pause\(\) \}/);
    expect((picture.match(/playImmediately\(atRate: 1\.0\)/g) ?? []).length).toBe(1);
    expect(code(picture)).not.toMatch(/\bp\.play\(\)|player\?\.play\(\)|player\.play\(\)/);
    expect((picture.match(/\.remove\(b\.output\)/g) ?? []).length).toBe(1);
  });

  it('N expect wears the expectation\'s generation, not the still-bound item\'s (ff-spec §10.11 reads it under the new tune)', () => {
    expect(picture).toMatch(/row\("N expect", "g=\\\(generation\) .*", g: generation\)/);
    expect(picture).toMatch(/_ b: BoundItem\? = nil, g: Int\? = nil\)/);
    expect(picture).toMatch(/"g": g \?\? bb\?\.generation \?\? \(pending\?\.generation \?\? -1\)/);
  });

  it('the live offset is written in the item KVO and printed, never assumed (decision 6d)', () => {
    expect(picture).toMatch(/newItem\.configuredTimeOffsetFromLive = CMTime\(seconds: liveOffsetSeconds, preferredTimescale: 600\)/);
    expect(picture).toMatch(/row\("N config", "configured=/);
  });

  it('setPlayer is identity-guarded and nothing re-arms on layout (FF-13)', () => {
    expect(picture).toMatch(/if let newRef, let current = player, current === newRef\.ref \{ return \}/);
    const layout = picture.slice(picture.indexOf('public override func layoutSubviews()'), picture.indexOf('public override func willMove'));
    expect(layout).not.toMatch(/expect|installPlayerObservers|setPlayer|BoundItem/);
  });

  it('the view holds its player for the attach\'s lifetime, and its deinit tears down without dispatching a row', () => {
    expect(picture).toMatch(/private var player: AVPlayer\?/);
    expect(code(picture)).not.toMatch(/playerRef/);                                             // no weak ref to read nil
    expect(picture).toMatch(/deinit \{\s*tearingDown = true\s*detachPlayer\(reason: "deinit"\)/);
    const rowFn = picture.slice(picture.indexOf('private func row('), picture.indexOf('private func onMain('));
    expect(rowFn).toMatch(/guard !tearingDown else \{ return \}/);
  });

  it('the static is a keyframe animation whose liveness rows come from the delegate and the presentation layer', () => {
    expect(staticView).toMatch(/CAKeyframeAnimation\(keyPath: "contentsRect"\)/);
    expect(staticView).toMatch(/a\.calculationMode = \.discrete/);
    expect(staticView).toMatch(/func animationDidStart\(_ anim: CAAnimation\)/);
    expect(staticView).toMatch(/snow\.presentation\(\)\?\.contentsRect/);
    // CAAnimation retains its delegate: the view is never the delegate of its own infinite animation.
    expect(staticView).toMatch(/final class AnimationProxy: NSObject, CAAnimationDelegate \{\s*weak var owner: DSPStaticView\?/);
    expect(staticView).toMatch(/a\.delegate = animationProxy/);
    expect(code(staticView)).not.toMatch(/\.delegate = self\b/);
    expect(code(staticView)).not.toMatch(/class DSPStaticView: ExpoView, CAAnimationDelegate/);
    // Off the window the animation is dropped, not kept for the layer's life.
    const offWindow = staticView.slice(staticView.indexOf('if window == nil {'), staticView.indexOf('} else {'));
    expect(offWindow).toMatch(/snow\.removeAnimation\(forKey: "snow"\)/);
    expect(staticView).toMatch(/if boilTicks > Self\.boilTickBudget \{ boilLink\?\.invalidate\(\); boilLink = nil; return \}/);   // the link is bounded
    expect(staticView).not.toMatch(/setCompletionBlock/);
    expect(staticView).toMatch(/backgroundColor = \.black/);
  });
});

describe('PlayerSurface.native.tsx — no play() before the first frame, one timer', () => {
  const source = read('src', 'player', 'PlayerSurface.native.tsx');

  it('never imports expo-video\'s VideoView or its patched event', () => {
    expect(source).not.toMatch(/\bVideoView\b|onFirstFrameRender/);
    expect(source).toMatch(/from '\.\.\/\.\.\/modules\/dsp-picture'/);
  });

  it('calls player.play() in one place, only for a settled generation', () => {
    const plays = source.match(/player\.play\(\)/g) ?? [];
    expect(plays).toHaveLength(1);
    const at = source.indexOf('player.play()');
    const before = source.slice(Math.max(0, at - 400), at);
    // The guard's two clauses, not its exact line (the reducer tests hold the play/settle rule itself).
    expect(before).toMatch(/\bsettledGeneration\s*===\s*0\b/);
    expect(before).toMatch(/\bsettledGeneration\s*!==\s*sourceGeneration\b/);
  });

  it('has exactly one setTimeout — the ladder\'s, which starts a fetch', () => {
    expect(source.match(/setTimeout\(/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/setInterval\(/);
    const at = source.indexOf('setTimeout(');
    expect(source.slice(at, at + 200)).toMatch(/dispatch\(\{ type: 'retry-fired', g \}\)/);
  });

  it('the chain: muted, expect, replaceAsync, settle in the same continuation, then startPlayback', () => {
    const order = ['player.muted = mutedRef.current', 'picture.expect(generation, uri)', "traceEvent('replaceAsync start'", 'await player.replaceAsync(source)', "traceEvent('replaceAsync resolve'", "dispatch({ type: 'settle', g: generation })", 'started.startPlayback(generation, uri)'];
    let last = -1;
    for (const step of order) {
      const at = source.indexOf(step);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });
});
