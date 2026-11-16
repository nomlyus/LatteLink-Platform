# Native Apple header: build requirement and acceptance contract

## Required design — do not lose this during future work

The target is the Apple Music Search layout, adapted to Rawaq:

1. A **native inline-large title**, near the status bar, not below an empty
   compact navigation row.
2. The existing **native Account glass button in the same row**, same sizing,
   tint and Account-sheet destination as the rest of the app.
3. **Title and Account disappear together on scroll**, and restore together,
   under one native navigation-bar lifecycle. Do not animate them independently.
4. Native scroll-edge protection. A future native search field must remain
   accessible; do not reintroduce a custom JS search bar or unrequested autofocus.
5. One existing navigation stack. No nested SwiftUI NavigationStack, custom JS
   title masquerading as native, guessed negative offsets, navigator remounts,
   status-bar overrides or alternate Account navigator.
6. Keep the neutral boxes for physical scroll testing before adding real content.

## What this build actually exposes

There is no safe, finite bridge for **all Apple APIs**. No arbitrary selector/KVC
gateway or private UIKit API is added. This inventory covers the navigation,
scrolling, search, materials and presentation domains relevant to this app.
The full installed Expo UI public surface remains linked; app wrappers must not
hide its supported options unnecessarily.

| Domain | Exposed surface | Build/OS boundary |
| --- | --- | --- |
| Native UIKit title | Existing title/font/color plus automatic, always, never, inline modes; inherit preserves upstream boolean semantics | Inline iOS 17+; existing app minimum 16.4 falls back to always |
| Navigation-item style | navigator, browser, editor | iOS 16+ |
| Whole-bar minimization | automatic, never, onScrollDown, onScrollUp | SDK/device iOS 27+ |
| Whole-bar restoration | automatic, atScrollEdge | SDK/device iOS 27+ |
| Safe-area adjustment during minimization | automatic, enabled, disabled | SDK/device iOS 27+ |
| Existing UIKit bar hiding | swipe, tap, keyboard appearance, vertically compact orientation | Independent exposed controls; do not enable competing hide systems together |
| Account/header actions | Existing native SF Symbols, isolated/shared glass backgrounds, buttons, menus, disabled state and handlers | Existing React Navigation/Screens header item API; Account itself is unchanged |
| Native search | Existing native-stack search field options/commands and Expo UI searchable; the versioned custom modifier adds native focus/presentation and text commands | Use the appropriate native owner; preserve entry/reselect behavior |
| Native edge effects | soft/hard/automatic/hidden for supported edges through installed Screens options; native SwiftUI scroll modifiers also remain available | OS availability applies; no ScrollViewMarker/Gamma opt-in |
| Native tabs/cart | Existing system roles, minimization modes, regular/inline accessories and placement, icons and appearance | Existing installed Router/Screens APIs; bottom-tab behavior remains independently cart-driven |
| Glass | regular/clear/none, light/dark/auto, tint, native interaction, frosted material variants, concentric/fixed/capsule geometry, effect animations | `NativeGlassSurface`, Expo GlassEffect and full Expo UI; availability/reduced-transparency fallbacks apply |
| Native sheets | Existing form-sheet presentation, detents, grabber, gestures, background and native header options | Existing stack API; preserve Account geometry and navigation |
| Wider native UI | Full installed `@expo/ui` SwiftUI components and modifiers | Version 58.0.21 public surface, not the entire Apple SDK |

**Known exclusion:** Apple's navigation title alignment API is documented as
iOS/SDK **27.2+**. The current supported EAS image is SDK **27.0**. A device OS
update cannot add an API omitted by an older linked SDK; that future API would
require a future SDK build. Do not falsely advertise it as covered now.

## Implementation boundary

`patches/react-native-screens@4.30.0.patch` extends the existing native header
configuration, its Fabric schema, public source types and shipped declarations.
The dependency version is unchanged. pnpm applies the version-pinned patch on
local and EAS installs; native codegen must include the new props. Revisit this
patch when upgrading Screens and prefer an equivalent upstream API when available.

`NomlyGlass.nativeHeaderConfigurationVersion` verifies that the linked native
header class responds to our extension's setter before advertising support.
`supportsNativeBarMinimization` reflects the compiled SDK and device OS.
JavaScript options are typed in `src/navigation/nativeAppleHeader.ts` and passed
through Router's existing `unstable_nativeProps.headerConfig` extension seam.

New capable clients synchronously render `NativeAppleSearchPreview` with the
existing stack. The native Account bar item is reused. There is no first-tap
dynamic import, extra navigation controller or feature-specific scroll listener
on this path. The old SwiftUI experiment remains only as the existing-client
fallback until the replacement binary is accepted; it is not the architecture
of the new header.

On iOS 27, native whole-bar minimization owns hide/restore. Older supported iOS
uses the native swipe-hide mechanism instead. Other screens retain defaults;
role/location/auth/cart/order/payment behavior is not changed by this patch.

## Build and acceptance gates

Before one EAS development build: frozen lockfile/patch application, nonincremental
TypeScript, ESLint, mobile tests, Fabric codegen, native autolinking/duplicates,
Hermes bundling, diff review, sanitized beta/dev identity and signing preflight.
No local native compilation, simulator/emulator, production deployment, OTA or
store submission. Native compilation is proven only by EAS success—not codegen,
source review or a Hermes export.

After installing that binary, physically verify:

- First entry has the inline title and native Account together; no `index` flash,
  white loading gap or duplicate header. Compare actual position with the reference.
- Scroll down/up and to both edges: title **and Account** hide/restore together;
  there is no invisible tappable Account button left behind.
- Native scroll-edge blur covers the control area correctly.
- Account opens the same sheet/subpages; native Back, swipe dismissal, session
  and location continuity remain correct.
- Native tab/cart minimization remains functional with empty/nonempty carts;
  changing tab while minimized preserves history and screen state.
- Reduce Motion/Transparency, keyboard, rotation and repeated navigation do not
  create jumpy layouts, duplicate runtimes or conflicts between native hide systems.

Exact hide/restore visuals remain **unverified until device acceptance**. If the
public APIs cannot produce the required interaction, report the limitation before
another paid build. Do not promise every future native feature will be JS-only.

## Primary API references

- [UIKit inline title](https://developer.apple.com/documentation/uikit/uinavigationitem/largetitledisplaymode-swift.enum/inline)
- [Bar minimization behavior](https://developer.apple.com/documentation/uikit/uibarminimizationbehavior)
- [Navigation bar minimization](https://developer.apple.com/documentation/uikit/uinavigationitem/navigationbarminimization-1kj9z)
- [Title alignment availability](https://developer.apple.com/documentation/uikit/uinavigationitem/titlealignment-swift.property)
- [React Navigation native stack](https://reactnavigation.org/docs/native-stack-navigator/)

See `NATIVE_UI_CAPABILITIES.md` for the existing Expo UI/glass build capabilities.

## Pre-submission results for this extension

- Clean non-incremental TypeScript, full mobile lint, **354 tests in 65 files**,
  and `git diff --check`: passed.
- Frozen pnpm 10.5.2 install with the pinned patch: passed. No dependency
  upgrades or ignored peer/force flags were needed for this extension.
- iOS and Android Fabric code generation: passed; the generated header props
  include the extension. Android's generated setters have matching explicit
  no-op implementations. This is not Android or iOS native compilation.
- Native autolinking/duplicate verification: passed. Expo UI 58.0.21 and
  NomlyGlass 1.2.0 are detected.
- Production-mode iOS and Android Hermes exports: passed. These are not native
  builds and do not prove native header visuals.
- Native modules remain source-built (`EXPO_USE_PRECOMPILED_MODULES=false`),
  with the existing dynamic frameworks and deployment target 16.4 preserved.
- Sanitized EAS preflight: development client, internal distribution, preview
  environment, Rawaq Dev/beta identity, dev API, Debug and Xcode 27.0 image.

No local native compilation or simulator/emulator was run. No push, deployment,
OTA publication, store submission, payment operation or production write occurred.

EAS development build submitted once: `aebdf7e5-e704-429b-a0b8-b384183df2fb`
([build page](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/aebdf7e5-e704-429b-a0b8-b384183df2fb)).
Initial status: NEW; internal physical-device iOS development client, not simulator.
Native compilation and physical scroll acceptance remain pending at submission.
No automatic retry build is authorized by this record.

## Restoration-edge investigation — October 20, 2026

The installed client now detects the new header bridge. Clearing Metro's stale
component transformation made the new Fabric attributes available; the owner
confirmed inline title/Account alignment and minimization work.

A hard edge remains visible during partial bar restoration. Standard/large-title
shadow suppression, explicit scroll-edge transparency, enclosing-screen soft
edges, hiding the scroll-edge effect, and disabling safe-area adjustment did not
remove it in reported phone checks. Swipe hiding was visibly buggy and reverted.
The temporary pink/cyan backgrounds distinguished standard and scroll-edge
appearances in the supplied recording; diagnostic colors are now removed.

The pinned Screens patch now normalizes zero-alpha standard background colors to
nil, matching its existing scroll-edge handling, and explicitly supplies the
compact scroll-edge appearance. This addresses an appearance consistency issue,
but is a **native fix candidate, not a verified resolution of the observed edge**.
Source-contract tests cannot verify UIKit's rendering. This addition is not in
the installed binary and cannot be delivered through Metro. No further EAS build
has been started or is authorized by this note; native compilation and a repeat
of the partial-scroll device check are still required before calling it fixed.

Follow-up: EAS development build `fc24797b-8f25-4273-b2dd-95902b123b9d`
was explicitly requested and submitted. After installing the new build, the owner
reported no visible improvement. A connected runtime check confirmed the current
header receives inline title mode, on-scroll-down minimization, transparent
standard/scroll-edge backgrounds and both shadow-hide flags. This does not inspect
UIKit's actual view hierarchy or independently identify the installed EAS artifact.
The appearance-consistency patch did **not** establish a fix for the edge. Do not
repeat the same settings experiments or request another paid build without new
native-layer evidence. The restoration-edge issue remains unresolved.
