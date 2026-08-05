# iOS portrait tune crash theory

Reproduction reported from build 1.0.0 (4): start a live channel in landscape,
rotate upright into the full-screen column shift, then select another channel.
Audio survives the rotation; the app crashes during the tune.

## Most likely race

The old portrait shift set `viewAttached=false`, synchronously removing the React
`VideoView` while deliberately retaining its `VideoPlayer` and AVPlayer for audio.
The next channel changed both the stream URL and Now Playing metadata. The native
surface then called `replaceAsync()` on that still-live player while the old
`AVPlayerViewController`/PiP-capable view was leaving its window. In expo-video
3.0.16, replacement asynchronously loads an AVPlayerItem and later installs it on
the main queue; view teardown, AVPlayer KVO/status delivery, and Now Playing
registration therefore had an opportunity to overlap that install.

Two details amplified the window:

1. Each metadata change was a replacement dependency, so EPG/Now Playing copy
   could replace the same HLS source even without a real tune.
2. A cold-start retry and a new channel tune could call `replaceAsync()` at the
   same time. expo-video's iOS loader cancels its current load for a new one, while
   status/time callbacks from the displaced item may still arrive. JS generation
   checks only guarded promise completion; they did not guard the event callbacks,
   native view callback, PiP command, or player teardown.

The strongest candidate in a symbolicated Apple report is therefore an
AVFoundation/KVO or `AVPlayer.replaceCurrentItem` failure reached from
expo-video's `VideoPlayer.replaceCurrentItem`, concurrent with
`VideoView.didMoveToWindow`/`AVPlayerViewController` or PiP teardown. A secondary
candidate is Now Playing registration observing a replaced or released current
item. If the report instead points to a React layout assertion or an unrelated
decoder failure, this theory should be revised.

## Defenses now in place

- Portrait watching keeps one attached `VideoView`; its 16:9 frame is calculated
  directly from width and the top safe-area inset, eliminating the old
  measure-detach-reattach rotation transition.
- The gripe-batch tuner now keeps that same `VideoView` and `VideoPlayer` seated
  across home, watch, board, stop, and sign-off. Channel changes use serialized
  source replacement; stop/sign-off replace with `null` instead of destroying
  the owner. Static mutes the player before every replacement.
- All source replacements, including the one allowed cold-start retry, pass
  through one promise chain. Stale queued generations do no native work.
- Source replacement depends on the stream URL, not changing EPG metadata.
- Player events only affect React state for the current settled source while the
  component and logical view are attached. First-frame and PiP operations also
  require the current native view ref.
- The player surface retains its guarded two-commit detach path for other callers,
  but the watch screen no longer exercises it while changing cabinet surfaces.
- Teardown invalidates generations and timers, disables Now Playing ownership,
  and pauses before `useVideoPlayer` releases the shared native player.

No matching upstream report or newer SDK-54-compatible stable package was found;
the confirmed async-emission race is tracked at
https://github.com/expo/expo/issues/48527.

## Device checks when a build is available

1. Repeat landscape playback → portrait → tap a different register row at least
   20 times, including rapid alternating taps.
2. Repeat while the destination HLS channel is cold/loading and while rotating
   back and forth during the tune.
3. Open and close the portrait board repeatedly, tune from it, and confirm audio,
   picture, spinner, and tune-in plate recover together.
4. Start and stop PiP, return to the app, rotate, and tune; also background while
   the board is covering the picture.
5. Leave a channel across an EPG programme boundary and verify that playback does
   not reload merely when programme metadata changes.
