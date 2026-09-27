import ExpoModulesCore
import UIKit

/**
 The tuning static, drawn by the render server (docs/native-witness.md §9).

 One CALayer whose `contentsRect` is a discrete CAKeyframeAnimation over a
 runtime-generated 1024² grey-noise tile: 600 random sub-rects at one keyframe
 per refresh (a 10 s loop at 60 Hz), nearest-neighbour magnification so a 2 pt
 grain reads as blocks, the Skia field's luma band (0.14 + n·0.71 → bytes
 36…217). No bitmap ships (R3); the tile is generated at launch; it runs at
 display rate; it keeps animating under reduced motion (R31). Once committed,
 the render server evaluates the animation every refresh — the app's main and
 JS threads can both be blocked and the snow keeps boiling. There is no
 per-frame code path to stall, no shader, no uniform that grows (H-J).

 `animationDidStart` emits `S live`; two differing presentation-layer samples
 emit `S boil` — the render server is advancing the keyframes, the one thing
 Skia could never tell us. The boil check's CADisplayLink decides nothing, is
 not in the first-frame path, and retires at the first difference or after
 `boilTickBudget` refreshes: when the keyframes never advance (the H-J case) or
 the presentation layer is nil, the absence of `S boil` is already the signal.
 */
public final class DSPStaticView: ExpoView, CAAnimationDelegate {
  let onStaticLive = EventDispatcher()
  let onStaticBoil = EventDispatcher()

  var grainPoints: CGFloat = 2 { didSet { if grainPoints != oldValue { install() } } }

  private static let tileSize = 1024
  private static let tile: CGImage = makeTile()
  private static let frames = 600                       // 10 s at 60 Hz before the sequence repeats
  private static let period: CFTimeInterval = 10.0

  private let snow = CALayer()
  private var installs = 0
  private var installedFor: CGRect = .zero
  private var fgObserver: NSObjectProtocol?
  private static let boilTickBudget = 120                // ≈2 s at 60 Hz; the link never outlives this
  private var boilLink: CADisplayLink?
  private var boilSample: CGRect?
  private var boilTicks = 0
  private final class BoilProxy: NSObject {
    weak var owner: DSPStaticView?
    @objc func tick(_ link: CADisplayLink) { owner?.boilTick() }
  }
  private let boilProxy = BoilProxy()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black                             // FF-16: the seat colour, never grey
    isUserInteractionEnabled = false
    snow.contents = Self.tile
    snow.contentsGravity = .resize
    snow.magnificationFilter = .nearest
    snow.minificationFilter = .nearest
    snow.actions = ["contentsRect": NSNull(), "bounds": NSNull(), "position": NSNull()]
    layer.addSublayer(snow)
    boilProxy.owner = self
    // Core Animation drops in-flight animations when the app is backgrounded; reinstall on return.
    fgObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.install(force: true)
    }
  }

  deinit {
    if let fgObserver { NotificationCenter.default.removeObserver(fgObserver) }
    boilLink?.invalidate()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin(); CATransaction.setDisableActions(true)
    snow.frame = bounds
    CATransaction.commit()
    if bounds != installedFor { install() }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      boilLink?.invalidate(); boilLink = nil
    } else {
      // A layout that ran before the window existed installed nothing; a
      // return to the window reinstalls what backgrounding removed.
      install(force: installs > 0)
    }
  }

  private func install(force: Bool = false) {
    guard !bounds.isEmpty, window != nil else { return }
    if !force && bounds == installedFor && snow.animation(forKey: "snow") != nil { return }
    installedFor = bounds
    installs += 1
    let scale = window?.windowScene?.screen.scale ?? max(traitCollection.displayScale, 1)
    let grainPx = max(1, grainPoints * scale)
    // A w×h (normalised) sub-rect of the tile is stretched over the layer: grain = layerPx / (w·tile).
    let w = min(0.5, (bounds.width * scale) / (grainPx * CGFloat(Self.tileSize)))
    let h = min(0.5, (bounds.height * scale) / (grainPx * CGFloat(Self.tileSize)))
    var values: [NSValue] = []
    values.reserveCapacity(Self.frames)
    for _ in 0..<Self.frames {
      values.append(NSValue(cgRect: CGRect(x: CGFloat.random(in: 0...(1 - w)), y: CGFloat.random(in: 0...(1 - h)), width: w, height: h)))
    }
    let a = CAKeyframeAnimation(keyPath: "contentsRect")
    a.values = values
    a.calculationMode = .discrete
    a.duration = Self.period
    a.repeatCount = .infinity
    a.isRemovedOnCompletion = false
    a.delegate = self                                    // animationDidStart → "S live"; never a completion block (it fires only on removal for an infinite animation)
    CATransaction.begin(); CATransaction.setDisableActions(true)
    snow.removeAnimation(forKey: "snow")
    snow.add(a, forKey: "snow")
    snow.contentsRect = values[0].cgRectValue
    CATransaction.commit()
    startBoilCheck()
  }

  public func animationDidStart(_ anim: CAAnimation) {
    onStaticLive(["t": CACurrentMediaTime() * 1000, "n": installs])
  }

  /// Two presentation-layer samples that differ = the render server is advancing the keyframes. Rows only;
  /// the link invalidates itself on the first difference or at the tick budget, and is not on any decision path.
  private func startBoilCheck() {
    boilLink?.invalidate()
    boilSample = nil
    boilTicks = 0
    let l = CADisplayLink(target: boilProxy, selector: #selector(BoilProxy.tick(_:)))
    l.add(to: .main, forMode: .common)
    boilLink = l
  }

  private func boilTick() {
    boilTicks += 1
    if boilTicks > Self.boilTickBudget { boilLink?.invalidate(); boilLink = nil; return }
    guard let rect = snow.presentation()?.contentsRect else { return }
    if let prev = boilSample, prev != rect {
      boilLink?.invalidate(); boilLink = nil
      onStaticBoil(["t": CACurrentMediaTime() * 1000, "n": installs])
      return
    }
    boilSample = rect
  }

  /// 1024² 8-bit grey noise in the Skia static's luma band (0.14…0.85 → 36…217), generated once per launch.
  private static func makeTile() -> CGImage {
    let n = tileSize * tileSize
    var bytes = [UInt8](repeating: 0, count: n)
    bytes.withUnsafeMutableBytes { arc4random_buf($0.baseAddress, n) }
    for i in 0..<n { bytes[i] = 36 &+ UInt8(UInt16(bytes[i]) * 181 / 255) }
    let data = CFDataCreate(nil, bytes, n)!
    let provider = CGDataProvider(data: data)!
    return CGImage(width: tileSize, height: tileSize, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: tileSize,
                   space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                   provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
  }
}
