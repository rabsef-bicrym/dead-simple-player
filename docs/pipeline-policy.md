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
to the error path (the idle cut, NP-14), not to the pause policy. Which KVO
runs first — the item's `.failed` or the player's `.paused` — is not
documented (expo's comment "iOS changes timeControlStatus after an error",
`VideoPlayerObserver.swift:442`, is the only word), so the controller reads
both orders: a pause edge within `PAUSE_ATTRIBUTION_MS` = 2 s *after* a
failure of the current generation is the failure's (`paused cause=failure
(failed <ms> before the edge)`; the armed rung stays armed), and a failure
within 2 s *after* a `cause=user` edge withdraws that pause (`paused
cause=failure (re-attributed, failed <ms> after the edge)`) and runs the
ladder — otherwise a mid-programme cut (decision 6(c)) would sit as a
person's pause until a Now Playing press. Expo's `playingChange false` is
not the edge: it prints `false` for `.waitingToPlayAtSpecifiedRate` (a
stall) exactly as for `.paused`.

What the app asked for never reaches `paused`: `playing=false` (the prop),
a cleared source (R7's pause+mute), the unmount, and the `expect()` pause
across every swap (the generation is not settled then). The rows are
`paused cause=user|interruption` and the screen's `onPlaybackPaused(at,
cause)`.

Cause: `interruption` when AVAudioSession's `interruptionNotification`
(`began`) arrived within `PAUSE_ATTRIBUTION_MS` = 2 s either side of the
edge (a later `began` re-attributes: `paused cause=interruption
(re-attributed)`), or while the interruption is still open — `began`
arrived and its `ended` has not (`interruptionOpen`): the session is the
call's at any distance, and a set the person un-paused mid-call that the
session pauses again is still the call's to lift; otherwise `user` — Now
Playing, the PiP window's pause button, or anything else the person did.
Only the `ended` closes the interruption, whatever the set was doing when
it came; a tune does not (the session is not the generation's).

While paused (decision 17 — a paused set stays paused):

- the ladder does not run: an error for the current generation more than
  2 s after a person's pause edge, or at any distance from an
  interruption's, is held (`playerError held while paused: <msg>`),
  `failedWhilePaused` is set, the plate does not relabel;
- a rung already armed for this generation is cancelled (`retry cancelled
  paused`) and counts as a failure while paused — the resume rejoins;
- a retry timer that beats the cancel starts nothing: the rung is the
  gate's and already null there (`firstFrameGate.ts`, `retry-fired`).

## 3. The resume tiers

Resume edges, all through `decideResume` and all ignored unless the set is
paused: a Now Playing **play** (`remote-play`: the module's
`onRemoteCommand` — a second target beside expo-video's, which still drives
the player), a rising **rate** on a paused set (`rate`: a play nobody here
issued — expo's own target, or the module's `nudge` re-issuing
`playImmediately` during a join; the timebase runs and the controller
follows it, through the same tiers, and the row says `rate`, not a press),
an interruption **ended** (`onAudioInterruption` with `shouldResume`), a
PiP **stop**, AppState **active** (`foreground`), and `resume(reason)` on
the handle — the screen raises `user` from `tuneTo`'s same-channel
short-circuit: a paused set selected again (the register, the board, a
link) is the person's play, and a playing set ignores it. `playingChange
true` while paused (the timebase is running again and no edge said why) is
`rate` too. A `timeUpdate` while paused never resumes: AVFoundation's
periodic observer also fires "whenever time jumps and whenever playback
starts or stops", so the sample behind the pause edge — or a pre-pause tick
the bridge delivered after it — is a clock reading, not a running timebase.
The pause edge forgets the last clock reading for the same reason.

| condition (in order) | action | why |
|---|---|---|
| cause `user` and reason `foreground`, `interruption-ended` or `pip-stop` | `stay-paused` | decision 17: opening the app is not pressing play; a call that ends with `shouldResume` set was answered over a set the person had already paused; the PiP window's X pauses the player and then reports the stop (a play there restarts audio in a window just closed) — only a play the person pressed lifts the pause |
| an interruption is open (`began` without `ended`) and reason `foreground` or `pip-stop` | `stay-paused` | the session is still the call's: iOS activates the app under the call banner, Apple does not order the `ended` against it, and a `play()` there is refused — silently (the controller would then call the set live while it sits paused, and the `ended` finds nothing to lift) or with a fresh `.paused` edge; the `ended` with `shouldResume` is the resume (SI-02). The row carries `interruption=open`. A press — Now Playing, the same-channel select — still plays: the person's word |
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
  panel, sign-off, the background. The server's 60 s timer is the cooldown;
- warms whatever the dial rests on, the channel just left included: Home is
  never over a picture (R19 — `openHome` and the stop drop `playbackActive`
  before `homeVisible` rises, and the video unmounts under Home), so when
  Home opens on the channel the person was watching its session is already
  dying, and this HEAD is the only Touch it gets while they decide. Winding
  the dial off it leaves it to the server's timer.

One channel at a time: with `work_ahead_limit=1` the pre-warm pins the one
unthrottled QSV transcode while the person browses, which is the cost
decision 6(a) accepted. Never from the board cursor or the portrait column.
The phone's shifter gates every move at `GEAR_COMMIT_MS` = 340 ms — before
the dwell — so there the pre-warm covers the channel Home opened on (the
remembered or last channel, resting while the person reads the panel), not
a swipe that tunes (judgment 14). Nothing on the tune path awaits or reads the
pre-warmer; no keepalive runs while paused (SP-05: it would hold a
transcode for a viewer watching nothing — a paused set is a picture, and
Home never opens over one).

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
  (the person comes back to the app under the call banner: `resume
  reason=foreground cause=interruption … interruption=open → stay-paused`,
  no `play`) → `N audio interrupt ended shouldResume=true` → `resume … →
  play|seek-live-then-play`;
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
   `rate` remains as the weaker edge, and the row would no longer say who
   pressed.
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
10. **A person's pause survives every system edge, not only `foreground`**
    (05-PLAN §WP-04 wrote `cause === 'user' && reason === 'foreground'`
    alone). Why: `pip-stop` follows the pause AVKit makes when the PiP
    window's X is pressed, and `interruption-ended` with `shouldResume` says
    only that the session may resume, not that the app was playing before
    the call; either would have un-paused a set the person had stopped.
    Reversal: shrink `SYSTEM_EDGES` in `pipelinePolicy.ts` to `foreground`.
11. **`'user'` is the same-channel select.** `tuneTo`'s short-circuit (a
    healthy tune is never restarted, decision 16) raises `resume('user')`:
    a paused set selected again — the register, the board, a link — plays
    through the tiers, the one play control DS,P has of its own; a playing
    set ignores it. The first cut dropped `'user'` from the plan's
    `ResumeReason` as undispatched, which left a paused set frozen behind
    that short-circuit with nothing in the app to lift it. On the web the
    handle's `resume` plays a paused element regardless of reason (WP-06
    owns its tiers).
12. **A `timeUpdate` never resumes a paused set** (05-PLAN's wiring named
    "`playingChange true` while paused"; the first cut also read an
    advancing `timeUpdate` as the same). Why: AVFoundation's periodic
    observer fires at the stop, so every pause un-paused itself (§3).
13. **A failure within 2 s of the pause edge is the failure's, in either
    KVO order** (§2). Why: the item-failed-first order is expo's comment,
    not Apple's word; the other order would have been NP-11 again, silently.
14. **The phone-landscape shifter's half of the pre-warm is inert** (05-PLAN
    §WP-04 and its §7 line 6 named "the DS-6 dial and the phone-landscape
    shifter"). A shifter move can never reach the 400 ms dwell: `onGate`
    commits the tune at `GEAR_COMMIT_MS` = 340 ms and `tuneTo` calls
    `rest(null)`, so on the phone only the channel Home opened on is warmed
    (§5). Why accepted: decision 6(a) names the dial alone, the acceptance
    line (§7) is the dial's, and a swipe loses nothing against today — the
    tune's own master GET is 340 ms behind the gate. Reversal: give `rest`
    a zero dwell and call it from `onGate`, a HEAD at the gate 340 ms ahead
    of the tune's GET, on the contract's word that a second master request
    joins the session's wait (§1 Stage B).
15. **The foreground and the PiP stop wait for an open interruption's
    `ended`** (05-PLAN's wiring resumed an interruption's pause on AppState
    `active`). Why: AppState goes `active` when the person returns to the
    app under the call banner, Apple does not order the `ended` notification
    against it, and a `play()` while the session is still interrupted is
    refused — the controller would have called the set live (the later
    `ended` ignored: only Now Playing or the X could lift it) or stamped the
    session's second pause `cause=user` (the later `ended` answered
    stay-paused) — SI-02 lost either way. Cost: an `ended` that never comes
    leaves the set paused until Now Playing or the channel selected again
    (the one documented case, `appWasSuspended`, the iOS 16 SDK retired:
    "wasSuspended reason no longer present"). Reversal: drop the
    `interruptionOpen` clause in `decideResume`.
16. **A person's pause during the join does not survive the module's
    `nudge`, and the row says so.** `nudge` re-issues `playImmediately` on
    every `loadedTimeRanges` KVO until the first `.playing`
    (`DSPPictureView.swift`, `!everPlaying`), so a pause after settle and
    before the first frame is un-paused by the next chunk of data; the
    rising rate reaches the controller as `resume reason=rate … → play`, a
    play nobody pressed, printed as such — the first cut printed it as
    `remote-play`, a Now Playing press that never happened. The un-pause
    itself is WP-03's mechanism and stands: a set that has not shown its
    first frame is joining, not playing, and a pause there has nothing to
    hold. Reversal (Swift, so EAS-gated): a `holdNudge(g)` on the module,
    called from the surface's `paused` action and cleared by the resume and
    the take, and `nudge` refuses while it holds.
