# Reading a TUNE TRACE paste

The service panel's bench shows the last five tunes (R28); COPY copies exactly
those five, serialised by `src/services/tuneTrace.ts`. The ring behind it keeps
twenty and survives a relaunch (`@ipswitch/tune-trace`). Diagnostics, not
telemetry — nothing leaves the device. This page is the reading protocol
00-MAP §5 fact 8 described for build 19, brought up to what build 20 prints;
the module header says how rows are routed.

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
  (the console's turn-on is a tune and is traced like one), or `untraced` (the
  synthetic tune, below).
- `opening=yes` — the tune raised the picture from Home or from off.
- `build=` — `expoConfig.version (CFBundleVersion)`; the web prints the version
  alone. Builds are told apart here, beside `witness=` (FF-06).
- `witness=` — what the native surface's first `onFirstFrameRender` of the tune
  carried: `present` (a `sourceUri` payload — the expo-video patch is in this
  build), `absent` (iOS, no payload — the patch is missing), `n/a` (Android,
  where the frame carries no payload by construction).
- `gens=[…]` — the surface generations bound to this tune, in binding order.

Row suffixes:

- `late` — the row belongs to a tune that was no longer the newest when it
  arrived (routed there by its tune id or generation, never by arrival order).
- `g=<gen>` — the surface generation current when the row was written.
  `replaceAsync start/resolve` and the retry's `playerError` carry the
  generation of the item they describe; `statusChange`, `playingChange`,
  `first timeUpdate` and `onFirstFrameRender` carry the generation at arrival,
  because the shared player's payloads name no item (WP-03's `i=` will).
- `i=<item>` — a native item id, when the row names one.
- `(n+<ms>)` — a native row's host clock, relative to the earliest host time
  among the tune's native rows, `after` included.

## Rows per native tune, as build 20 prints them

| row | detail | written by |
| --- | --- | --- |
| `TUNE START` | `<channel>` | `watch.tsx` |
| `replaceAsync start` / `replaceAsync resolve` | `<requested uri>` | surface, `g=` of the item |
| `statusChange` | `<status>`, or `<status>: <error message>` | surface, `g=` at arrival |
| `playingChange` | `true` / `false` | surface, `g=` at arrival |
| `first timeUpdate` | `<t>s requested=<uri>` — build 19 printed `<t>s · <uri>`; the URI is the requested prop, not the ticking item's identity | surface, `g=` at arrival |
| `onFirstFrameRender` | `sourceUri=<uri or absent> · matched=<yes/no>` | surface, `g=` at arrival |
| `playerError` | `<kind>: <message>` | surface |
| `sourceReady set` | — | `watch.tsx`, named by tune id |
| `tuning cleared` | — ; build 19 printed `static unmount tuning cleared`. The row is the decision; the static's unmount is the next commit | `watch.tsx`, named by tune id |
| `error surfaced` | `<kind>: <message>` | `watch.tsx`, named by tune id |
| `link → channel N` | — | `watch.tsx`, after `tuneTo`, under the tune the link caused (or the one already playing) |
| `UNTRACED START` | — | the synthetic tune opened for a row that had no tune of this launch |

## Reading protocol

- A genuine first frame is a **single** `onFirstFrameRender … matched=yes`,
  then `sourceReady set`, then `-- closed: first-frame --`; `playingChange
  true` before it proves the timebase runs. `tuning cleared` follows in the
  `after` bucket.
- `matched=yes` *before* the JS `statusChange readyToPlay` row is the expected
  cold order, not a red flag.
- `matched=no` with the previous channel's URI is the old item, correctly
  dropped. It files under the tune current at its arrival, wearing that tune's
  `g=`; the URI tells it apart.
- `sourceUri=absent` on iOS means the patch is not in this build; the header's
  `witness=absent` says the same at a glance. Normal on Android.
- `-- closed: left --` without `sourceReady set` is leaving mid-static;
  `-- closed: superseded --` means the next tune started first, and the rows
  that still belonged to this one sit under its `after`, marked `late`.
- A `replaceAsync start` without `resolve` under a superseded tune: the
  `resolve … late g=<gen>` row is in that tune's `after`, no longer under the
  next tune.
- `-- +N rows not kept --` is a full bucket, not a gap in the surface.
- The `dropped` line counts rows whose tag named a tune the ring had evicted,
  or a generation of a previous launch (generations restart at 1 each launch);
  they are counted, never misfiled under the newest tune.
- A tune that was open when the app went away is revived `-- closed: left --`
  at its last row's offset.
