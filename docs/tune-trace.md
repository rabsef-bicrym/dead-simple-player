# Reading a TUNE TRACE paste

The service panel's bench shows the last five tunes (R28); COPY copies exactly
those five, serialised by `src/services/tuneTrace.ts`. The ring behind it keeps
twenty and survives a relaunch (`@ipswitch/tune-trace`). Diagnostics, not
telemetry — nothing leaves the device. This page is the reading protocol
00-MAP §5 fact 8 described for build 19, brought up to what build 20 prints;
the module header says how rows are routed, and `docs/native-witness.md` says
what the native rows mean and what a paste must show.

## Shape

```
-- dropped: N rows carried a tag no tune knows --    once, above the tunes, only when N > 0

TUNE <channel> @ <ISO start> origin=<o> opening=<yes|no> build=<v (n)> witness=<w> gens=[…]
  +<ms> <name> [<detail>] [late] [g=<gen>] [i=<item>] [(n+<ms>)]
  -- +N rows not kept --                             the events bucket was full (cap 200)
  -- closed: <reason> @ +<ms> --                     first-frame | error-surfaced | superseded | left
  +<ms> …                                            `after`: rows that arrived after the close (cap 60)
  -- +N rows not kept --
```

Header fields (each printed only when known):

- `origin=` — `register`, `swipe`, `board`, `remote`, `gate`, `link`, `power`
  (the console's turn-on is a tune through the static and is traced like one,
  decision 4), or `untraced` (the synthetic tune, below).
- `opening=yes` — the tune raised the picture from Home or from off.
- `build=` — `expoConfig.version (CFBundleVersion)`; the web prints the version
  alone.
- `witness=` — whether `modules/dsp-picture` is in this build: `present` (its
  first `N item` row of the tune arrived — the native witness is what ends the
  static), `absent` (iOS, the module is not linked: the surface renders
  nothing, the static shows its black seat, and no frame can ever be
  witnessed).
- `gens=[…]` — the surface generations bound to this tune, in binding order;
  every attempt (the source effect, a retry, a rejoin) is one.

Row suffixes:

- `late` — the row belongs to a tune that was no longer the newest when it
  arrived (routed there by its tune id or generation, never by arrival order).
- `g=<gen>` — on a native row (`N …`), the generation of the item the row is
  about (or of the pending expectation): item identity, not arrival. On a JS
  row that owns a generation (`gen bound`, `attempt`, `replaceAsync
  start/resolve/reject`, `startPlayback`, `firstFrame`, `playerError`, `retry
  scheduled`, `sourceReady set`) the generation it describes. On expo's
  listener rows (`statusChange`, `playingChange`, `first timeUpdate`) the
  generation current at arrival, because expo's payloads name no item — the
  adjacent `N` rows disambiguate. A native row before any expectation prints
  no `g=`.
- `i=<item>` — the native item id (`N` rows and `firstFrame`); a swipe-tune's
  old item keeps printing under its own `i=` and `g=`.
- `(n+<ms>)` — a native row's host clock (`CACurrentMediaTime`), relative to
  the earliest host time among the tune's native rows, `after` included. It
  orders native rows regardless of JS arrival: `N item` must precede
  `replaceAsync resolve` by it on every tune (the patch's tell).

## Rows per native tune, as build 20 prints them

JS rows (`src/player/PlayerSurface.native.tsx`, `src/player/firstFrameGate.ts`,
`app/watch.tsx`, `TuningStatic.native.tsx`):

| row | detail | meaning |
| --- | --- | --- |
| `TUNE START` | `<channel>` | `watch.tsx` opened the tune |
| `gen invalidated` | `g=` | `tuneTo` allocated the generation before its first setState; every older native fact is stale from here |
| `gen bound` | `g=` | the source effect took that generation and started the chain |
| `attempt` | `#n reason=retry\|no-item\|item-lost\|rejoin:<why>` | a rebuild under a new generation |
| `rejoin` | `<reason>` | `watch.tsx` asked for a fresh attempt (a same-channel re-tune of a failing channel: `retune`) |
| `expect failed` | `<msg>` | the native `expect` rejected (plumbing); the item binds unexpected and `startPlayback` adopts it |
| `replaceAsync start` / `resolve` / `reject` | `<uri>` / `<uri>` / `<msg>` | the chain; resolve means the item is current (the one patch hunk) |
| `startPlayback` | `ok\|adopted\|unbound\|stale\|no picture view` | what native said when asked to start the item |
| `statusChange` | `<status>`, or `<status>: <error message>` | expo's status machine; `readyToPlay` is buffer health, never a start |
| `playingChange` | `true` / `false` | expo; the `false` right after `N expect` is the pause across the swap |
| `first timeUpdate` | `<t>s requested=<uri>` | expo; the URI is the requested prop, not the ticking item |
| `firstFrame` | `i=<item> via=rfdKvo\|advanced\|external accepted=yes\|latched\|stale` | the module's fire, judged against the current generation |
| `firstFrame replay` | — | a fire latched before settle, delivered by the settle (FF-03) |
| `sourceReady set` | — (`g=` names the generation) | `watch.tsx`: the ONLY end of the static |
| `tuning cleared` | — | `watch.tsx`: the decision; the static's unmount is the next commit |
| `static mount` / `static unmount` | — | `TuningStatic`'s effect: the real mount and unmount |
| `S live` / `S boil` | `n=<install #>` | the static's animation started / the render server is advancing it |
| `playerError` | `<kind>: <msg> failures=n` · `latched (settle pending): <msg>` · `stale g=<g>: <msg>` · `held while paused: <msg>` | a failure on the ladder, latched, dropped, or held because the set is paused (decision 17) |
| `error replay` | — | a failure latched before settle, delivered by the settle |
| `retry scheduled` | `in=<ms>` | the ladder armed a rebuild (a fetch; never a reveal) |
| `retry cancelled` | `paused` | a rung armed for this generation was dropped by a pause; the resume rejoins |
| `healthy` | `failures reset from n` | five seconds of sustained progress replenished the ladder |
| `item lost` | `i=` | native unbound a started, unfired item (FF-14) |
| `paused` | `cause=user\|interruption` · `cause=interruption (re-attributed)` | AVPlayer's own `.paused` on the settled generation, unrequested by the app; an interruption within 2 s names the cause |
| `paused` | `cause=failure (failed <ms> before the edge)` · `cause=failure (re-attributed, failed <ms> after the edge)` | not a pause: the failed item's own `.paused`, read in either KVO order; the ladder runs (`docs/pipeline-policy.md` §2) |
| `resume` | `reason=<r> cause=<c> elapsed=<ms> failed=<b> → play\|seek-live-then-play\|rejoin\|stay-paused` | a resume edge judged by the tiers (`docs/pipeline-policy.md` §3); `rejoin` is followed by `attempt #n reason=rejoin:resume:<r>` |
| `pip` | `start\|stop\|request refused while tuning` | PiP edges; decision 1; a `stop` is a resume edge for a set an interruption paused in the window (a person's pause there stays paused) |
| `pip` | `request ignored: active` | `watch.tsx`: PICTURE OUT while PiP is already up |
| `error surfaced` | `<kind>: <message>` | `watch.tsx`, named by tune id; an error the surface marked `terminal: false` (the ladder's third-failure relabel, the web's `recovery-exhausted`) is not an ending |
| `link → channel N` | — | `watch.tsx`, after `tuneTo`, under the tune the link caused |
| `UNTRACED START` | — | the synthetic tune opened for a row that had no tune of this launch |

Native rows (`N …`, from `modules/dsp-picture/ios/DSPPictureView.swift`) are
listed with their fields in `docs/native-witness.md` §5. The ones a reading
turns on: `N expect` (rate 0 across the swap), `N item` (the item bound to a
generation, before `replaceAsync resolve`), `N config` (the live-offset
request, measured), `N start` / `N nudge` (the one owner of playback start),
`N tcs` (`tb=` is the timebase; `paused` is the pause edge, `waiting` a
stall), `N rfd` (our layer's readiness, and whether it was delivered after
the bind), `N hold` (why the predicate did not hold, by letter), `N fire`
(the predicate held, every conjunct printed), `N unbind` (one per `N item`),
`N errorLog` / `N itemStatus ready→failed` (the session died), `N audio
interrupt began|ended shouldResume=` and `N remote play|pause` (what paused
the set and what asked it to play again).

## Reading protocol

- A genuine first frame is one `N fire` whose row prints `tcs=playing`,
  `tb>0`, `cur>prev`, `copy=ok|latched`, `rfd=true`, `rfdSrc=rfdKvo|advanced`,
  `window=true` and `app=active` (or `pip=true`); then `firstFrame …
  accepted=yes`, `sourceReady set`, `-- closed: first-frame --`, and `tuning
  cleared` then `static unmount` in the `after` bucket. If a fire ever again
  shows no picture, the `N fire` row says which conjunct was false — it
  cannot be all of them.
- `firstFrame … accepted=latched` followed by `firstFrame replay` is the
  legal FF-03 inversion (the fire beat the promise); `accepted=stale` is an
  old item's fire correctly dropped, printed under the generation it carried.
- No `statusChange idle` between `replaceAsync resolve` and the first
  post-swap `N tcs`, on any origin: rate was 0 across the swap. If one
  appears, something called `play()` before the swap.
- `N item` before `replaceAsync resolve` by host time on every tune: the
  patch is applied. `N item` after it is the tell.
- `statusChange readyToPlay` *after* the picture is the expected cold order,
  not a red flag: it is expo's keep-up heuristic.
- `static mount` → `S live` → `S boil` on every tune. `static mount` with no
  `S boil` is the H-J signature (the snow is not being drawn); the field is
  black, never grey.
- A rotation on a playing channel prints `N bounds` / `N vr` and nothing
  else native — no second `N item`, no second `firstFrame`.
- `playerError … failures=n` → `retry scheduled in=<ms>` → `attempt #n+1`:
  the ladder `[0, 2, 4, 8, 15, 30] s`; on the third failure `error surfaced
  recovery-exhausted: …` relabels the plate while the attempts continue;
  `healthy failures reset from n` after five seconds of progress is what
  lets the next failure start at the bottom again.
- A lock-screen pause reads `N tcs paused` → `paused cause=user`; if the
  session dies under it, `N itemStatus ready→failed` → `playerError held
  while paused: …` and nothing else — no `retry scheduled`, no `play`. The
  press that brings it back is `N remote play` → `resume reason=remote-play
  … failed=true → rejoin` → `attempt #n reason=rejoin:resume:remote-play` →
  the chain → `N fire`. A `resume … → stay-paused` on `reason=foreground`,
  `interruption-ended` or `pip-stop` with `cause=user` is decision 17 doing
  its job, not a stuck set.
- `-- closed: left --` without `sourceReady set` is leaving mid-static;
  `-- closed: superseded --` means the next tune started first, and the rows
  that still belonged to this one sit under its `after`, marked `late`.
- `-- +N rows not kept --` is a full bucket, not a gap in the surface.
- The `dropped` line counts rows whose tag named a tune the ring had evicted,
  or a generation of a previous launch (generations restart at 1 each launch);
  they are counted, never misfiled under the newest tune.
- A tune that was open when the app went away is revived `-- closed: left --`
  at its last row's offset.
