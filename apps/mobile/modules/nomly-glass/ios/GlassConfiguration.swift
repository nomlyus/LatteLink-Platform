import ExpoModulesCore
import UIKit

enum NomlyGlassStyle: String, Enumerable { case regular, clear, none }
enum NomlyGlassAppearance: String, Enumerable { case auto, light, dark }
enum NomlyGlassCornerMode: String, Enumerable { case concentric, fixed, capsule }
enum NomlyGlassMaterial: String, Enumerable { case glass, frosted, none }
enum NomlyBlurStyle: String, Enumerable {
  case ultraThin, thin, regular, thick, chrome

  var uiStyle: UIBlurEffect.Style {
    switch self {
    case .ultraThin: return .systemUltraThinMaterial
    case .thin: return .systemThinMaterial
    case .regular: return .systemMaterial
    case .thick: return .systemThickMaterial
    case .chrome: return .systemChromeMaterial
    }
  }
}
