# Development-client native UI capabilities

## Native UIKit header extension — next development client

See `NATIVE_HEADER_REQUIREMENTS.md` for the authoritative requirement: native
inline-large title and the same Account glass button share one existing header,
disappear/restore together on scroll, without a nested navigation stack.
The versioned Screens patch adds all title-display modes, navigation-item styles,
supported whole-bar minimization/restoration/safe-area controls and UIKit's bar
hiding options. The Search header is initialized in its route layout before the
first frame. Existing clients retain the SwiftUI fallback described below;
new capable clients no longer load that nested SwiftUI scene for Search.

This is a scoped public-API inventory, **not all Apple APIs**. New native modules
and APIs beyond the linked SDK still require a future binary. In particular,
UIKit title alignment is SDK/device iOS 27.2+ and is not claimed by the current
SDK 27.0 build. See the requirements document for the full capability matrix.

## Build boundary

This development client links the SDK-compatible `@expo/ui` **58.0.21** module,
not a hardcoded Search-header-only native view. Import components directly from
`@expo/ui/swift-ui` and modifiers from `@expo/ui/swift-ui/modifiers` to retain the
installed library's complete public surface. No application allowlist hides its
other components or modifier options.

Examples available to JavaScript after installing this binary:

- Native NavigationStack and Toolbar, including custom `largeTitle` items and
  leading/trailing/principal/bottom placements supported by the device OS.
- Native ScrollView, scroll geometry/phase/position, edge effects, keyboard
  dismissal, safe-area and layout modifiers.
- Native buttons, menus, forms, lists, pickers, toggles, text fields, sheets,
  confirmation dialogs, SF Symbols and their supported modifiers.
- GlassEffectContainer, glass effects, material backgrounds, shapes, tint,
  interaction, and available animation/transition modifiers.
- RNHostView for existing React Native content inside native SwiftUI layout.

This is **not every Apple SDK API**. OS availability and the installed Expo UI
version still apply. A new native library, unavailable native API or new Swift
implementation still needs another binary; changing exposed properties, layout,
colors or compositions can use Metro.

## Glass: style is separate from appearance

Existing `expo-glass-effect` also remains available, including GlassView and
GlassContainer. `regular` and `clear` are material styles; `light`, `dark` and
`auto` are independent color-scheme choices, not additional glass styles.

The existing concentric Account card now accepts `glass` configuration:

```tsx
<AccountGlassCard glass={{
  glassEffectStyle: "clear",
  colorScheme: "light",
  cornerMode: "concentric"
}}>{content}</AccountGlassCard>
```

Exposed configuration:

| Property | Values |
| --- | --- |
| glassEffectStyle | regular, clear, none |
| colorScheme | auto, light, dark |
| material | glass, frosted, none |
| blurStyle | ultraThin, thin, regular, thick, chrome (frosted material) |
| glassTintColor | React Native ColorValue |
| isInteractive | Native glass interaction property |
| cornerMode | concentric, fixed, capsule |
| cornerRadius | Nonnegative points for fixed corners |
| minimumCornerRadius | Positive fallback when no rounded container is found |
| animationDuration | 0–5 seconds; reduced motion disables effect animation |

`src/ui/NativeGlassSurface.tsx` is the reusable implementation; AccountGlassCard
is a compatibility export, not a separate native implementation.

Defaults preserve the working regular/light concentric surface. Concentric
geometry still subtracts the actual inset from the container radius. Reduce
Transparency uses an opaque system background. The Account wrapper's background
is non-touchable; interactive **controls** should use native Expo UI Button or
GlassView rather than assuming that a decorative background receives gestures.
Older installed clients ignore the new configuration and retain their existing
working card implementation. New calls must check capability versions when needed.

## Search scene and reusable focus extension

Current capable clients use the existing Router native stack, native search field,
shared Account button and `useSearchFocus` for tab-reselect keyboard behavior.
The page intentionally contains only preview boxes while its content is redesigned.

On October 26, 2026, the rejected catalog-search implementation was deleted:
result rows, category suggestions, filtering helpers, both obsolete results scenes,
their unused hooks and implementation-specific tests. The unused
`src/ui/nativeSearchable.ts` JavaScript adapter was also deleted. Older-client
header previews remain separate from those removed results implementations.

The compiled native `nomlySearchable` modifier and full Expo UI module remain
available; this cleanup does not remove capabilities from an installed binary or
require rebuilding it. Native focus/text command handling and module lifecycle
registration remain covered by source-contract tests. There is no active catalog
search/filtering behavior until a new implementation is explicitly introduced.

## Acceptance boundaries

JavaScript tests and autolinking are not native compilation or physical QA.
Check these on the new device build before accepting the scene:

- Title/account share the same vertical row and collapse together; no residual
  empty title area or opaque header; search remains native and usable.
- Entry/reselect/keyboard-dismiss/category selection behavior, including rapid taps.
- Menu results update and open customization without changing location scope.
- Account sheet opens/closes normally; Back and tab history remain intact.
- With a nonempty cart, SwiftUI scrolling still drives the existing native tab
  minimization/accessory; empty-cart transitions restore expected behavior.
- Safe areas, native edge effect, touch dispatch, result-height updates, rotation,
  Reduce Motion and Reduce Transparency.

The SwiftUI scene's interaction with the screens/tab controller is a physical
acceptance item, not an assumption. Do not compensate with custom tab bars,
private UIKit APIs, navigator remounts, or repeated speculative native builds.

## Local preflight

TypeScript, ESLint, mobile tests and native autolinking are run before submission.
`expo install --check` currently reports existing intentional version differences:
Sentry 8.31.0 vs ~8.28.0; Stripe 0.82.0 vs 0.81.0; React/react-dom 19.3.1 vs 19.3.0;
gesture-handler 3.4.0 vs ~3.3.0; @types/react-dom 19.3.0 vs ~19.2.3.
No suppressions or dependency downgrades are introduced here.

Verified locally for this slice: clean (non-incremental) TypeScript, ESLint,
**337 tests across 59 files**, frozen pnpm lockfile installation (lifecycle scripts
not rerun), iOS production Hermes export, native autolinking resolution/duplicate
verification, and `git diff --check`. The export is not native compilation.
Metro remains available on port 8081. Expo Router emits an existing package-export
resolution warning during export but bundling completes successfully.

EAS preflight resolves `Rawaq Dev`, beta bundle identity, version 1.4.0,
development-client/internal distribution, preview environment and the dev API.
The system EAS CLI is too old for the repository constraint; use the already
cached CLI 25.2.0. EAS deliberately disables dotenv loading during initial config
resolution, so the existing gitignored local identity environment must be loaded
into the command process (without printing or persisting its values).

EAS development build submitted: `2fbedd44-3ee7-43de-bfb2-c4ce446d7da1`
(internal iOS device build, not simulator). Initial submission status: NEW.
No native compilation or device acceptance result is asserted at submission time.
The existing documented bundle-parser override was used only after verifying
the beta bundle identity against the native project and preview app configuration;
no native identifier/signing configuration was changed.

No local native build, simulator/emulator, OTA update, store submission, production
deployment or production-data change is part of this work. The EAS development
profile uses internal distribution, preview environment, beta identity and Debug.

References: [Expo UI extension API](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/extending/),
[Toolbar](https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/toolbar/),
[Apple large-title placement](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/largetitle).
