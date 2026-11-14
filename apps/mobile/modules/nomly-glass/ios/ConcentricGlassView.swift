import ExpoModulesCore
import UIKit

final class ConcentricGlassView: ExpoView {
  private let materialView = UIVisualEffectView()
  var minimumCornerRadius: CGFloat = 32 {
    didSet { setNeedsLayout() }
  }
  var cornerMode: NomlyGlassCornerMode = .concentric { didSet { setNeedsLayout() } }
  var cornerRadius: CGFloat = 32 { didSet { setNeedsLayout() } }
  var glassStyle: NomlyGlassStyle = .regular { didSet { invalidateEffect() } }
  var colorScheme: NomlyGlassAppearance = .light { didSet { invalidateEffect() } }
  var material: NomlyGlassMaterial = .glass { didSet { invalidateEffect() } }
  var blurStyle: NomlyBlurStyle = .regular { didSet { invalidateEffect() } }
  var glassTintColor: UIColor? { didSet { invalidateEffect() } }
  var glassInteractive = false { didSet { invalidateEffect() } }
  var effectAnimationDuration: TimeInterval = 0
  private var effectNeedsUpdate = true
  private var transparencyObserver: NSObjectProtocol?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    materialView.isUserInteractionEnabled = false
    materialView.overrideUserInterfaceStyle = .light
    addSubview(materialView)
    transparencyObserver = NotificationCenter.default.addObserver(
      forName: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil, queue: .main
    ) { [weak self] _ in self?.invalidateEffect() }
  }

  deinit {
    if let transparencyObserver { NotificationCenter.default.removeObserver(transparencyObserver) }
  }

  private func invalidateEffect() {
    effectNeedsUpdate = true
    setNeedsLayout()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      materialView.effect = nil
    } else {
      invalidateEffect()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    materialView.frame = bounds
    guard window != nil else { return }

    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      // Copying the sheet's radius makes an inset card look more rounded than its container.
      let corners: UICornerConfiguration
      if cornerMode == .capsule {
        corners = .capsule()
      } else {
        let radius: UICornerRadius = cornerMode == .fixed
          ? UICornerRadius(floatLiteral: Double(cornerRadius))
          : .containerConcentric(minimum: insetAdjustedContainerRadius())
        corners = .corners(
          topLeftRadius: radius, topRightRadius: radius,
          bottomLeftRadius: radius, bottomRightRadius: radius
        )
      }
      cornerConfiguration = corners
      materialView.cornerConfiguration = corners
      updateEffectIfNeeded()
      return
    }
    #endif

    materialView.layer.cornerRadius = cornerMode == .capsule ? min(bounds.width, bounds.height) / 2 : cornerRadius
    materialView.layer.cornerCurve = .continuous
    materialView.clipsToBounds = true
    updateEffectIfNeeded()
  }

  private func updateEffectIfNeeded() {
    guard effectNeedsUpdate else { return }
    effectNeedsUpdate = false
    switch colorScheme {
    case .auto: materialView.overrideUserInterfaceStyle = .unspecified
    case .light: materialView.overrideUserInterfaceStyle = .light
    case .dark: materialView.overrideUserInterfaceStyle = .dark
    }
    materialView.isUserInteractionEnabled = glassInteractive
    let reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
    materialView.backgroundColor = reduceTransparency ? .secondarySystemBackground : .clear
    var effect: UIVisualEffect?
    if !reduceTransparency && material != .none {
      effect = UIBlurEffect(style: blurStyle.uiStyle)
      #if compiler(>=6.2)
      if #available(iOS 26.0, *), material == .glass {
        if glassStyle == .none {
          effect = UIVisualEffect()
        } else {
          let glass = UIGlassEffect(style: glassStyle == .clear ? .clear : .regular)
          glass.tintColor = glassTintColor
          glass.isInteractive = glassInteractive
          effect = glass
        }
      }
      #endif
    }
    let duration = UIAccessibility.isReduceMotionEnabled ? 0 : effectAnimationDuration
    if duration > 0 {
      UIView.animate(withDuration: duration) { self.materialView.effect = effect }
    } else {
      materialView.effect = effect
    }
  }

  #if compiler(>=6.2)
  @available(iOS 26.0, *)
  private func insetAdjustedContainerRadius() -> CGFloat {
    var ancestor = superview
    while let container = ancestor, !(container is UIWindow) {
      // Use public UIKit/Core Animation values; do not depend on private sheet view class names.
      let radius = max(container.effectiveRadius(corner: .allCorners), container.layer.cornerRadius)
      if radius > 0 {
        let cardFrame = convert(bounds, to: container)
        let leadingInset = max(0, cardFrame.minX - container.bounds.minX)
        let trailingInset = max(0, container.bounds.maxX - cardFrame.maxX)
        // Keep a consistent card shape even when it is far from the sheet's bottom corners.
        // The fallback is not a floor here: that would defeat smaller concentric radii.
        return max(1, radius - min(leadingInset, trailingInset))
      }
      ancestor = container.superview
    }
    return minimumCornerRadius
  }
  #endif
}
