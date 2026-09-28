import AVFoundation
import ExpoModulesCore

/**
 DSPPicture — the picture cell and the tuning static of DS,P on iOS.

 Two views. `DSPPictureView` hosts expo-video's persistent `AVPlayer` (R6) in an
 app-owned `AVPlayerLayer` and is the only thing that may end the tuning static:
 it emits `onFirstFrame` when the first-frame witness holds for the item the
 current tune generation asked for (docs/native-witness.md §3). `DSPStaticView`
 is the snow the render server draws (docs/native-witness.md §9).

 Nothing here reads an expo-video symbol: the player arrives as a
 `SharedRef<AVPlayer>` (expo-video's `VideoPlayer` is one, VideoPlayer.swift:7),
 resolved by expo-modules-core from the shared object id JS passes
 (DynamicSharedObjectType.swift:37-40) — the same id expo-video's own view passes
 (VideoView.tsx:105-109).
 */
public final class DSPPictureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DSPPicture")

    View(DSPPictureView.self) {
      Events("onTrace", "onFirstFrame", "onItemLost", "onItemFailed", "onPictureInPictureChange",
             "onTimeControl", "onAudioInterruption", "onRemoteCommand")

      // Identity-guarded: Fabric re-applies every declared prop on any props
      // commit of the element (a rotation changes `style`), and a same-value
      // commit must not re-arm anything (FF-13).
      Prop("player") { (view: DSPPictureView, player: SharedRef<AVPlayer>?) in
        view.setPlayer(player)
      }
      Prop("contentFit") { (view: DSPPictureView, fit: String?) in
        view.setContentFit(fit)
      }
      // Decision 1: JS passes !tuning — auto-PiP never arms under the static.
      Prop("automaticPictureInPicture") { (view: DSPPictureView, auto: Bool?) in
        view.setAutomaticPictureInPicture(auto ?? false)
      }
      // Decision 6(d): a measured request, printed by `N config`.
      Prop("liveOffsetSeconds") { (view: DSPPictureView, seconds: Double?) in
        view.liveOffsetSeconds = seconds ?? 8.0
      }

      // Inside the serialised replace chain, immediately before
      // player.replaceAsync(source). Pauses the player (rate 0 across the swap,
      // FF-02) and records (generation, uri) for the next non-nil currentItem.
      AsyncFunction("expect") { (view: DSPPictureView, generation: Int, uri: String) in
        view.expect(generation: generation, uri: uri)
      }.runOnQueue(.main)

      // After replaceAsync resolved and JS settled the generation.
      // Returns "ok" | "adopted" | "unbound" | "stale" | "failed".
      AsyncFunction("startPlayback") { (view: DSPPictureView, generation: Int, uri: String) -> String in
        return view.startPlayback(generation: generation, uri: uri)
      }.runOnQueue(.main)

      AsyncFunction("startPictureInPicture") { (view: DSPPictureView) -> Bool in
        return view.startPictureInPicture()
      }.runOnQueue(.main)

      AsyncFunction("stopPictureInPicture") { (view: DSPPictureView) in
        view.stopPictureInPicture()
      }.runOnQueue(.main)

      // A read-only snapshot for the bench; never on the first-frame path.
      AsyncFunction("status") { (view: DSPPictureView) -> [String: Any] in
        return view.status()
      }.runOnQueue(.main)
    }

    View(DSPStaticView.self) {
      Events("onStaticLive", "onStaticBoil")
      Prop("grainPoints") { (view: DSPStaticView, grain: Double?) in
        view.grainPoints = CGFloat(grain ?? 2.0)
      }
    }
  }
}
