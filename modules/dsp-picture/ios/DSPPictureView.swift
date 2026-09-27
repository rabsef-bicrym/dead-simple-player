import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit

/**
 The picture cell: an `AVPlayerLayer` host, the first-frame witness, PiP and
 the `N` trace rows. The predicate, the rows and the reasons are in
 docs/native-witness.md; the line references there point here.

 Public API only: AVPlayer, AVPlayerItem, AVPlayerLayer, AVPlayerItemVideoOutput
 (+ pull delegate), AVPictureInPictureController, UIApplication and
 AVAudioSession notifications. No expo-video symbol is referenced.

 Invariants checkable from rows alone:
 1. `N expect g=G` precedes `N item … g=G` for the same G; a nil edge between
    them prints `N item nil pending=G` and does not consume the expectation.
 2. The output is added inside the same synchronous KVO that binds the item
    and removed only in `unbind` (one `N unbind` per `N item`).
 3. At most one `N fire` per `N item`; `N fire` always prints `tcs=playing`,
    `tb>0`, `cur>prev` and (unless `ext=true`) `copy=ok|latched`, `rfd=true`,
    `rfdSrc=rfdKvo|advanced`.
 4. No re-arm path exists: `setPlayer` is identity-guarded; layout, rotation
    and window changes only call `sample`.
 5. Nothing reads a wall clock to decide; the periodic time observer is
    installed at bind and removed at fire/unbind; there is no CADisplayLink
    in this file.
 */

/// Apple's canonical player view: the backing layer IS the AVPlayerLayer.
final class PlayerLayerView: UIView {
  override class var layerClass: AnyClass { AVPlayerLayer.self }
  var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }   // swiftlint:disable:this force_cast
}

/// What JS asked for, recorded before the swap so the currentItem KVO can bind item identity to a generation.
private struct Expectation {
  let generation: Int
  let uri: String
}

/// Everything the witness knows about the item it is bound to. One per item; discarded at the item edge.
private final class BoundItem {
  let item: AVPlayerItem
  var generation: Int              // > 0 when bound to an expectation (or adopted); -1 otherwise — never fires
  let uri: String
  let tag: String
  let bindSeq: Int
  let output: AVPlayerItemVideoOutput
  var rfdSeq = 0                   // seq of the last KVO delivery of isReadyForDisplay == true
  var started = false              // startPlayback accepted, or an outside play observed (rate > 0)
  var everPlaying = false          // timeControlStatus reached .playing; the nudge stops here
  var nudges = 0
  var copyOK = false               // C6 latch
  var lastItemTime: CMTime = .invalid
  var lastDisplay: CMTime = .invalid
  var prevDisplay: CMTime = .invalid
  var prevTime: CMTime = .invalid  // C5 previous sample; valid only when C4 held at that sample
  var polls = 0
  var fired = false
  var lostReported = false
  var lastHoldWhy = ""
  var holdRows = 0
  var missRows = 0
  var loadedRows = 0
  var loadedRowsAfterFire = 0
  var errorRows = 0
  var accessRows = 0
  var outputRows = 0
  var observers: [NSKeyValueObservation] = []
  var notifications: [NSObjectProtocol] = []
  var timeObserver: Any?

  init(item: AVPlayerItem, generation: Int, uri: String, bindSeq: Int, output: AVPlayerItemVideoOutput) {
    self.item = item
    self.generation = generation
    self.uri = uri
    self.bindSeq = bindSeq
    self.output = output
    self.tag = String(UInt(bitPattern: ObjectIdentifier(item).hashValue) & 0xFFFFFF, radix: 16)
  }
}

public final class DSPPictureView: ExpoView, AVPictureInPictureControllerDelegate, AVPlayerItemOutputPullDelegate {
  // MARK: events (names declared in DSPPictureModule; matched by property name, EventDispatcher.swift:65-80)
  let onTrace = EventDispatcher()
  let onFirstFrame = EventDispatcher()
  let onItemLost = EventDispatcher()
  let onItemFailed = EventDispatcher()
  let onPictureInPictureChange = EventDispatcher()

  // MARK: configuration
  var liveOffsetSeconds: Double = 8.0

  // MARK: the layer
  private let host = PlayerLayerView()
  var playerLayer: AVPlayerLayer { host.playerLayer }

  // MARK: state
  private weak var playerRef: SharedRef<AVPlayer>?
  private var player: AVPlayer? { playerRef?.ref }
  private var playerObservers: [NSKeyValueObservation] = []
  private var layerObservers: [NSKeyValueObservation] = []
  private var appObservers: [NSObjectProtocol] = []
  private var audioObservers: [NSObjectProtocol] = []
  private var pip: AVPictureInPictureController?
  private var pipObserver: NSKeyValueObservation?
  private var pipAuto = false
  private var pipActive = false
  private var pending: Expectation?
  private var bound: BoundItem?
  private var seq = 0
  private let outputQueue = DispatchQueue(label: "dsp.picture.output")
  private var lastBounds: CGRect = .zero
  private var lastVideoRectTag = ""
  private var lastExternal = false
  // The dispatchers are installed after init (ExpoFabricView.create → installEventDispatchers),
  // so the creation row is written with its own host time by the first row that can be delivered.
  private var createdAt: Double? = CACurrentMediaTime() * 1000

  // MARK: lifecycle

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear                 // the seat behind is #000 (watch.tsx signalSeat); R8 for siblings, not us
    host.backgroundColor = .clear
    host.isUserInteractionEnabled = false
    host.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    host.frame = bounds
    addSubview(host)
    installLayerObservers()
    installAppObservers()
  }

  deinit {
    detachPlayer(reason: "deinit")
    layerObservers.forEach { $0.invalidate() }
    (appObservers + audioObservers).forEach { NotificationCenter.default.removeObserver($0) }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    host.frame = bounds
    if bounds != lastBounds {
      lastBounds = bounds
      row("N bounds", "\(Int(bounds.width))x\(Int(bounds.height))")
      sample(src: "kvo")
    }
  }

  public override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    row("N window", newWindow == nil ? "nil" : "set")
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    sample(src: "kvo")
  }

  // MARK: player attach / detach (identity-guarded: Fabric re-applies every prop on any props commit)

  func setPlayer(_ newRef: SharedRef<AVPlayer>?) {
    if let newRef, let current = playerRef, current === newRef { return }
    detachPlayer(reason: newRef == nil ? "unset" : "replace")
    guard let newRef else { return }
    playerRef = newRef
    let p = newRef.ref
    // No expo VideoView is registered any more, so VideoManager.onAppBackgrounded (VideoManager.swift:49-61)
    // never writes this. .continuesIfPossible = audio continues in the background; PiP keeps the video (R14 / decision 1).
    p.audiovisualBackgroundPlaybackPolicy = .continuesIfPossible
    playerLayer.player = p
    lastExternal = p.isExternalPlaybackActive
    row("N attach", "tcs=\(tcsName(p)) rate=\(p.rate) waits=\(p.automaticallyWaitsToMinimizeStalling) item=\(p.currentItem == nil ? "nil" : "set") ext=\(p.isExternalPlaybackActive)")
    installPlayerObservers(p)                // the .initial currentItem KVO binds a pre-existing item here (g=-1)
    installPip()
  }

  private func detachPlayer(reason: String) {
    guard playerRef != nil || bound != nil else { return }
    if let b = bound { unbind(b, reason: reason) }
    playerObservers.forEach { $0.invalidate() }
    playerObservers.removeAll()
    pipObserver?.invalidate(); pipObserver = nil
    pip?.delegate = nil; pip = nil
    pipActive = false
    playerLayer.player = nil
    playerRef = nil
    pending = nil
    row("N detach", reason)
  }

  func setContentFit(_ fit: String?) {
    switch fit {
    case "cover": playerLayer.videoGravity = .resizeAspectFill
    case "fill": playerLayer.videoGravity = .resize
    default: playerLayer.videoGravity = .resizeAspect
    }
  }

  // MARK: expectation → binding

  /// Called by JS inside the serialised replace chain, immediately before player.replaceAsync(source).
  /// Rate 0 across every swap (FF-02): the old item is muted already (R5); nothing plays until startPlayback.
  func expect(generation: Int, uri: String) {
    if let p = player, p.rate != 0 { p.pause() }
    pending = Expectation(generation: generation, uri: uri)
    row("N expect", "g=\(generation) uri=\(uri) rate=\(player?.rate ?? -1) current=\(bound?.tag ?? "none")")
  }

  private func installPlayerObservers(_ p: AVPlayer) {
    playerObservers.append(p.observe(\.currentItem, options: [.initial, .new]) { [weak self] p, _ in
      self?.onMain { self?.onCurrentItemChanged(p) }
    })
    playerObservers.append(p.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
      self?.onMain {
        guard let self else { return }
        self.row("N tcs", "\(self.tcsName(p)) reason=\(self.reasonName(p)) rate=\(p.rate) tb=\(self.tbRate()) tbEff=\(self.tbEffectiveRate())")
        if p.timeControlStatus == .playing { self.bound?.everPlaying = true }
        self.sample(src: "kvo")
      }
    })
    playerObservers.append(p.observe(\.rate, options: [.new]) { [weak self] p, _ in
      self?.onMain {
        guard let self else { return }
        self.row("N rate", "\(p.rate)")
        // An outside play() (Now Playing) is a start intent; the data nudge must apply to it.
        if p.rate > 0, let b = self.bound, !b.started, b.generation > 0 {
          b.started = true
          self.row("N start", "adopted reason=external rate=\(p.rate)", b)
          self.nudge(b, p, reason: "external")
        }
        self.sample(src: "kvo")
      }
    })
    playerObservers.append(p.observe(\.isExternalPlaybackActive, options: [.new]) { [weak self] p, _ in
      self?.onMain {
        guard let self else { return }
        if p.isExternalPlaybackActive != self.lastExternal {
          self.lastExternal = p.isExternalPlaybackActive
          self.row("N ext", "\(p.isExternalPlaybackActive)")
        }
        self.sample(src: "kvo")
      }
    })
  }

  /// Delivered synchronously inside replaceCurrentItem(with:) on main (the patched continuation resumes after this).
  private func onCurrentItemChanged(_ p: AVPlayer) {
    let newItem = p.currentItem
    let prev = bound
    if let b = prev {
      unbind(b, reason: newItem == nil ? "itemNil" : "itemChange")
      // FF-14(c): the constructor's deferred nil-replace landed after our edge. A started, unfired item is gone.
      if newItem == nil, b.started, !b.fired, b.generation > 0, !b.lostReported {
        b.lostReported = true
        row("N lost", "g=\(b.generation)", b)
        onItemLost(["g": b.generation, "i": b.tag, "t": CACurrentMediaTime() * 1000])
      }
    }
    guard let newItem else {
      // A nil edge does not consume the expectation: the item JS asked for is still the NEXT non-nil item.
      row("N item", "nil rate=\(p.rate) tcs=\(tcsName(p)) prev=\(prev?.tag ?? "none") pending=\(pending?.generation ?? 0)")
      return
    }
    seq += 1
    let assetUri = (newItem.asset as? AVURLAsset)?.url.absoluteString ?? "?"
    var generation = -1
    var match = "no-expectation"
    if let e = pending {
      generation = e.generation
      match = Self.urisMatch(e.uri, assetUri) ? "yes" : "no"
      pending = nil
    }

    // Decision 6(d): the earliest possible moment; measured below, never assumed.
    newItem.configuredTimeOffsetFromLive = CMTime(seconds: liveOffsetSeconds, preferredTimescale: 600)
    newItem.automaticallyPreservesTimeOffsetFromLive = false

    // C6's probe: attached for the item's lifetime, removed only in unbind (FF-04a/b closed).
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    ])
    output.setDelegate(self, queue: outputQueue)
    newItem.add(output)
    output.requestNotificationOfMediaDataChange(withAdvanceInterval: 1.0 / 30.0)   // the documented pull pattern

    let b = BoundItem(item: newItem, generation: generation, uri: assetUri, bindSeq: seq, output: output)
    bound = b
    lastVideoRectTag = ""
    installItemObservers(b, p)
    row("N item", "id=\(b.tag) status=\(statusName(newItem.status)) uriMatch=\(match) g=\(generation) rfd0=\(playerLayer.isReadyForDisplay) rate=\(p.rate) tcs=\(tcsName(p)) prev=\(prev?.tag ?? "none")", b)
    let rec = newItem.recommendedTimeOffsetFromLive
    row("N config", "configured=\(sec(newItem.configuredTimeOffsetFromLive)) recommended=\(sec(rec)) preserve=no fwd=\(newItem.preferredForwardBufferDuration) waits=\(p.automaticallyWaitsToMinimizeStalling) seekable=\(seekableText(newItem))", b)
    sample(src: "kvo")
  }

  private static func urisMatch(_ a: String, _ b: String) -> Bool {
    if a == b { return true }
    guard let ua = URL(string: a), let ub = URL(string: b) else { return false }
    return ua.absoluteString == ub.absoluteString
  }

  private func installItemObservers(_ b: BoundItem, _ p: AVPlayer) {
    let item = b.item
    b.observers.append(item.observe(\.status, options: [.old, .new]) { [weak self, weak b] item, change in
      self?.onMain {
        guard let self, let b else { return }
        var detail = "\(self.statusName(change.oldValue ?? .unknown))→\(self.statusName(item.status))"
        if item.status == .failed, let e = item.error.map({ $0 as NSError }) {
          detail += " err=\(e.domain)/\(e.code) \(self.short(e.localizedDescription))"
        }
        self.row("N itemStatus", detail, b)
        if item.status == .readyToPlay { self.nudge(b, p, reason: "ready") }
        if item.status == .failed, b.generation > 0, !b.fired {
          // Native-fed error path: independent of expo's status machine (FF-14b).
          let e = item.error.map { $0 as NSError }
          self.onItemFailed(["g": b.generation, "i": b.tag, "t": CACurrentMediaTime() * 1000,
                             "domain": e?.domain ?? "-", "code": e?.code ?? 0,
                             "message": self.short(e?.localizedDescription)])
        }
        self.sample(src: "kvo")
      }
    })
    b.observers.append(item.observe(\.loadedTimeRanges, options: [.new]) { [weak self, weak b] item, _ in
      self?.onMain {
        guard let self, let b else { return }
        let cap = b.fired ? (b.loadedRowsAfterFire < 3) : (b.loadedRows < 3)
        if cap {
          if b.fired { b.loadedRowsAfterFire += 1 } else { b.loadedRows += 1 }
          self.row("N loaded", "\(self.rangesText(item)) cur=\(self.sec(item.currentTime())) empty=\(item.isPlaybackBufferEmpty) keepUp=\(item.isPlaybackLikelyToKeepUp) tcs=\(self.tcsName(p))", b)
        }
        // Start on data, not on AVPlayer's stall forecast; stops for good at the first .playing.
        if !item.loadedTimeRanges.isEmpty && p.timeControlStatus != .playing { self.nudge(b, p, reason: "data") }
        self.sample(src: "kvo")
      }
    })
    b.observers.append(item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self, weak b] item, _ in
      self?.onMain { guard let b else { return }; self?.row("N bufferEmpty", "\(item.isPlaybackBufferEmpty)", b) }
    })
    b.observers.append(item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self, weak b] item, _ in
      self?.onMain { guard let b else { return }; self?.row("N keepUp", "\(item.isPlaybackLikelyToKeepUp)", b) }
    })
    let nc = NotificationCenter.default
    b.notifications.append(nc.addObserver(forName: .AVPlayerItemPlaybackStalled, object: item, queue: .main) { [weak self, weak b] _ in
      guard let self, let b else { return }
      self.row("N stalled", "cur=\(self.sec(item.currentTime())) \(self.rangesText(item)) tcs=\(self.tcsName(p))", b)
    })
    b.notifications.append(nc.addObserver(forName: .AVPlayerItemTimeJumped, object: item, queue: .main) { [weak self, weak b] _ in
      guard let self, let b else { return }
      b.prevTime = .invalid                       // a jump is not consumption
      b.prevDisplay = .invalid
      self.row("N jump", "to=\(self.sec(item.currentTime()))", b)
    })
    b.notifications.append(nc.addObserver(forName: .AVPlayerItemNewErrorLogEntry, object: item, queue: .main) { [weak self, weak b] _ in
      guard let self, let b, b.errorRows < 5, let e = item.errorLog()?.events.last else { return }
      b.errorRows += 1
      self.row("N errorLog", "status=\(e.errorStatusCode) domain=\(e.errorDomain) uri=\(self.short(e.uri)) \(self.short(e.errorComment))", b)
    })
    b.notifications.append(nc.addObserver(forName: .AVPlayerItemNewAccessLogEntry, object: item, queue: .main) { [weak self, weak b] _ in
      guard let self, let b, b.accessRows < 2, let e = item.accessLog()?.events.last else { return }
      b.accessRows += 1
      self.row("N accessLog", "startup=\(String(format: "%.3f", e.startupTime)) uri=\(self.short(e.uri)) bitrate=\(Int(e.indicatedBitrate)) stalls=\(e.numberOfStalls)", b)
    })
    b.notifications.append(nc.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self, weak b] n in
      guard let self, let b else { return }
      let err = (n.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error)?.localizedDescription
      self.row("N failedToEnd", self.short(err), b)
    })
    // The sampler: the item's own clock (§3.4). Runs only while the timebase advances, and once at start/stop/jump.
    b.timeObserver = p.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { [weak self] _ in
      self?.sample(src: "clock")
    }
  }

  private func unbind(_ b: BoundItem, reason: String) {
    if let t = b.timeObserver { player?.removeTimeObserver(t); b.timeObserver = nil }
    b.observers.forEach { $0.invalidate() }
    b.notifications.forEach { NotificationCenter.default.removeObserver($0) }
    b.output.setDelegate(nil, queue: nil)
    b.item.remove(b.output)                     // the only place an output is ever removed
    row("N unbind", "reason=\(reason) fired=\(b.fired) polls=\(b.polls)", b)
    if bound === b { bound = nil }
  }

  // MARK: starting the item (§3.5)

  /// JS calls this after replaceAsync resolved and settledGeneration = G. "ok" | "adopted" | "unbound" | "stale".
  func startPlayback(generation: Int, uri: String) -> String {
    guard let p = player else { row("N start", "refused reason=noPlayer g=\(generation)"); return "unbound" }
    guard let b = bound, p.currentItem === b.item else {
      row("N start", "refused reason=unbound g=\(generation) current=\(p.currentItem == nil ? "nil" : "unbound-item")")
      return "unbound"                          // FF-14(a): the load was cancelled; JS rebuilds at once
    }
    var result = "ok"
    if b.generation != generation {
      // An item bound with no expectation (view remounted mid-tune, expect rejected) is adopted
      // when it is the item this generation asked for.
      if b.generation < 0, Self.urisMatch(uri, b.uri) {
        b.generation = generation
        result = "adopted"
        row("N adopt", "g=\(generation)", b)
      } else {
        row("N start", "refused reason=stale g=\(generation) bound=\(b.generation)", b)
        return "stale"
      }
    }
    b.started = true
    row("N start", "\(result) g=\(generation) tcs=\(tcsName(p)) rate=\(p.rate)", b)
    nudge(b, p, reason: "start")
    return result
  }

  private func nudge(_ b: BoundItem, _ p: AVPlayer, reason: String) {
    guard b.started, !b.everPlaying, p.currentItem === b.item, b.item.status != .failed else { return }
    b.nudges += 1
    p.playImmediately(atRate: 1.0)   // "plays the available media data … regardless of whether there is sufficient media buffered"
    row("N nudge", "n=\(b.nudges) reason=\(reason) empty=\(b.item.isPlaybackBufferEmpty) \(rangesText(b.item)) tcs=\(tcsName(p)) wait=\(reasonName(p))", b)
  }

  // MARK: the witness — §3.2, evaluated once per sample

  private func onScreen() -> (Bool, String) {
    if pipActive { return (true, "") }
    var why = ""
    if window == nil { why += "W" }
    if playerLayer.bounds.isEmpty { why += "B" }
    if UIApplication.shared.applicationState == .background { why += "A" }
    var v: UIView? = self
    while let u = v { if u.isHidden || u.alpha <= 0.01 { why += "H"; break }; v = u.superview }
    return (why.isEmpty, why)
  }

  private func sample(src: String) {
    guard let p = player, let b = bound, !b.fired, b.generation > 0, p.currentItem === b.item else { return }
    b.polls += 1

    // C4 — the timebase runs.
    let tb = tbRate()
    let running = p.timeControlStatus == .playing && p.rate > 0 && tb > 0

    // C5 — the clock moved between two consecutive samples of a running clock.
    let cur = b.item.currentTime()
    let prev = b.prevTime
    let advanced = running && prev.isValid && cur.isValid && CMTimeCompare(cur, prev) > 0
    b.prevTime = (running && cur.isValid) ? cur : .invalid

    // C6 — a frame is obtainable for a valid item time; latched. Copied on every sample until the fire so the
    // display deadlines can prove progression for C3's fallback. "has" without "copy" is A1 → a row.
    var has = false
    var copied = false
    var display = CMTime.invalid
    let itemTime = b.output.itemTime(forHostTime: CACurrentMediaTime())
    if itemTime.isValid, b.output.hasNewPixelBuffer(forItemTime: itemTime) {
      has = true
      if b.output.copyPixelBuffer(forItemTime: itemTime, itemTimeForDisplay: &display) != nil {
        copied = true
        b.copyOK = true
        b.lastItemTime = itemTime
        if display.isValid {
          b.prevDisplay = running ? b.lastDisplay : .invalid   // both deadlines must be copied under a running clock
          b.lastDisplay = display
        }
      } else if b.missRows < 3 {
        b.missRows += 1
        row("N miss", "src=\(src) poll=\(b.polls) itemTime=\(sec(itemTime)) has=true copy=nil tcs=\(tcsName(p)) tb=\(tb) rfd=\(playerLayer.isReadyForDisplay)", b)
      }
    }
    let displayAdvanced = running && b.prevDisplay.isValid && b.lastDisplay.isValid && CMTimeCompare(b.lastDisplay, b.prevDisplay) > 0

    // C3 — our layer is ready, and that readiness belongs to this item.
    let rfdNow = playerLayer.isReadyForDisplay
    let rfdKvo = b.rfdSeq > b.bindSeq
    let via = rfdKvo ? "rfdKvo" : (displayAdvanced ? "advanced" : "none")
    let c3 = rfdNow && (rfdKvo || displayAdvanced)

    // C7 — on screen (PiP counts: it hosts this layer).
    let (screen, screenWhy) = onScreen()

    let ext = p.isExternalPlaybackActive
    let ok = ext ? (running && advanced) : (running && advanced && b.copyOK && c3 && screen)

    let state = "src=\(src) poll=\(b.polls) itemTime=\(sec(itemTime)) has=\(has) copy=\(copied ? "ok" : (b.copyOK ? "latched" : "nil")) display=\(sec(b.lastDisplay)) prevDisplay=\(sec(b.prevDisplay)) cur=\(sec(cur)) prev=\(sec(prev)) tb=\(tb) tbEff=\(tbEffectiveRate()) rate=\(p.rate) itemStatus=\(statusName(b.item.status)) tcs=\(tcsName(p)) reason=\(reasonName(p)) rfd=\(rfdNow) rfdSrc=\(via) vr=\(rectText(playerLayer.videoRect)) \(rangesText(b.item)) empty=\(b.item.isPlaybackBufferEmpty) keepUp=\(b.item.isPlaybackLikelyToKeepUp) app=\(appState()) pip=\(pipActive) ext=\(ext) window=\(window != nil)"

    guard ok else {
      var why = ""
      if !running { why += "R" }
      if !advanced { why += "T" }
      if !ext {
        if !b.copyOK { why += "F" }
        if !rfdNow { why += "D" }
        if rfdNow && !(rfdKvo || displayAdvanced) { why += "E" }
        why += screenWhy
      }
      if why != b.lastHoldWhy && b.holdRows < 12 {   // one row per distinct reason set, bounded
        b.lastHoldWhy = why
        b.holdRows += 1
        row("N hold", "why=\(why) " + state, b)
      }
      return
    }

    b.fired = true
    if let t = b.timeObserver { p.removeTimeObserver(t); b.timeObserver = nil }
    b.output.requestNotificationOfMediaDataChange(withAdvanceInterval: 1.0)   // quiescent, not detached
    row("N fire", "via=\(ext ? "external" : via) nudges=\(b.nudges) " + state, b)
    onFirstFrame(["g": b.generation, "i": b.tag, "t": CACurrentMediaTime() * 1000, "via": ext ? "external" : via, "poll": b.polls])
  }

  // MARK: AVPlayerItemOutputPullDelegate (called on outputQueue)

  public func outputMediaDataWillChange(_ sender: AVPlayerItemOutput) {
    onMain { [weak self] in
      guard let self, let b = self.bound, b.output === sender else { return }
      if b.outputRows < 3 {
        b.outputRows += 1
        self.row("N output", "willChange itemTime=\(self.sec(b.output.itemTime(forHostTime: CACurrentMediaTime()))) tcs=\(self.player.map { self.tcsName($0) } ?? "-")", b)
      }
      self.sample(src: "output")
    }
  }

  public func outputSequenceWasFlushed(_ output: AVPlayerItemOutput) {
    onMain { [weak self] in
      guard let self, let b = self.bound, b.output === output else { return }
      b.prevDisplay = .invalid
      self.row("N output", "flushed", b)
    }
  }

  // MARK: layer + app observers

  private func installLayerObservers() {
    layerObservers.append(playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self] layer, change in
      let delivered = change.newValue ?? layer.isReadyForDisplay      // the DELIVERED value, captured at delivery
      self?.onMain {
        guard let self else { return }
        self.seq += 1
        var after = "no"
        if delivered, let b = self.bound { b.rfdSeq = self.seq; after = "yes" }
        self.row("N rfd", "\(delivered) seq=\(self.seq) afterBind=\(after)")
        self.sample(src: "kvo")
      }
    })
    layerObservers.append(playerLayer.observe(\.videoRect, options: [.new]) { [weak self] layer, _ in
      self?.onMain {
        guard let self else { return }
        let tag = self.rectText(layer.videoRect)
        if tag != self.lastVideoRectTag { self.lastVideoRectTag = tag; self.row("N vr", tag) }
      }
    })
  }

  private func installAppObservers() {
    let nc = NotificationCenter.default
    appObservers.append(nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      self?.row("N app", "background pip=\(self?.pipActive ?? false)")
    })
    appObservers.append(nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
      self?.row("N app", "foreground")
    })
    appObservers.append(nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.row("N app", "active"); self?.sample(src: "kvo")
    })
    let session = AVAudioSession.sharedInstance()
    audioObservers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] note in
      let info = note.userInfo ?? [:]
      let began = (info[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue
      let opts = (info[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
      let resume = (opts & AVAudioSession.InterruptionOptions.shouldResume.rawValue) != 0
      self?.row("N audio", "interrupt \(began ? "began" : "ended") shouldResume=\(resume)")
    })
    audioObservers.append(nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] note in
      let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
      self?.row("N audio", "route reason=\(reason)")
    })
  }

  // MARK: PiP (decision 1: auto only while !tuning, fed by JS; an active PiP is a screen)

  private func installPip() {
    guard AVPictureInPictureController.isPictureInPictureSupported() else { emitPip(); return }
    guard let c = AVPictureInPictureController(playerLayer: playerLayer) else { emitPip(); return }
    c.delegate = self
    c.canStartPictureInPictureAutomaticallyFromInline = pipAuto
    pipObserver = c.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] c, _ in
      self?.onMain { self?.row("N pip", "possible=\(c.isPictureInPicturePossible)"); self?.emitPip() }
    }
    pip = c
  }

  func setAutomaticPictureInPicture(_ auto: Bool) {
    guard auto != pipAuto else { return }
    pipAuto = auto
    pip?.canStartPictureInPictureAutomaticallyFromInline = auto
    row("N pip", "auto=\(auto)")
  }

  func startPictureInPicture() -> Bool {
    guard let pip, pip.isPictureInPicturePossible, !pip.isPictureInPictureActive else {
      row("N pip", "start refused possible=\(pip?.isPictureInPicturePossible ?? false) active=\(pip?.isPictureInPictureActive ?? false)")
      return false
    }
    pip.startPictureInPicture()
    return true
  }

  func stopPictureInPicture() { pip?.stopPictureInPicture() }

  private func emitPip() {
    onPictureInPictureChange(["active": pip?.isPictureInPictureActive ?? false, "possible": pip?.isPictureInPicturePossible ?? false])
  }

  public func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    pipActive = true; row("N pip", "start"); emitPip(); sample(src: "kvo")
  }
  public func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    pipActive = false; row("N pip", "stop"); emitPip(); sample(src: "kvo")
  }
  public func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
    row("N pip", "failed \(short(error.localizedDescription))"); emitPip()
  }
  public func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController,
                                         restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
    completionHandler(true)
  }

  // MARK: bench snapshot

  func status() -> [String: Any] {
    return ["player": player != nil, "item": bound?.tag ?? "none", "g": bound?.generation ?? 0,
            "fired": bound?.fired ?? false, "current": player?.currentItem == nil ? "none" : "set",
            "pip": pipActive, "ext": player?.isExternalPlaybackActive ?? false]
  }

  // MARK: rows and helpers

  private func row(_ name: String, _ detail: String, _ b: BoundItem? = nil) {
    if let t0 = createdAt {
      createdAt = nil
      onTrace(["t": t0, "g": -1, "i": "-", "name": "N view", "detail": "init"])
    }
    let bb = b ?? bound
    onTrace(["t": CACurrentMediaTime() * 1000, "g": bb?.generation ?? (pending?.generation ?? -1), "i": bb?.tag ?? "-", "name": name, "detail": detail])
  }
  private func onMain(_ f: @escaping () -> Void) {
    if Thread.isMainThread { f() } else { DispatchQueue.main.async(execute: f) }
  }
  private func tbRate() -> Float64 { bound?.item.timebase.map { CMTimebaseGetRate($0) } ?? 0 }
  private func tbEffectiveRate() -> Float64 { bound?.item.timebase.map { CMTimebaseGetEffectiveRate($0) } ?? 0 }
  private func tcsName(_ p: AVPlayer) -> String {
    switch p.timeControlStatus { case .paused: return "paused"; case .playing: return "playing"; default: return "waiting" }
  }
  private func reasonName(_ p: AVPlayer) -> String {
    guard let r = p.reasonForWaitingToPlay else { return "-" }
    switch r {
    case .toMinimizeStalls: return "toMinimizeStalls"
    case .noItemToPlay: return "noItemToPlay"
    case .evaluatingBufferingRate: return "evaluatingBufferingRate"
    default: return r.rawValue
    }
  }
  private func statusName(_ s: AVPlayerItem.Status) -> String {
    switch s { case .readyToPlay: return "ready"; case .failed: return "failed"; default: return "unknown" }
  }
  private func appState() -> String {
    switch UIApplication.shared.applicationState { case .active: return "active"; case .inactive: return "inactive"; default: return "background" }
  }
  private func sec(_ t: CMTime) -> String { t.isValid && !t.isIndefinite ? String(format: "%.3f", CMTimeGetSeconds(t)) : "invalid" }
  private func rectText(_ r: CGRect) -> String { "\(Int(r.width))x\(Int(r.height))" }
  private func rangesText(_ item: AVPlayerItem) -> String {
    let ranges = item.loadedTimeRanges.map { $0.timeRangeValue }.filter { $0.isValid }
    guard let first = ranges.first else { return "loaded=[]" }
    return "loaded=[\(sec(first.start)),\(sec(CMTimeRangeGetEnd(first)))]" + (ranges.count > 1 ? "+\(ranges.count - 1)" : "")
  }
  private func seekableText(_ item: AVPlayerItem) -> String {
    guard let r = item.seekableTimeRanges.first?.timeRangeValue, r.isValid else { return "[]" }
    return "[\(sec(r.start)),\(sec(CMTimeRangeGetEnd(r)))]"
  }
  private func short(_ s: String?) -> String { guard let s else { return "-" }; return String(s.prefix(96)) }
}
