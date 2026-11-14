import ExpoModulesCore
import UIKit
import ExpoUI

public final class NomlyGlassModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NomlyGlass")
    Constant("cornerConfigurationVersion") { 3 }
    Constant("glassConfigurationVersion") { 1 }
    Constant("nativeHeaderConfigurationVersion") {
      // Verify our public extension is actually in the linked Screens binary.
      guard let header = NSClassFromString("RNSScreenStackHeaderConfig") as? NSObject.Type else { return 0 }
      return header.instancesRespond(to: NSSelectorFromString("setLargeTitleDisplayMode:")) ? 1 : 0
    }
    Constant("supportsNativeBarMinimization") {
      #if compiler(>=6.4)
      if #available(iOS 27.0, *) { return true }
      #endif
      return false
    }
    Constant("nativeSearchSceneVersion") {
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) { return 1 }
      #endif
      return 0
    }

    OnCreate {
      ViewModifierRegistry.register("nomlySearchable") { params, appContext, dispatcher in
        try NomlySearchableModifier(params: params, appContext: appContext, dispatcher: dispatcher)
      }
    }
    OnDestroy { ViewModifierRegistry.unregister("nomlySearchable") }

    Constant("supportsConcentricCorners") {
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) {
        return NSClassFromString("UIGlassEffect") != nil
      }
      #endif
      return false
    }

    View(ConcentricGlassView.self) {
      Prop("glassEffectStyle") { (view, value: NomlyGlassStyle?) in view.glassStyle = value ?? .regular }
      Prop("colorScheme") { (view, value: NomlyGlassAppearance?) in view.colorScheme = value ?? .light }
      Prop("material") { (view, value: NomlyGlassMaterial?) in view.material = value ?? .glass }
      Prop("blurStyle") { (view, value: NomlyBlurStyle?) in view.blurStyle = value ?? .regular }
      Prop("glassTintColor") { (view, value: UIColor?) in view.glassTintColor = value }
      Prop("isInteractive") { (view, value: Bool?) in view.glassInteractive = value ?? false }
      Prop("cornerMode") { (view, value: NomlyGlassCornerMode?) in view.cornerMode = value ?? .concentric }
      Prop("cornerRadius") { (view, value: Double?) in
        let radius = value ?? 32
        view.cornerRadius = CGFloat(radius.isFinite ? max(0, radius) : 32)
      }
      Prop("animationDuration") { (view, value: Double?) in
        let duration = value ?? 0
        view.effectAnimationDuration = duration.isFinite ? min(5, max(0, duration)) : 0
      }
      Prop("minimumCornerRadius") { (view, value: Double?) in
        let radius = value ?? 32
        view.minimumCornerRadius = CGFloat(radius.isFinite ? max(1, radius) : 32)
      }
    }
  }
}
