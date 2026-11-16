# Nomly native glass

## Header extension in 1.2.0

This module also advertises `nativeHeaderConfigurationVersion` **only when the
linked Screens class implements the pinned native header extension**.
`supportsNativeBarMinimization` is SDK/device gated. The actual header is owned
by Screens/UIKit, not an additional view/controller in this module. Its pnpm
patch extends Fabric props/public types and uses Android no-op setters for the
iOS-only additions. It adds no permission, identifier or payment changes.

See [`NATIVE_HEADER_REQUIREMENTS.md`](../../docs/NATIVE_HEADER_REQUIREMENTS.md) and [`NATIVE_UI_CAPABILITIES.md`](../../docs/NATIVE_UI_CAPABILITIES.md)
for the explicit scope, API inventory, one-stack title/Account scroll requirement,
availability limitations and physical-device acceptance gates. Earlier build
notes below are historical, not verification of this header extension.

App-local Expo module, discovered from `apps/mobile/modules` by Expo autolinking.
It adds no permissions and changes no app identifier, entitlements, payments or
navigation. Do not add the Swift files directly to the application Xcode target;
the local `NomlyGlass` pod owns them.

## Why native code

The installed Expo GlassView supports numeric corner radii, not UIKit's
`UICornerRadius.containerConcentric(minimum:)`. This view uses the latter on iOS 26+
with native `UIGlassEffect(.regular)`. UIKit calculates the card's corners relative
to its container and inset. Concentric corners are not necessarily numerically
equal to the sheet radius: the inset is intentionally accounted for.

The first native build allowed a zero radius in the RN container hierarchy,
which produced square corners on the physical phone. Version 1.0.1 advertises
`cornerConfigurationVersion = 2` and adds a strictly positive, JS-adjustable
minimum. It reads the nearest rounded ancestor using public UIKit
`effectiveRadius(corner:)` / Core Animation values, falling back to 32 points if
no rounded ancestor can be resolved. No private class names or hardware-radius
lookup tables are used. The first native implementation is bypassed in JS,
restoring the existing rounded native Expo GlassCard until the corrected client
is installed. Source-contract tests protect this wiring; they do not substitute
for native compilation or device testing.

The React wrapper must not clip the view with a fixed-radius rounded rectangle.
The sheet keeps its system-default corner radius. Content and actions remain
React-owned; the native view is a noninteractive background only.

## Build and fallback

A new **EAS development client** is required. No simulator or local native build
is required or permitted for this workflow. The current installed client falls
back to the previous GlassCard until it includes `NomlyGlass` API version 2. Android and older
iOS versions retain the existing card fallback. Do not publish a native-dependent
OTA update to an older binary.

Expo Haptics `~58.0.7` is installed alongside this module. `src/ui/haptics.ts`
exposes selection, soft impact and success/warning/error feedback using native
platform APIs. It does not automatically vibrate any controls. Call it only in
response to deliberate interactions, never as a prerequisite for a successful
business action. The helper is a no-op on old clients without ExpoHaptics and on
web; native failures are swallowed. OS settings/hardware may suppress feedback.

## Verification boundary

Autolinking discovery, JavaScript tests, lint and typecheck do **not** establish
native compilation or physical-device behavior. Verify compilation in EAS, then
on an iOS 26/27 phone verify: card corners inside the sheet at both detents;
rotation if supported; sheet dismissal/re-entry; readable Reduce Transparency
appearance; retry-button touch handling; no crashes on older binaries; haptics
with device settings enabled and suppressed. No haptic is wired to a live
interaction yet.

The internal iOS development build [332c8246](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/332c8246-7729-4b5e-9fa5-17e1261a37f9)
finished successfully on October 19, 2026, including cloud native compilation,
signing and an installable artifact. Mobile validation passed 260 tests across
44 files, typecheck, scoped lint and diff checks. Autolinking verified both Apple
pods and Android Haptics. Physical verification subsequently found square card
corners; successful compilation did not establish correct geometry.

Correction build: [f46e73d3](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/f46e73d3-19c0-4001-a3fb-adc48e61b88c).
It contains module 1.0.1 / corner API version 2. At submission, native compilation
and device acceptance are pending. Regression verification passed 263 tests in
45 files, typecheck, scoped lint and diff checks. Until corrected native support
is installed, the JS capability gate restores the previous rounded native Expo
glass rather than using the known-square implementation.

### Inset correction (1.0.2 / corner API 3)

Build f46e73d3 finished and the connected phone reported API version 2. A supplied
device screenshot then showed the summary card looking more rounded than the
sheet. API 2 copied the ancestor radius into the minimum without subtracting the
card's inset, so it prevented UIKit from choosing a smaller, concentric curve.
API 3 converts the card bounds into the rounded ancestor's coordinates and
subtracts the smaller horizontal inset from its resolved radius. The 32-point
fallback applies only when no rounded ancestor is found, not as a floor on the
inset-adjusted radius. UIKit still owns the glass material and adaptive corners;
the sheet radius and JS layout remain unchanged. Existing API 2 clients continue
to run but require a new EAS client to receive this native correction.

Source-contract tests guard coordinate conversion and removal of the old radius
clamp. They are not UIKit geometry tests: a fresh EAS build and physical checks
at both sheet detents remain required before claiming visual acceptance.
