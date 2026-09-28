# The pipeline's policy — the ladder, the pause edge, the resume tiers, the pre-warm

What the native surface does after the first frame and before the next one:
how a join that has not happened is retried, what a pause is and who owns
it, what a resume does, and how the channel under the dial is kept warm.
`docs/native-witness.md` is the first-frame contract this sits beside; the
numbers here descend from the station's contract
(`reviews/dsp-polish/03-ersatztv-hls-contract.md`, quoted where a number
depends on it) and from `reviews/dsp-polish/04-decisions.md` (decisions 1,
3, 6(a), 6(c), 16, 17). Every ruling in `00-MAP.md §4` is kept; R9's
mechanism changes with its intent kept (§4 SYNTH; surfaced per R52).

Files: `src/player/pipelinePolicy.ts` (the constants, `nextRetry`,
`decideResume`), `src/player/nativeJoinController.ts` (the reducer over the
gate), `src/player/replaceChain.ts`, `src/services/prewarm.ts`,
`src/hooks/usePrewarm.ts`; the surface (`src/player/PlayerSurface.native.tsx`)
is I/O; the module (`modules/dsp-picture`) reports three more facts. Tests:
`src/player/__tests__/{pipelinePolicy,nativeJoinController,replaceChain}.test.ts`,
`src/services/__tests__/prewarm.test.ts`.

## 1. One ladder

| constant | value | why |
|---|---|---|
| `JOIN_BACKOFF_MS` | `[0, 2000, 4000, 8000, 15000, 30000]`, indexed by `failures − 1`, the last repeating | ff-spec §6.1's table (05-PLAN §7.1: ff-spec's numbers stand). The first retry is immediate: a retry that lands on a starting session merely joins its wait (contract §1 Stage B — the multivariant request blocks until the first segment; there is no error-shaped response on the documented cold path). The cap is the user's X (R1). |
| `JOIN_SURFACE_AFTER` | 3 | the plate relabels "THE SIGNAL WILL NOT JOIN" (R4) with `terminal: false`; attempts continue |
| `HEALTHY_AFTER_MS` | 5 000 | `failures` resets only after this much *sustained* progress — never on `readyToPlay` (expo's keep-up forecast) and never on the first frame alone. PW-10: a stream that painted, played a second and died would otherwise never climb past the first rung and never surface. A stall (`playingChange false`) restarts the clock. |

The gate (`firstFrameGate.ts`) schedules every retry and re-exports these
under its old names; the controller decides *when* the ladder may run (never
while paused) and *when* it replenishes (`healthy`). Rows: `playerError …
failures=n` → `retry scheduled in=<ms>` → `attempt #n+1 reason=…`; on the
third, `error surfaced recovery-exhausted: …` (the screen's row) while the
attempts go on; `healthy failures reset from n` when the signal has held.

## 2. The pause edge

A pause is AVPlayer's own `timeControlStatus == .paused` (module event
`onTimeControl`, `src=tcs`, `status=paused`, `rate=0`) for the settled
current generation, while the `playing` prop still wants playback, the source
is not cleared, and the bound item has not failed. That last clause is the
payload's `itemStatus`: AVPlayer pauses a failed item, and that edge belongs
to the error path (the idle cut, NP-14), not to the pause policy. Expo's
`playingChange false` is not the edge: it prints `false` for
`.waitingToPlayAtSpecifiedRate` (a stall) exactly as for `.paused`.

What the app asked for never reaches `paused`: `playing=false` (the prop),
a cleared source (R7's pause+mute), the unmount, and the `expect()` pause
across every swap (the generation is not settled then). The rows are
`paused cause=user|interruption` and the screen's `onPlaybackPaused(at,
cause)`.

Cause: `interruption` when AVAudioSession's `interruptionNotification`
(`began`) arrived within `PAUSE_ATTRIBUTION_MS` = 2 s either side of the
edge (a later `began` re-attributes: `paused cause=interruption
(re-attributed)`); otherwise `user` — Now Playing, the PiP window's pause
button, or anything else the person did.

While paused (decision 17 — a paused set stays paused):

- the ladder does not run: an error for the current generation is held
  (`playerError held while paused: <msg>`), `failedWhilePaused` is set, the
  plate does not relabel;
- a rung already armed for this generation is cancelled (`retry cancelled
  paused`) and counts as a failure while paused — the resume rejoins;
- a retry timer that beats the cancel starts nothing.

## 3. The resume tiers

Resume edges, all through `decideResume` and all ignored unless the set is
paused: a Now Playing **play** (the module's `onRemoteCommand` — a second
target beside expo-video's, which still drives the player; and, as a second
chance, a rising `rate`), an interruption **ended** (`onAudioInterruption`
with `shouldResume`), a PiP **stop**, AppState **active** (`foreground`),
and `resume(reason)` on the handle. `playingChange true` while paused (the
timebase is running again and no edge said why) takes the same tiers as
`remote-play`. A `timeUpdate` while paused never resumes: AVFoundation's
periodic observer also fires "whenever time jumps and whenever playback
starts or stops", so the sample behind the pause edge — or a pre-pause tick
the bridge delivered after it — is a clock reading, not a running timebase.
The pause edge forgets the last clock reading for the same reason.

| condition (in order) | action | why |
|---|---|---|
| cause `user` and reason `foreground` | `stay-paused` | decision 17: opening the app is not pressing play |
| reason `interruption-ended` without `shouldResume` | `stay-paused` | Apple's own word |
| the item failed while paused, a rung was cancelled, or the edge was never stamped | `rejoin` | only a fresh item can play |
| elapsed ≥ `RESUME_SEEK_MAX_MS` = 45 s | `rejoin` | the session dies 60 s after its last Touch (a segment fetch or a master GET — contract §2; media-playlist polls never count) and AVPlayer buffers an undocumented distance after `pause()`, so 45 s is 60 s minus that margin; after the cut the media playlist 302s to the master and the same item cannot come back — never a seek |
| elapsed ≥ `RESUME_PLAY_MAX_MS` = 20 s | `seek-live-then-play` | the playhead has left the ~40 s served window; `seekToLiveEdge` (wall-clock minus the synthetic PDT; AVPlayer clamps to the seekable range — NP-16) then `play()` |
| else | `play` | still inside the window |

`rejoin` is the gate's `take rejoin` under a new generation (`attempt #n
reason=rejoin:resume:<why>`), with no rung and no timer: the chain runs the
channel URL at once. The row before it: `resume reason=<r> cause=<c>
elapsed=<ms> failed=<b> → <action>`. Nothing here touches `sourceReady` or
the static (R1); a resume that rejoins goes back through the witness like
any tune, under the buffering plate if the picture was up or under the
static if it never was.

The one `player.play()` in the surface is the resume's; it runs only for a
settled generation. Nothing in JS plays before the first frame (ff-spec
§3.5); native `nudge` is the one starter.

## 4. Progress, buffering, Now Playing

- `progress` is `playingChange true` or a `timeUpdate` whose `currentTime`
  exceeded the last one; it clears `onBuffering(false)`, reports `onReady`
  once per generation, and calls `onProgress(g)` — the screen restarts its
  "no progress" clock on it (NP-02). `readyToPlay` is a row and nothing
  else.
- Now Playing shows the channel name and artwork only (decision 3): the
  surface's source depends on the URL alone (R6), so a programme rollover
  never re-tunes the stream and never goes stale on the lock screen
  (NP-08). Previous/next are not wired on iOS; `mediaSessionControls` is
  the web's (NP-07).
- Auto-PiP arms only while `!tuning` (decision 1, ff-spec §6.4); the
  screen keeps the PiP flag the surface reports and writes `pip request
  ignored: active` for a PICTURE OUT while PiP is up.

## 5. The pre-warm (SI-01, decision 6(a))

Session start (0.8–5.3 s on the measured station) dominates every cold tune.
While the DS-6 dial or the phone's landscape shifter rests on a channel —
Home visible, board closed, not signed off, this screen focused (the
service panel is pushed over it), app in the foreground (on web, the tab
visible) — `src/services/prewarm.ts`:

- waits `PREWARM_DWELL_MS` = 400 ms, then sends one `HEAD` of the channel's
  `streamUrl` exactly as the M3U gives it (`/iptv/channel/N.m3u8?mode=segmenter`;
  the master action carries `[HttpHead]`, contract §1). That request starts
  or joins the session and Touches it (`SessionStartCoordinator`);
- re-touches every `PREWARM_RETOUCH_MS` = 45 s, measured from the touch's
  start (the server Touches on arrival, before it waits), while the same URL
  rests — SP-04's correction of the map's "45 s cooldown" into a re-touch;
- aborts a touch still open at `PREWARM_ABORT_MS` = 8 s: a cold master may
  block up to 30 s, but the worker is registered and `Run` fired before the
  wait (contract §1 Stage B step 3), so the abort cannot kill the session;
- stops on `rest(null)`: a tune (`tuneTo` calls it before its first
  setState, so the tune's own master GET is the channel's next Touch and no
  second request runs beside it), leaving Home, the board, the service
  panel, sign-off, the background. The server's 60 s timer is the cooldown.

One channel at a time: with `work_ahead_limit=1` the pre-warm pins the one
unthrottled QSV transcode while the person browses, which is the cost
decision 6(a) accepted. Never from the board cursor or the portrait column.
The phone's shifter gates every move at `GEAR_COMMIT_MS` = 340 ms — before
the dwell — so there the pre-warm covers the channel Home opened on (the
remembered or last channel, resting while the person reads the panel), not
a swipe that tunes. Nothing on the tune path awaits or reads the
pre-warmer; no keepalive runs while paused (SP-05: it would hold a
transcode for a viewer watching nothing).

A `Starting HLS session` storm in `docker logs` while winding the dial is
the tell to raise the dwell (05-PLAN WP-04's abandon line: 700 ms first).

## 6. The module's three policy events

None decides anything natively; each is the same fact a row prints,
delivered as a payload the surface can read without parsing a row:

| event | payload | from |
|---|---|---|
| `onTimeControl` | `{ t, g, i, src: tcs\|rate, status: paused\|waiting\|playing, reason, rate, itemStatus }` | the `timeControlStatus` and `rate` KVOs (the `N tcs` / `N rate` rows) |
| `onAudioInterruption` | `{ t, began, shouldResume }` | `AVAudioSession.interruptionNotification` (the `N audio` row) |
| `onRemoteCommand` | `{ t, command: play\|pause }` | `MPRemoteCommandCenter` play / pause targets added beside expo-video's (`N remote <command>`) — expo's handler drives the player and removes only its own tokens (`NowPlayingManager.swift:176-196, 232-241`), so ours survives every tune; not on `togglePlayPause`, where a target would claim the headphone button for a command nothing drives |

## 7. What the device shows (05-PLAN WP-04 acceptance, tunes 1–3 and 8–11)

- a cold channel: one static, `attempt #2` under it if the first item
  failed, never a second static, no card within 25 s unless the server
  really fails (`error surfaced` only at the third consecutive failure);
- a lock-screen pause of 70 s then play: `paused cause=user` → (the item
  fails at the cut) `playerError held while paused` → `N remote play` →
  `resume reason=remote-play … failed=true → rejoin` → `attempt #2
  reason=rejoin:resume:remote-play` → picture within ~2 s; no `play` row and
  no self-un-pause at +65 s;
- a phone call: `N audio interrupt began` → `paused cause=interruption` →
  `N audio interrupt ended shouldResume=true` → `resume … → play|seek-live-then-play`;
- auto-PiP never starts under the static (`N pip auto=false` while tuning);
- the dial rested ≥ 1.5 s on a cold channel: `docker logs` shows `Starting
  HLS session` at the rest, and the tune's `replaceAsync start → resolve` is
  the warm case (tens of ms), not the cold one.

## 8. Judgment calls made here (R52 — each is his to reverse)

1. **The pause edge is native `timeControlStatus`, not expo's
   `playingChange false`** (05-PLAN's wiring named the latter). Why: expo's
   `isPlaying` is `timeControlStatus == .playing`
   (`VideoPlayerObserver.swift:464-466`), so a stall prints the same
   `false`; keying a "stay paused" rule on it would freeze the ladder on
   every rebuffer. Reversal: dispatch `paused-unrequested` from
   `playingChange` instead — one handler.
2. **A Now Playing play is observed through a second `MPRemoteCommand`
   target**, not inferred from `playingChange true`. Why: on a failed item
   (the idle cut) expo reports no `isPlaying` change
   (`VideoPlayerObserver.swift:442-445`), so the owner's own scenario (pause,
   cut, press play) would have no edge at all. Reversal: delete
   `installRemoteCommands` and the `onRemoteCommand` handler; the rising
   `rate` remains as the weaker edge.
3. **The ladder's budget replenishes on five seconds of progress, not on
   `readyToPlay`** (ff-spec §6.1 wrote "health (`reportReady`)"). Why:
   PW-10; `readyToPlay` is `isPlaybackLikelyToKeepUp`. Reversal: make the
   gate's `ready` reset `failures` again — one line in `reportReady`.
4. **The ladder's numbers are ff-spec's** (`15000` at the fifth rung, not
   05-PLAN's `16000`). Why: 05-PLAN §0.2 and §7.1 say ff-spec's stand.
5. **`unbound` and `item-lost` stay counted ladder failures** (WP-03's
   judgment 2), so a resume that rejoins under a pause is `attempt #n` with
   no rung, while an FF-14 rebuild still carries `playerError … failures=1`.
6. **`onProgress` carries the generation**, as `onFirstFrame` does, not a
   tune id: the surface never learns the trace record's id.
7. **The screen keeps its PiP flag in a ref, not state** (ff-spec §6.2
   wrote `useState`): nothing renders on it; it is read at PICTURE OUT.
8. **The pre-warmer's port has no clock**: nothing in it compares times;
   its timers are the port's. (05-PLAN's sketch listed `now()`.)
9. **The chain moved to `replaceChain.ts` unchanged in behaviour** so NP-05's
   last-write-wins claim has a test; the surface's step body is where it was.
