# The native first frame — what is observed, and why

The tuning static on iOS ends when `modules/dsp-picture` says a frame of the
item the current tune asked for is on the screen. This page is the contract
between that Swift, `src/player/PlayerSurface.native.tsx`, the gate in
`src/player/firstFrameGate.ts`, and the rows a TUNE TRACE paste prints. It is
the implementation of `reviews/dsp-polish/02-design/ff-spec.md`; the numbers
in `§` headings are that document's.

Rulings kept: R1 (no backstop; a stream that never paints keeps its static),
R1a, R2 (timers decide, animations decorate — nothing here rides a timer at
all), R3, R5, R6, R7, R8, R31, decision 1 (auto-PiP never while tuning),
decision 4, decision 6(c)(d), decision 16, decision 17. The "Do not retry"
line: `isReadyForDisplay` and `timeControlStatus` are not the reveal signal,
alone or together; the reveal signal is a copied frame of the armed item on a
running, advancing clock, and they only answer "is that frame somewhere a
person can see it".

## 1. The carrier

- `modules/dsp-picture` — a local Expo module (autolinked from `./modules`;
  `expo-module.config.json` says `platforms: ["apple"]`, decision 5). Two
  views: `DSPPictureView` (the picture cell: an app-owned `AVPlayerLayer`, the
  witness, PiP, the `N` rows) and `DSPStaticView` (the snow, §9). It reads no
  expo-video symbol: the player arrives as a `SharedRef<AVPlayer>` prop —
  expo-video's `VideoPlayer` is one (`VideoPlayer.swift:7`) — resolved by
  expo-modules-core from the shared-object id JS passes
  (`DynamicSharedObjectType.swift:37-40`), the id expo-video's own view passes
  (`VideoView.tsx:105-109`).
- `patches/expo-video+3.0.16.patch` — one hunk in `VideoPlayer.swift`:
  `replaceAsync` resolves only after `replaceCurrentItem(with:)` ran on main
  (`withCheckedContinuation`). expo-video's `VideoView` is no longer rendered
  by DS,P on iOS; its hunk is gone.
- `PlayerSurface.native.tsx` renders `DSPPictureNativeView` on iOS and nothing
  where the module is not linked (Expo Go, a non-iOS build); `watch.tsx` shows
  its "requires a development build" seat in Expo Go.

Why the hunk must stay: the chain is `await expect(G) → await replaceAsync →
settle(G) → await startPlayback(G)`. With the continuation, `replaceAsync`
resolves after the `currentItem` KVO bound the item to G, so `startPlayback`
always finds a bound item and `expect(G+1)` can never precede that item's
KVO. Without it the attribution still holds (FIFO on the main queue orders the
swap before the next `expect`), but `startPlayback` can find nothing bound and
the trace shows `N item` **after** `replaceAsync resolve` in host time — that
order is the tell. `npx patch-package --error-on-fail` and
`src/player/__tests__/nativeCarrier.test.ts` hold the patch to its one hunk.

## 2. Notation

- **G** — the tune generation, allocated by JS synchronously with the user's
  intent (`invalidate()` from `tuneTo`, or the gate's `take` in the source
  effect / `rejoin` / a rebuild), unique per launch. One attempt = one
  generation = one `expect`.
- **I** — the `AVPlayerItem` delivered by the first **non-nil**
  `AVPlayer.currentItem` KVO after `expect(G, uri)`. Binding happens
  synchronously inside `replaceCurrentItem(with:)` on main; the patched
  continuation resumes only after that, so `N item` precedes
  `replaceAsync resolve` in host time. `id(I)` is a short hash of
  `ObjectIdentifier(I)`, printed `i=`.
- **O** — the `AVPlayerItemVideoOutput` added to I at bind (NV12), with a pull
  delegate; kept for I's life; removed only in `unbind` (the item edge,
  detach, deinit).
- **L** — the `AVPlayerLayer` our view owns (`PlayerLayerView.layerClass`),
  `L.player === player`.
- **sample** — one evaluation of the predicate, triggered by (a) the item's
  clock: `player.addPeriodicTimeObserver(forInterval: 1/30 s, queue: .main)`,
  installed at bind and removed at fire/unbind (`src=clock`); (b) a KVO
  delivery of `isReadyForDisplay`, `timeControlStatus`, `rate`,
  `isExternalPlaybackActive`, or the app/window/PiP edges (`src=kvo`);
  (c) `outputMediaDataWillChange` (`src=output`). Nothing here is wall-clock:
  the periodic observer fires only while the item's timebase advances (and
  once at start/stop/jump); the others are AVFoundation/UIKit edges.
- **bindSeq** — a counter incremented at bind; **rfdSeq** — its value at the
  last KVO delivery of `isReadyForDisplay == true`.

## 3. The predicate (§3.2)

`FIRE(G)` is emitted at the first sample at which all of the following hold,
at most once per (G, I):

```
C1  IDENTITY     player.currentItem === I  ∧  gen(I) == G  ∧  G > 0
C4  RUNNING      player.timeControlStatus == .playing  ∧  player.rate > 0
                 ∧  CMTimebaseGetRate(I.timebase) > 0
C5  ADVANCING    prevTime.isValid ∧ I.currentTime() > prevTime
                 (prevTime = the previous sample's currentTime, recorded only
                  when C4 held at that sample; reset at bind, on
                  AVPlayerItemTimeJumped, and whenever C4 is observed false)
C6  FRAME        latched: at some sample since bind,
                 τ = O.itemTime(forHostTime: CACurrentMediaTime()) was valid
                 ∧ O.hasNewPixelBuffer(forItemTime: τ)
                 ∧ O.copyPixelBuffer(forItemTime: τ, …) ≠ nil
C3  ON THE LAYER L.isReadyForDisplay == true  (read now)
                 ∧ ( rfdSeq > bindSeq                       — "rfdKvo": a true DELIVERED after the swap
                   ∨ (lastDisplay > prevDisplay,
                      both copied under C4)                 — "advanced": the renderer is consuming
                                                              this item's frames for advancing times )
C7  ON SCREEN    pipActive
                 ∨ ( view.window ≠ nil ∧ !L.bounds.isEmpty ∧ noHiddenAncestor(view)
                     ∧ UIApplication.applicationState ≠ .background )
C8  ONCE         !fired(G, I)

FIRE(G)  ⇔  C1 ∧ C8 ∧ ( isExternalPlaybackActive ? (C4 ∧ C5)             — via=external
                                                   : (C4 ∧ C5 ∧ C6 ∧ C3 ∧ C7) )
```

Nothing in the predicate is a duration or a count; `poll=` is printed, never
compared. `DSPPictureView.swift` `sample(src:)` is the one place it is
evaluated.

### Why each conjunct is there (§3.3)

| Conjunct | What it excludes | The build that showed the lie |
|---|---|---|
| **C1** identity + generation | A frame, a flag or a status of the previous item, or of a superseded attempt, testifying for this tune; a URI comparison that can silently mismatch (FF-08). | Build 14 (`isReadyForDisplay` re-fired for the old item). |
| **C4** running timebase | Every witness satisfied during a preroll hold: while `.waitingToPlayAtSpecifiedRate/.toMinimizeStalls` the item can be `.readyToPlay`, the layer can read ready, the output can hold a buffer — and the timebase is 0. `rate > 0` alone lies; `.playing` alone can be delivered a tick before the timebase moves; `CMTimebaseGetRate` is what AVPlayer sets to 0 while waiting. | Builds 13–16, build 19 (fire 93 ms into the hold). |
| **C5** clock advancing | Rate 1 with a stopped clock (`playImmediately` on an empty buffer "behaves as if it has encountered a stall"); a position **jump** mistaken for consumption — hence the resets and the requirement that both samples come from a running clock. | New with this design. |
| **C6** a buffer actually copied | A1's lie (`hasNewPixelBuffer` true, `copyPixelBuffer` nil) and any state where no decoded picture for this item exists. Latched, so a buffer that existed once cannot hold the static later; a miss becomes `N miss`. | Build 19 (`copyPixelBuffer` never called). |
| **C3** readiness of *our* layer, bound to this item | Decoded-but-not-presented frames (A0): the layer "doesn't present any content until the value becomes true" — necessary, never sufficient, so it sits beside C6, never alone. The delivered-after-bind rule discards a `true` carried across the swap; the `advanced` fallback exists because Apple does not document a reset on item change — printed `rfdSrc=advanced` so the row says which. | Builds 14–16, build 19. |
| **C7** on screen | A frame in a backgrounded app with no PiP, in a zero-sized, hidden or unmounted layer. An active PiP hosts **this** layer, so it counts as a screen. | A hole, not a lie. |
| **external** | AirPlay: the local layer is not the display; `isExternalPlaybackActive` is Apple's own statement. | A hole both API reviews opened. |
| **no elapsed time** | A backstop that out-races the frame. | Build 13 (removed in `ca76a7b`, R1). |

Deliberately **not** in the predicate: `AVPlayerItem.status == .readyToPlay`
(implied by C4; printed as `itemStatus=`), `isPlaybackLikelyToKeepUp`,
`isPlaybackBufferEmpty`, expo's `statusChange readyToPlay` (which *is*
`likelyToKeepUp`), `playingChange`, `timeUpdate`, `videoRect`: rows only.

### Removing the hold (§3.5)

- `automaticallyWaitsToMinimizeStalling` stays `true` (expo's default).
- **Rate 0 across every swap:** `expect(G, uri)` calls `player.pause()`
  before recording the expectation. JS never calls `play()` before the first
  frame: the surface's `playing` effect honours only a `playing` false→true on
  a settled generation, and the old `readyToPlay → play()` is gone.
  Acceptance: no `statusChange idle` between `replaceAsync resolve` and the
  first post-swap `N tcs`, on **every** origin (FF-02).
- **Starting the item:** after `replaceAsync` resolves and JS has settled G,
  it calls `startPlayback(G, uri)`; native marks the bound item `started` and
  issues `playImmediately(atRate: 1)`, re-issued from the item's `status`
  (→ `.readyToPlay`) and `loadedTimeRanges` KVOs while `!everPlaying` — data
  arriving is the trigger, never time. It stops for good at the first
  `.playing`; later stalls are AVPlayer's (`waits=true` auto-resumes); a user
  pause (decision 17) is never overridden because nothing re-issues after
  `everPlaying`.
- **Outside starters** (Now Playing `play`): the `rate` KVO marks the item
  `started` on any `rate > 0`, so the data nudge applies to them too.
- **Live offset (decision 6(d)):** `configuredTimeOffsetFromLive = 8 s`,
  `automaticallyPreservesTimeOffsetFromLive = false`, written inside the
  synchronous `currentItem` KVO and **measured**: `N config configured=
  recommended= seekable=` follows, and the first `N loaded` prints `cur=`. If
  the recommendation wins, the rows say so; the rollback is one constant
  (`LIVE_OFFSET_SECONDS` in `PlayerSurface.native.tsx`).

### Attempts that end without a frame (§3.6, FF-14)

| Fact | Native | JS (the gate) |
|---|---|---|
| The load was cancelled by the constructor's nil-replace and `replaceAsync` resolved with no item | `startPlayback(G)` finds nothing bound → `"unbound"`, row `N start refused reason=unbound` | a failure at index 0 of the ladder: `retry scheduled in=0ms` → `attempt #2 reason=no-item` |
| The nil-replace landed **after** I's edge and unbound a started, unfired item | `onCurrentItemChanged(nil)` → `unbind(itemNil)` → `onItemLost({g, i})`, row `N lost` | `item lost i=` → the ladder, `reason=item-lost` |
| I failed (`status == .failed`) | `N itemStatus …→failed err=`, `onItemFailed({g, i, err})` — independent of expo's status machine | `playerError` → the ladder |
| `expect` rejected (the view was not registered after three retries) | the item binds `generation=-1 uriMatch=yes`; `startPlayback(G, uri)` adopts it (`N adopt g=`) | row `expect failed`, chain continues |
| The patch is not applied | `N item` **after** `replaceAsync resolve` in host time on every tune | `patch-package --error-on-fail`; the bench shows the order |

## 4. The JS contract (§6)

`PlayerSurface.native.tsx` owns the I/O; `firstFrameGate.ts` owns every
decision (`src/player/__tests__/firstFrameGate.test.ts` replays them).

- **Generations move with intent.** `tuneTo` calls `playerRef.current?.
  invalidate()` before its first `setState`: `++nextGeneration` becomes the
  current generation, every per-generation latch resets, a pending retry is
  cancelled, and the source effect (or `rejoin`) takes that number instead of
  allocating another. A native event carrying an older `g` is stale from that
  instant, whatever React's effect schedule does. `nextGeneration` is
  module-global: unique per launch, never per mount. `invalidate` also binds
  the new number to the tune record `tuneTo` opened the instant before
  (`bind-generation` precedes the `gen invalidated` row), so that row, the
  `rejoin` row and any listener row stamped in the invalidate→take window
  file under the new tune; the take's bind of the same number is idempotent.
- **The chain** (`replaceForGeneration`): `muted = …` (R5) → `expect(g, uri)`
  (a rejection is a row, not an error) → `replaceAsync` → `settle(g)` in the
  same continuation (no window) → `showNowPlayingNotification = true` →
  `startPlayback(g, uri)` → `start-result`. Every `await` is followed by the
  generation re-check.
- **Latch-and-replay (FF-03).** `onFirstFrame(g)` with `g === current ∧
  settled === g` → report; with `g === current ∧ settled ≠ g` → latched
  (`firstFrame … accepted=latched`); the settle replays it (`firstFrame
  replay`); any other `g` is dropped (`accepted=stale`). `invalidate`, the
  source effect, `rejoin` and a rebuild clear the latch. Errors use the same
  shape (`playerError latched (settle pending)` / `error replay`).
- **What clears the static:** exactly one writer of `sourceReady=true`
  (`watch.tsx` `handleFirstFrame(g)`), reachable only from
  `PlayerSurface.onFirstFrame(g)`, reachable only from the gate's
  `first-frame` action, emitted only for the module's `onFirstFrame` of the
  settled current generation (or its replay). `tuning` clears only when
  `sourceReady && watchRevealDone`. Errors, `readyToPlay`, `playingChange`,
  `timeUpdate`, rebuilds, rotation, PiP and app state never touch it.
- **The ladder.** A failure (expo `statusChange error`, a chain rejection,
  `onItemFailed`, `onItemLost`, `startPlayback → unbound|stale`) schedules a
  rebuild after `RETRY_DELAYS_MS[failures-1]` = `[0, 2000, 4000, 8000, 15000,
  30000]` ms (the last repeats); each attempt is a new generation with its
  own `expect`, item, sampler and rows (`attempt #n reason=`); after the
  third consecutive failure the plate reads "THE SIGNAL WILL NOT JOIN"
  (`onError` with kind `recovery-exhausted`, which `watch.tsx` does not treat
  as an ending) while attempts continue; buffer health (`readyToPlay`,
  `playingChange true`, an advancing `timeUpdate`) resets `failures`. The
  retry timer is the surface's only timer: it starts a fetch and ends nothing
  (R1). The static ends only when the rebuilt generation's item fires the
  predicate; the user's X is the escape.
- **`rejoin(reason)`** is a rebuild with a row: a same-channel arrival on a
  channel in error (`tuneTo` → `invalidate()` → `rejoin('retune')`, decision
  16); a healthy tune in progress is never restarted. `watch.tsx`'s
  power-on is `tuneTo(safeIndex, 'power')` — a traced tune through the static,
  never flashed (decision 4). `beginTransition` settles a pre-empted reveal
  (`watchRevealDone = true`, WS-22).
- **PiP, AirPlay, background, rotation** (§6.4): auto-PiP is
  `automaticPictureInPicture={playing && viewAttached && !tuning}`; a manual
  PICTURE OUT while tuning is refused with the row `pip request refused while
  tuning`; a tune while PiP is active proceeds and fires with `pip=true`;
  background mid-tune without PiP holds on `why=…A` until `N app active`;
  AirPlay fires `via=external`; rotation is `N bounds`/`N vr` only — no
  re-arm path exists (`setPlayer` is identity-guarded, FF-13).

## 5. The rows (§7)

Native envelope (every `onTrace` payload): `{ t, g, i, name, detail }` —
`t` = `CACurrentMediaTime()*1000` (host ms; orders rows natively regardless of
JS arrival), `g` = the bound item's generation (or the pending expectation's,
or −1: printed only when positive), `i` = the item's short id (omitted when
`-`). The card prints `+<JS offset>ms <name> <detail> [g=<g>] [i=<i>] (n+<t − nativeT0>)`.

| Row | When | `detail` |
|---|---|---|
| `N view init` | view created | — |
| `N attach` | `setPlayer` (identity-guarded) | `tcs= rate= waits= item=nil\|set ext=` |
| `N detach` | player unset/replaced/deinit | `<reason>` |
| `N expect` | JS `expect(g, uri)` | `g= uri= rate=<after pause> current=<item\|none>` |
| `N item` | non-nil `currentItem` KVO | `id= status=unknown\|ready\|failed uriMatch=yes\|no\|no-expectation g= rfd0= rate= tcs= prev=` |
| `N item nil` | nil `currentItem` KVO | `rate= tcs= prev= pending=<g\|0>` |
| `N config` | after the live-offset write, same KVO | `configured= recommended= preserve=no fwd= waits= seekable=[a,b]` |
| `N unbind` | item edge / detach / deinit | `reason=itemChange\|itemNil\|unset\|replace\|deinit fired= polls=` |
| `N lost` | a started, unfired item unbound by a nil edge | `g=` (+ event `onItemLost`) |
| `N itemStatus` | item `status` KVO | `<old>→<new> [err=<domain>/<code> <desc>]` (+ event `onItemFailed` on `failed`) |
| `N tcs` | `timeControlStatus` KVO | `paused\|waiting\|playing reason= rate= tb= tbEff=` |
| `N rate` | `rate` KVO | `<r>` |
| `N start` | `startPlayback` / outside play | `ok\|adopted g= tcs= rate=` · `refused reason=unbound\|stale\|noPlayer` · `adopted reason=external rate=` |
| `N adopt` | unbound item adopted at `startPlayback` | `g=` |
| `N nudge` | every `playImmediately` | `n= reason=start\|ready\|data\|external empty= loaded=[a,b] tcs= wait=` |
| `N loaded` | `loadedTimeRanges` KVO, ≤3 before fire + ≤3 after | `loaded=[a,b][+k] cur= empty= keepUp= tcs=` |
| `N bufferEmpty` / `N keepUp` | item KVOs | `<b>` |
| `N rfd` | layer `isReadyForDisplay` KVO (both directions; may lag a sample by ≤1 hop) | `<true\|false> seq= afterBind=yes\|no` |
| `N vr` | layer `videoRect` change | `WxH` |
| `N output` | pull delegate | `willChange itemTime= tcs=` (≤3) · `flushed` |
| `N hold` | a sample where the predicate did not hold; once per distinct reason set, ≤12 per item | `why=<R T F D E W B A H> src= poll= itemTime= has= copy=ok\|latched\|nil display= prevDisplay= cur= prev= tb= tbEff= rate= itemStatus= tcs= reason= rfd= rfdSrc= vr= loaded= empty= keepUp= app= pip= ext= window=` — R timebase not running · T clock not advancing · F no copied frame · D layer not ready · E readiness not bound to this item · W no window · B empty bounds · A app in background · H hidden ancestor |
| `N miss` | `hasNewPixelBuffer` true, `copyPixelBuffer` nil (A1), ≤3 per item | `src= poll= itemTime= has=true copy=nil tcs= tb= rfd=` |
| **`N fire`** | the predicate holds; once per item | `via=rfdKvo\|advanced\|external nudges=` + the full `N hold` state |
| `N stalled` / `N jump` | item notifications | `cur= loaded=[…] tcs=` / `to=` |
| `N errorLog` (≤5) / `N accessLog` (≤2) / `N failedToEnd` | item notifications | `status= domain= uri= <comment>` / `startup= uri= bitrate= stalls=` / `<desc>` — decides H-M/NP-14 |
| `N bounds` / `N window` | layout / window | `WxH` / `set\|nil` |
| `N app` | lifecycle | `background pip=<b>` · `foreground` · `active` |
| `N ext` | `isExternalPlaybackActive` change | `<b>` |
| `N pip` | PiP | `possible=<b>` · `auto=<b>` · `start` · `stop` · `start refused possible= active=` · `failed <desc>` |
| `N audio` | AVAudioSession | `interrupt began\|ended shouldResume=<b>` · `route reason=<n>` |
| `S live` / `S boil` | static: `animationDidStart` / two differing presentation samples | `n=<install #>` |

JS rows (all stamped `g=` except the header and the static rows): `TUNE START`
· `gen invalidated g=` · `gen bound g=` · `attempt #n reason=` · `rejoin
<reason>` · `expect failed <msg>` · `replaceAsync start <uri>` · `replaceAsync
resolve <uri>` · `replaceAsync reject <msg>` · `startPlayback
ok|adopted|unbound|stale|no picture view` · `startPlayback failed <msg>` ·
`firstFrame i= via= accepted=yes|latched|stale` · `firstFrame replay` ·
`sourceReady set` · `tuning cleared` · `static mount` · `static unmount` ·
`statusChange <s>` · `playingChange <b>` · `first timeUpdate <t>s
requested=<uri>` · `playerError <kind>: <msg> failures=n` (or `latched…` /
`stale…`) · `error replay` · `retry scheduled in=<ms>` · `item lost i=` · `pip
start|stop|request refused while tuning` · `link → channel N`.

## 6. Reading a paste — the checks (§10)

1. **No lie.** Every `N fire` prints `tcs=playing rate=1 tb=1.0` (tb > 0),
   `cur > prev`, and — unless `ext=true` — `copy=ok|latched`, `rfd=true`,
   `rfdSrc=rfdKvo|advanced`, `window=true`, and `app=active` or `pip=true`.
   `sourceReady set` follows within a few ms; `static unmount` follows
   `tuning cleared`.
2. **No hold.** No `statusChange idle` between `replaceAsync resolve` and the
   first post-swap `N tcs` on any origin; `N expect … rate=0` on every tune.
3. **Latency.** Hot: `N fire` within ~200 ms of `TUNE START`; cold
   unthrottled: within ~1.3 s if `N config` shows the 8 s offset honoured;
   otherwise the fire follows the first `N tcs playing`, and the `N loaded` /
   `N nudge` / `N tcs waiting` run before it is the decision 6(d) evidence.
4. **Attribution.** Old-item rows print under the previous `g`; `gen
   invalidated g=` precedes `gen bound g=` with the same number on every tune
   from a mounted surface, both under the new tune (the header's `dropped=`
   line stays absent — H-L); a fire arriving between them prints
   `accepted=stale` under the old tune.
5. **One fire.** At most one `N fire` per `N item`; at most one `sourceReady
   set` per generation; `accepted=latched` is always followed by `firstFrame
   replay`.
6. **Rotation.** Mid-static: `N bounds`, `S live n=2`, `S boil n=2` and
   nothing else native; on a playing channel: `N bounds`/`N vr` only.
7. **Static liveness.** `static mount` → `S live` → `S boil` on every tune;
   the H-J signature is `static mount` with no `S boil`.
8. **PiP.** Tune while PiP active: `N fire … pip=true`; background mid-tune
   without PiP: `N hold why=A …` then `N app active` → `N fire`; PICTURE OUT
   while tuning: `pip request refused while tuning` and no `N pip start`.
9. **Patch.** `N item` precedes `replaceAsync resolve` in host time on every
   tune; `startPlayback ok` on every attempt; `unbound` is followed by
   `attempt #2 reason=no-item` at +0 ms.
10. **Console power-on.** A full tune with `origin=power opening=yes`, static
    shown, no flash.
11. **Same-channel re-tune in error.** `TUNE START` → `gen invalidated` →
    `rejoin retune` → `attempt #n reason=rejoin:retune` → `N expect` → … →
    `N fire` → `tuning cleared`.
12. **Ladder.** After the session dies mid-picture: `N errorLog` /
    `N itemStatus ready→failed` → `playerError … failures=1` → `retry
    scheduled in=0ms` → `attempt #2` → picture back; on a third consecutive
    failure the plate reads "THE SIGNAL WILL NOT JOIN" while `retry scheduled
    in=4000ms` continues.

## 7. What could still go wrong, and the row that reveals it (§11.1)

| Failure | Row | Rollback that keeps R1 |
|---|---|---|
| `isReadyForDisplay` never true on our layer while the picture plays | `N hold why=D … copy=ok tb=1.0 cur>prev` repeated, `N vr` non-empty | none honest; the row names the fault |
| `copyPixelBuffer` never returns a buffer on this pipeline | `N miss … has=true copy=nil` ×3, or `N hold why=F … tcs=playing rfd=true` | demote C6 to a row (one line) |
| AVPlayer will not start a 1-segment live playlist under `playImmediately` | `N loaded [0.021,5.026]` → `N nudge n=2 reason=data` → `N tcs waiting reason=toMinimizeStalls` persisting → `N tcs playing` at ≈+15 s | server `work_ahead_limit=3` (decision 6(b), the owner's write) |
| `configuredTimeOffsetFromLive` ignored or harmful | `N config recommended=` ≠ configured; `N jump` / `ready→failed` right after `N config` | delete one constant |
| `isReadyForDisplay` stays `true` across a swipe-tune swap and is never re-delivered | `N item … rfd0=true` with no `N rfd false` before `N fire … rfdSrc=advanced` | none needed; if `advanced` also never holds, `N hold why=E` says so |
| The session dies under the picture (NP-14) | `N errorLog`, `N itemStatus ready→failed`, `playerError`, `retry scheduled`; if `N loaded` simply stops growing with no error row, that absence is the finding | the ladder |
| `SharedRef<AVPlayer>` prop cast fails at runtime | dev: red box `CastingException`; release: no `N attach` after `TUNE START` | Plan B (ff-spec §2.3): host the layer inside expo-video's `VideoView` by patch |
| Autolinking misses `modules/dsp-picture` | `requireNativeViewManager` is wrapped: the surface renders nothing, no `N view init`, header `witness=absent` | `npx expo-modules-autolinking search \| grep dsp-picture` |
| The static's animation refuses to start | `static mount` without `S live`; the field is black, never grey | `install(force:)` on `didMoveToWindow` already retries |

None of these can end the static early: every rollback removes a conjunct
from a conjunction whose remaining terms are still observations.

## 8. Self-review without Xcode (§4.6)

The Swift is compiled first on EAS. Read against expo-modules-core 3.0.29 and
expo-video 3.0.16 in `node_modules`, and Apple's documentation:
`AVPlayerItem.timebase` is `CMTimebase?` (guarded by `map`);
`AVPlayerItemOutputPullDelegate`'s two methods are optional and declared
`public`; `addPeriodicTimeObserver` returns `Any`, removed on the same player;
`AVPlayer.WaitingReason` is a struct (`default:` prints `rawValue`);
`change.newValue` for `\.isReadyForDisplay` is `Bool?`; the CV pixel-format
key is `CFString` → `as String`; `UIApplication.shared` is read on main only
(`onMain`); every observation is invalidated in `unbind`/`detachPlayer`;
`deinit` calls `detachPlayer`; the boil link's target is a proxy; every
`EventDispatcher` property is named exactly as its `Events(...)` string
(`nativeCarrier.test.ts` holds this); `Prop("player")` typed
`SharedRef<AVPlayer>?` is legal (`AnySharedObject: AnyArgument`,
`Optional: AnyArgument where Wrapped: AnyArgument`);
`canStartPictureInPictureAutomaticallyFromInline` is iOS 14.2+ under a 15.1
target. Nothing in the module reads an `internal` expo symbol.

## 9. The static (H-J)

`DSPStaticView`: one `CALayer` whose `contentsRect` is a discrete
`CAKeyframeAnimation` over a runtime noise tile (600 keyframes, a 10 s loop,
nearest-neighbour magnification, the Skia field's luma band 36…217). Once
committed, the render server evaluates it every refresh; the app's threads can
both be blocked and the snow keeps boiling — no per-frame code path, no
shader, no growing uniform. Backgrounding removes in-flight animations;
`didBecomeActive` reinstalls. `animationDidStart` emits `S live n=k`; two
consecutive presentation-layer samples of `contentsRect` that differ emit
`S boil n=k`. Rotation reinstalls with the new grain rects (`n=2`). The base
colour is the seat's `#000` (FF-16): if the snow ever fails, the failure reads
as "the set is on, no picture, the plate says A MOMENT, PLEASE" — never a
grey nobody can place. `@shopify/react-native-skia` no longer draws the
native static.
