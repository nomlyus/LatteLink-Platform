# Rawaq mobile SDK upgrades

## SDK 58 upgrade — October 19, 2026

This checkpoint supersedes the SDK 57 version inventory below. Existing uncommitted
navigation, cart accessory, Home and startup work on `develop` was preserved. No
backend/dashboard source, shared contract schema, production environment, identifier,
entitlement or payment-submission logic was changed.

### Resolved mobile runtime

| Dependency | SDK 57 baseline | SDK 58 installed |
| --- | --- | --- |
| Expo | 57.0.29 | 58.0.16 |
| Expo Router | 57.0.27 | 58.0.24 |
| React Native | 0.86.3 | 0.88.0 |
| React / React DOM | 19.2.3 | 19.3.1 |
| Screens | 4.26.2 | 4.30.0 |
| Reanimated | 4.5.1 | 4.7.1 |
| Worklets | 0.10.1 | 0.13.0 |
| Gesture Handler | 2.32.0 | 3.4.0 |
| Safe Area Context | 5.7.0 | 5.10.1 |
| DateTimePicker | 9.1.0 | 9.2.1 |
| React Query | 5.104.3 | 5.104.4 |
| Stripe RN | 0.82.0 | 0.82.0 (latest stable queried) |
| Sentry RN | 8.31.0 | 8.31.0 (latest stable queried) |
| Development client | 57.0.20 | 58.0.14 |
| Haptics | Not installed | 58.0.7 |
| Hermes compiler/native | 250829098.0.17 | 260318099.0.4 |

All directly used Expo modules now use their current stable SDK 58 versions.
`expo-symbols` is explicit because SDK 58 makes Android native-tab symbol support
optional. Explicit `@expo/dom-webview` 58.0.2 and `@react-native/metro-config` 0.88.0
resolve demonstrated strict-peer conflicts with old auto-installed peers. Mobile
ESLint is 10.13.0; React/DOM types are 19.3.0. Registry `latest` tags and peers were
checked, not inferred from old documentation. No prereleases were installed.

Not every package can safely take its newest major independently:

- TypeScript remains 6.0.3: shared typescript-eslint 8.71.2 explicitly supports
  `<6.1.0`; TypeScript 7.0.2 is outside its supported range.
- Babel stays on 7.29.7 / JSX transform 7.29.7, as required by the existing Expo,
  NativeWind and workspace Babel-7 toolchain/security override. No global Babel-8
  override or unrelated web migration was attempted.
- NativeWind 4.2.7 and css-interop 0.2.7 are the latest stable releases queried;
  css-interop requires Tailwind `~3`, so Tailwind remains 3.4.19 rather than 4.3.3.
- Zod stays 3.25.76 with the shared backend/mobile contracts. Zod 4 adoption would
  be a separate cross-contract migration, not a native navigation upgrade.
- Repository-wide pnpm 10.5.2, Node 22.23.3 and unrelated app tooling were retained.

### Required migration changes

- Native tabs use the stable `expo-router/native-tabs` entry point. Existing route
  paths, Account stack, cart store and regular/inline accessory lifetimes remain.
  SDK 58's JS-tab interface uses `emitter`/`navigateToTab(routeKey)` instead of a
  `navigation` prop; retained legacy presentation helpers follow that interface.
- RN 0.88's ScrollView refs use `ScrollViewInstance`. Removed the deleted StatusBar
  background-color prop; the existing screen background remains authoritative.
  Initial deep links normalize the newly optional `undefined` URL to `null`.
- Explicit `expo/tsconfig.base.json` fixes Vite's resolution through Expo's new
  package exports. No strict-API opt-out, typecheck suppression or skipped tests.
- Adopted Expo's scene lifecycle in the hand-maintained iOS project. AppDelegate
  provides the React factory; SceneDelegate (in the same registered source file)
  creates the window and starts React once through `ExpoAppSceneDelegate`. Info.plist
  declares the scene. Expo handles cold/warm URLs and user activities; old manual
  LinkingManager forwarding was removed to avoid double delivery. See the
  [official migration](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md).
- Real CocoaPods installation regenerated Podfile.lock and Xcode integration for
  SDK 58: 131 pods. Dynamic Stripe frameworks, source-built Expo modules, Apple Pay
  Swift/ObjC bridge, all deployment targets (16.4), schemes and ReleaseProduction
  configuration remain. Stripe SwiftPM still resolves 26.14.0. Privacy reason
  aggregation only reordered existing entries; the original order was retained.
- Default version/runtime are now 1.4.0; native Expo.plist matches. Development
  profile explicitly selects 1.4.0 so preview environment's old runtime cannot
  silently identify this client as SDK 57. EAS image now uses documented stable
  `macos-tahoe-26.6-xcode-27.0`. No remote build/environment change was made.
  Ignored local `.env.local` version/runtime overrides were advanced from 1.3.0
  to 1.4.0 without modifying other values. Beta/production explicit runtime inputs still require release review before a
  build/update. Never publish SDK 58 updates to SDK 57 runtime 1.3.0 or SDK 54.

### Verification and remaining findings

- Strict-peer install and subsequent frozen-lockfile strict-peer installation
  both passed. An initial frozen attempt correctly refused changed manifest
  specifiers; lockfile regeneration was intentional. Non-mobile lockfile importers
  were compared programmatically: no dependency version or specifier changes.
- Mobile TypeScript and ESLint passed. Final mobile/dependency lint/typecheck/test
  graph passed **35/35 tasks** (final forced run: zero cache hits), with **212 mobile tests / 37 files
  passed**, zero failures/skips, after native lockfile resolution and the additional
  runtime regression tests. Earlier intermediate tests correctly detected the old
  lockfile while CocoaPods was still running; no assertion was weakened.
- `pod install` and `pod install --deployment` passed, 131 pods. SwiftPM resolution
  passed with the existing Stripe 26.14.0 lock. iOS native codegen passed during
  installation; these are not full native compilation results.
- Autolinking verification passed: 43 modules, no duplicates. Expo config
  introspection and native plist/project syntax validation passed.
- Android codegen passed into `/tmp/nomly-sdk58-android-codegen`. This is not
  Android binary compilation; JDK 8 and missing Android SDK/project still block it.
- Production Hermes exports passed for both platforms, 53 assets, output
  `/tmp/nomly-sdk58-export`: iOS `index-18d8c064f3f6d7b330aa6767ca816c44.hbc`
  (7.7 MB), Android `index-b7ea5e0d4f26ab7c64e699075bdf44df.hbc` (7.9 MB).
  These are bytecode exports, not native builds or device acceptance.
- Expo Doctor 1.21.5: **18/20 passed**, exit 1. Findings remain visible: checked-in
  customized-native/config synchronization, and six version recommendations.
  Expo recommends older Sentry 8.28, Stripe 0.81, Gesture Handler 3.3, React/DOM
  19.3.0 and DOM types 19.2.3. Latest stable peers install successfully; this does
  not establish native/device compatibility. `expo install --check` exits 1 for
  these same recommendations. No exclusions/forced-peer installs were added.
- Latest Sentry probes removed `expo-router/build/global-state/router-store`;
  Metro warns while bundling. Its guarded lookup returns null when unavailable;
  baseline error capture remains wired, but automatic Router-specific route
  attribution may be degraded. Do not claim this integration is fully verified.
- CocoaPods reports the existing multiple-entitlement warning and a new upstream
  generated-provider warning for internal Expo `CoreModule`. Neither was hidden
  or patched. Native launch/signing must verify module/entitlement behavior.
- Local Xcode is still 26.3; supported-Xcode/full native compilation and physical
  device behavior are not established by passing JS checks. Android lacks modern
  JDK/SDK and a checked-in native project; no Android identity was invented.

### Actual native compilation attempt

Ran unsigned `Release` / beta compilation with the existing workspace/scheme,
`-destination 'generic/platform=iOS'`, two jobs, source packages in
`/tmp/nomly-sdk58-spm`, and derived data in `/tmp/nomly-sdk58-ios-build`.
Process-scoped local identity, app version 1.4.0, disabled signing and disabled
Sentry uploads were used. No device/simulator destination or production identity
was selected. Log: `/tmp/nomly-sdk58-ios-build.log`.

The build progressed through native dependency compilation, then **failed with
exit 65** because the selected Xcode 26.3 path became incomplete during the run:
`unable to spawn process .../Xcode.app/Contents/Developer/usr/bin/actool
(No such file or directory)` in StripePaymentsUI. A subsequent check also found
`xcrun` absent at the selected Downloads/Xcode.app path. The cause of those missing
toolchain files is unknown; no system toolchain selection was changed here.
Xcode 16.4 remains under Applications but is not a valid replacement for SDK 58.
SDK 58 documents Xcode 26.4+; the configured cloud image is Xcode 27.0.

This is **not a successful native build and not evidence of a Stripe source
defect**. ReleaseProduction was not redundantly attempted against the broken
toolchain. A complete supported toolchain/new development-client build and device
QA remain required. No compiler/concurrency/linkage checks were suppressed.

Metro's SDK 57 process was stopped before dependency replacement to prevent the
installed SDK 57 client from receiving SDK 58 JS. A new SDK 58 development binary
must be built and installed before resuming Fast Refresh. No simulator/emulator,
push, deployment, OTA publication, build submission, real charge or notification
send was performed. Existing physical-device acceptance checklist below still
applies, especially auth persistence, location isolation, gestures/sheets, images,
notifications, Stripe/Apple Pay, orders/loyalty and scene-based payment deep links.

### Account concentric glass and haptics — October 19, 2026

Added app-local `NomlyGlass` 1.0.0 for native iOS 26+ container-concentric
Account-summary corners, without patching Expo or hardcoding the sheet radius.
The old-client/older-iOS/Android fallback remains the existing GlassCard. Added
SDK-matched `expo-haptics` 58.0.7 with an optional best-effort helper; no controls
automatically vibrate. See `modules/nomly-glass/README.md` for ownership and QA.

Verification: **260 tests / 44 files passed**, mobile typecheck and scoped lint
passed, `git diff --check` passed, local podspec Ruby syntax passed, Apple
autolinking verification passed. Apple resolution detects NomlyGlass and
ExpoHaptics; Android resolution detects ExpoHaptics and excludes the Apple-only
glass module. These checks do not prove native compilation or device behavior.

Internal `development` / `preview` EAS build:
[332c8246](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/332c8246-7729-4b5e-9fa5-17e1261a37f9).
The build **finished successfully** with an installable internal iOS artifact.
Cloud CocoaPods installed NomlyGlass 1.0.0 and ExpoHaptics 58.0.7; native
compilation and signing passed. This supersedes the local-toolchain blocker for
this development build, but does not prove physical-device acceptance. Signed
installation, concentric corner appearance and physical haptics still require
verification. No local native build, simulator/emulator, push, production
deployment, store submission or OTA ran.

EAS preflight required loading existing ignored local preview identity variables
into the CLI process and the already-documented process-scoped bundle-identifier
override. The three native configurations were checked to reference the same
environment-provided identifier, matching the configured beta identity. No
identity, signing setting, production configuration or environment file changed.

#### Physical corner regression correction

Physical feedback after installing build 332c8246 identified square Account
summary corners: the native concentric radius could resolve to zero across RN
wrapper views. Compilation/signing success did not validate the visual result.
NomlyGlass 1.0.1 now provides corner API version 2, a positive configurable
minimum and public UIKit ancestor-radius resolution. JS bypasses the first
implementation, restoring the existing rounded native Expo GlassCard on that
installed client. Haptics are unchanged.

Correction [development build f46e73d3](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/f46e73d3-19c0-4001-a3fb-adc48e61b88c)
was submitted; native compilation and physical acceptance are pending at this
checkpoint. **263 tests in 45 files**, typecheck, scoped lint and diff checks
passed. Native-source contract assertions protect the positive-minimum wiring
but are not UIKit geometry tests. No local native build or simulator ran.

#### Inset correction after API 2 device feedback

Build f46e73d3 completed and the connected physical client reported corner API
version 2. The supplied screenshot showed the summary card looking more rounded
than its sheet. The ancestor-radius minimum copied the sheet radius without
subtracting the card inset. NomlyGlass 1.0.2 / API 3 now converts the card frame
to the rounded ancestor's coordinates and subtracts its horizontal inset; the
32-point fallback no longer clamps a valid smaller concentric radius. Sheet
configuration, content layout and haptics are unchanged.

Validation: **264 tests in 45 files**, mobile typecheck, focused source-contract
lint, podspec Ruby syntax and diff checks passed. Source assertions do not prove
UIKit geometry. A new EAS dev client and physical review at both detents are
required; API 2 clients cannot receive the Swift correction through Metro.

## Historical SDK 57 upgrade

The original cloud checkpoints below are historical. See **macOS native
acceptance follow-up — October 15, 2026** for the recovered local results and
current native integration changes.

## Baseline and scope

- Existing `develop` checkout, clean at start, HEAD `dde11e8`; refactor `d445be6` and review documentation `7556e15` preserved.
- Read `MOBILE_REFACTOR_PROGRESS.md`, `MOBILE_SOURCE_AUDIT.md` and `MOBILE_REGRESSION_REVIEW.md`. Baseline validation rerun: 35/35 tasks passed (32 cache hits), including 115 mobile tests; previous complete baseline includes 83 shared tests (198 total).
- Node 24.19.0; pnpm 10.5.2; workspace package manager and lockfile format retained. CI uses Node 22. Checked-in customized iOS project; Android project not checked in. No Ruby/CocoaPods/Xcode or Android SDK found initially; Java is installed.
- User constraints: no push/deployment, backend contract or unrelated project changes; retain disabled Dynamic Type, existing New Architecture policy and React Compiler off. Preserve the documented cart-change-during-payment risk without redesigning checkout.

## Authoritative research

- [SDK 57 release](https://expo.dev/changelog/sdk-57): stable latest registry version `expo@57.0.29`, React Native `0.86.3`, React `19.2.3`.
- [Upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
- [Expo upgrade skill](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-upgrade/SKILL.md), read completely; also read New Architecture and SDK 56 Router migration references. Upgrade directly from 54 to 57, avoiding the known Hermes V1 regression in SDK 56 and SDK 57 <=57.0.8. Target 57.0.29 also contains the 57.0.17 development-startup fix. Do not override Hermes or enable experimental Worklets Bundle Mode.
- SDK 57 minimum iOS target is 16.4. Preserve custom Apple Pay bridge, identities, entitlements and ReleaseProduction configuration; never clean-prebuild the tracked iOS project. Note SDK 57 prebuild is destructive by default: any diagnostic generation must use an isolated temporary copy, not this checkout.
- SDK 56+ Router owns navigation exports. Blur/notifications and other API changes will be checked against installed source/types. Xcode 27 requires a separate scene-lifecycle migration or a supported Xcode 26 build image.

## Dependency inventory (initial installed versions)

Every direct external dependency/devDependency in mobile, its shared workspace dependency packages, shared lint config and root tooling was queried against the public registry, including peer requirements. Table records installed versions, not only manifest ranges. Final column will be updated after installation.

| Package | Initial | Latest stable observed | Final / decision |
| --- | --- | --- | --- |
| `@eslint/js` | 9.39.3 | 10.0.1 | 9.39.5 (shared ESLint 9 consumers) |
| `@types/node` | 22.20.1 | 26.6.5 | 22.20.1 (CI Node 22 target) |
| `eslint` | 9.39.5 | 10.12.0 | 10.12.0 mobile; 9.39.5 root/shared consumers |
| `eslint-config-prettier` | 10.1.8 | 10.1.8 | 10.1.8 |
| `prettier` | 3.8.1 | 3.9.10 | 3.9.10 |
| `turbo` | 2.10.10 | 2.11.8 | 2.11.8 |
| `typescript` | 5.9.3 | 7.0.2 | 6.0.3 mobile; 5.9.3 root/shared generator |
| `vitest` | 4.1.11 | 5.0.4 | 5.0.5 mobile/root/relevant shared; legacy consumers remain 4.1.11 |
| `@callstack/liquid-glass` | 0.7.1 | 0.8.2 | Removed: no consumers; Expo glass used |
| `@devvie/bottom-sheet` | 0.4.4 | 0.5.0 | Removed: no consumers; Gorhom used |
| `@expo/metro-runtime` | 6.1.2 | 57.0.17 | 57.0.17 |
| `@expo/vector-icons` | 15.1.1 | 15.1.1 | 15.1.1 |
| `@gorhom/bottom-sheet` | 5.2.14 | 5.2.14 | 5.2.14 |
| `@react-native-community/datetimepicker` | 8.6.0 | 9.2.1 | 9.1.0 |
| `@react-native-picker/picker` | 2.11.4 | 2.11.4 | 2.11.4 |
| `@sentry/react-native` | 8.23.0 | 8.31.0 | 8.31.0 |
| `@stripe/stripe-react-native` | 0.66.0 | 0.82.0 | 0.82.0 |
| `@tanstack/react-query` | 5.100.14 | 5.104.3 | 5.104.3 |
| `expo` | 54.0.36 | 57.0.29 | 57.0.29 |
| `expo-apple-authentication` | 8.0.8 | 57.0.2 | 57.0.2 |
| `expo-blur` | 15.0.8 | 57.0.3 | 57.0.3 |
| `expo-constants` | 18.0.13 | 57.0.22 | 57.0.22 |
| `expo-crypto` | 15.0.8 | 57.0.4 | 57.0.4 |
| `expo-font` | 14.0.11 | 57.0.4 | 57.0.4 |
| `expo-glass-effect` | 0.1.9 | 57.0.4 | 57.0.4 |
| `expo-linear-gradient` | 55.0.8 | 57.0.2 | 57.0.2 |
| `expo-linking` | 8.0.12 | 57.0.13 | 57.0.13 |
| `expo-notifications` | 0.31.5 | 57.0.23 | 57.0.23 |
| `expo-router` | 6.0.24 | 57.0.27 | 57.0.27 |
| `expo-secure-store` | 15.0.8 | 57.0.4 | 57.0.4 |
| `expo-splash-screen` | 31.0.13 | 57.0.10 | 57.0.10 |
| `expo-updates` | 29.0.19 | 57.0.26 | 57.0.26 |
| `nativewind` | 4.2.4 | 4.2.7 | 4.2.7 |
| `react` | 19.1.0 | 19.3.1 | 19.2.3 |
| `react-dom` | 19.1.0 | 19.3.1 | 19.2.3 |
| `react-native` | 0.81.5 | 0.88.0 | 0.86.3 |
| `react-native-css-interop` | 0.2.2 | 0.2.7 | 0.2.7 |
| `react-native-gesture-handler` | 2.30.0 | 3.3.0 | 2.32.0 |
| `react-native-reanimated` | 4.1.6 | 4.7.1 | 4.5.1 |
| `react-native-safe-area-context` | 5.6.2 | 5.10.1 | 5.7.0 |
| `react-native-screens` | 4.16.0 | 4.30.0 | 4.26.2 |
| `react-native-worklets` | 0.5.1 | 0.13.0 | 0.10.1 |
| `zod` | 3.25.76 | 4.6.7 | 3.25.76 (shared backend/API contracts preserved) |
| `@babel/plugin-transform-react-jsx` | 7.29.7 | 8.0.1 | 7.29.7 (Expo Babel 7 toolchain) |
| `@expo/ngrok` | 4.1.3 | 4.1.3 | 4.1.3 |
| `@types/react` | 19.2.18 | 19.3.0 | 19.2.18 (React 19.2 line) |
| `@types/react-dom` | 19.2.3 | 19.3.0 | 19.2.3 (React 19.2 line) |
| `babel-preset-expo` | 54.0.12 | 57.0.15 | 57.0.15 |
| `tailwindcss` | 3.4.19 | 4.3.3 | 3.4.19 (NativeWind 4 peer requires ~3) |
| `typescript-eslint` | 8.59.4 | 8.71.2 | 8.71.2 |
| `openapi-typescript` | 7.13.0 | 7.13.0 | 7.13.0 |

## Work / verification record

- [x] Recover baseline and read required official research/skill.
- [x] Align SDK 57/native modules and modernize compatible direct packages (vendor exceptions below).
- [x] Migrate required source/native/configuration APIs.
- [x] Clean install; peer/native graph, Expo checks/Doctor, TypeScript/lint/tests, Metro/Hermes exports (findings below).
- [x] Feasible native validation and device-risk checklist (native compilation blocked by host).
- [x] Final diff review and local commits only.

SDK 57 implementation and feasible automated validation are complete. Native acceptance remains blocked until macOS pod resolution/compilation and device QA; no production readiness claim. This file is the recovery record.

### First implementation / verification checkpoint

- Strict-peer pnpm installation succeeded; no force flags, peer overrides, Expo version exclusions or Doctor suppressions added. Allowed the official Sentry CLI install script through pnpm's explicit build allowlist so release tooling is not silently skipped.
- Expo's supported `install --fix` was run. It aligned recommended versions but selected Sentry 7.11 and Stripe 0.64, both older than the baseline. Restored Sentry 8.31.0 and Stripe 0.82.0 after reviewing official vendor changelogs/peers. Stripe 0.64 predates PaymentSheet timeout/cancellation fixes in 0.65.1. These are custom-native builds, not Expo Go; the two SDK recommendation warnings remain visible. Vendor native compatibility still needs a Mac/device build.
- Mobile TypeScript 6.0.3 follows SDK 57. Shared generator packages remain on TypeScript 5.9.3 because openapi-typescript 7.13 requires `^5.x`; typescript-eslint 8.71 supports both. Latest TypeScript 7 is outside the parser's supported `<6.1.0` range. Mobile ESLint upgraded to 10.12.0; shared config now declares its supported ESLint 9/10 peer range, with parser 8.71.2. Root/shared legacy consumers keep ESLint 9.39.5 and its compatible @eslint/js 9 preset. Mobile, root and relevant shared test packages upgraded to Vitest 5.0.5 (5.0.4 was observed at first research; the stable range resolved the newer patch). The existing security override is scoped to the Vitest 4 line so unrelated suites stay pinned to 4.1.11; they are not silently forced to Vitest 5. Tailwind 3.4.19 is NativeWind 4's supported major, not Tailwind 4. React/animation/navigation modules follow SDK 57's tested versions rather than newer incompatible release lines. Zod 3.25.76 remains shared with backend contracts; no contract-wide Zod 4 migration.
- Removed unused `@callstack/liquid-glass` and `@devvie/bottom-sheet` after source/config/native/peer tracing. Current glass/sheets use expo-glass-effect and Gorhom, respectively.
- Replaced removed `StyleSheet.absoluteFillObject` with `StyleSheet.absoluteFill` (same absolute positioning); moved legacy splash configuration to expo-splash-screen plugin, retaining fullscreen containment; explicitly keep React Compiler false. Worklets Babel plugin replaces deprecated Reanimated plugin path. Removed obsolete Metro symlink override per Doctor.
- iOS minimum target 16.4 applied to Podfile/properties and all six Xcode configurations. SDK 57 AppDelegate factory setup no longer calls removed `bindReactNativeFactory`. Stripe 0.82 SPM integration requires dynamic frameworks; configured both bare Podfile properties and expo-build-properties for regenerated/native Android-independent configuration. Existing Apple Pay bridge, identity scripts, entitlements, schemes and custom ReleaseProduction configuration retained. Pinned the stable SDK 57 EAS Xcode 26.6 image to avoid accidentally opting into Xcode 27's required scene lifecycle migration.
- Post-migration Turbo: 35/35 tasks passed, **zero cache hits**. Autolinking verified 40 native modules, no duplicates. Expo Doctor 1.20.4: 19/21 checks passed; findings are bare/native-config synchronization and the two vendor-version recommendations. Schema, Metro, Hermes-regression, peer, native-support-package and React Native Directory checks pass. `expo install --check` reports only Sentry/Stripe recommendations, exit 1; not represented as passing.
- Initial CLI failures were environment-only: Expo needs its user cache under a writable path; scoped `__UNSAFE_EXPO_HOME_DIRECTORY=/tmp/rawaq-expo` and disabled telemetry. Node 24's `NODE_USE_ENV_PROXY=1` lets Doctor use the existing managed proxy; schema and directory checks then passed. No proxy bypass, TLS bypass, credentials or repo `.env` edits.
- `expo run:ios --no-install --no-build-cache` attempted and explicitly refused on Linux. No native compilation passed. CocoaPods lock regeneration and actual Stripe SPM framework embedding require macOS; do not mistake JS exports for that validation.

### Clean-install / final-validation checkpoint

- Clean installed from the frozen lockfile with strict peer checking: moved root/mobile node_modules to recoverable `/tmp/rawaq-sdk57-clean.beCaw5/`, then installed all 1,112 packages successfully. No lockfile regeneration, verification bypass or skipped required build script during this clean install.
- Removed only the obsolete SDK 54 `ios/Podfile.lock` (2,497 lines), recoverable from baseline Git `dde11e8`. Do not hand-edit native pod versions. A Mac must run `pod install` with the new Podfile and commit the resulting SDK 57 lock and any generated Stripe SPM/Xcode integration changes before native acceptance. No new native lock was fabricated on Linux.
- Native AppDelegate uses `@main` and SDK 57's factory setup; native codegen for **both** iOS and Android passed, including Stripe, Sentry, Worklets, Reanimated, Screens and pickers. Generated output is `/tmp/rawaq-sdk57-codegen`; this is code generation, not Swift/C++/Java compilation. No Android SDK/NDK/emulator is installed, so no Android native compilation result is claimed.
- Default app version and iOS runtime advanced from 1.2.0 to 1.3.0; checked-in Expo.plist matches. Explicit merchant `APP_VERSION` / `APP_RUNTIME_VERSION` remain supported unchanged. Merchant release inputs must advance to a new runtime; **never ship this upgrade as an SDK 54 OTA**. Release preparation's payload/metadata contract was not changed or silently prefixed.
- Removed deprecated notification `shouldShowAlert` while preserving banner/list/sound/badge decisions. Picker 9 uses `onValueChange`/`onDismiss`, preserving the previous current-date-on-dismiss callback behavior. Fullscreen splash legacy plugin support remains intentionally enabled for visual parity; startup InteractionManager remains a supported but deprecated baseline API pending device animation validation.
- Added focused regression tests for the fixed engine/config/native boundaries, explicit merchant runtime, notification presentation in active/background/inactive states, and standard fetch stream splitting/cancellation/poll fallback. These stream tests cover the WHATWG interface used by Expo's new default fetch; they do not simulate its native implementation.
- Vitest 5 now clears mock calls before each test. The new notification test initially relied on module-initialization call history; changed its test transport to retain the installed handler explicitly. No runner setting, application behavior or assertion was weakened.
- Reviewed the pnpm lock importers: no unrelated project changes to direct dependency versions or manifest ranges. Three web Next snapshots lose only an optional Babel peer suffix during re-resolution; their Next/React versions are unchanged. Shared package manifest changes are test-tooling only; no shared API/schema or backend/dashboard source changes.

## Additional explicit dependencies / build settings

| Item | Before | After | Reason |
| --- | --- | --- | --- |
| `@babel/core` mobile direct devDependency | implicit 7.29.7 peer | explicit ^7.29.7, locked 7.29.7 | Required Worklets/Babel peer, keep Expo's Babel 7 toolchain |
| `expo-build-properties` | absent | 57.0.22 | Reproducible iOS minimum/framework configuration |
| EAS CLI required minimum | >=16.0.0 | >=24.14.0 | Current stable CLI requirement; no remote EAS job started |
| pnpm | 10.5.2 | 10.5.2 | Repository/CI-wide package-manager pin preserved |
| iOS minimum | 15.1 | 16.4 | SDK 57 requirement; older iOS/device support necessarily changes |
| Default app / iOS runtime | 1.2.0 | 1.3.0 | Native runtime boundary; merchant inputs must also advance |
| EAS iOS image | SDK-selected | macos-tahoe-26.5-xcode-26.6 | Stable SDK 57 image, no Xcode 27 scene-lifecycle opt-in |

## Cloud verification results — prior checkpoint

| Check | Result |
| --- | --- |
| Clean frozen install, strict peers | Passed; 1,112 packages, Sentry CLI scripts executed |
| Mobile/dependency lint, typecheck, tests graph | 35/35 tasks passed; initial upgrade and modernized-toolchain runs were uncached, final mobile checks rerun after new tests |
| Mobile tests | 26 files / 124 tests passed (baseline 23 / 115) |
| Relevant shared tests | 83 passed under Vitest 5; 207 total final passing tests with mobile |
| Repository-wide lint/typecheck graph | 81/81 tasks passed across 34 packages, including required builds; 56 tasks freshly executed |
| Expo Doctor 1.20.4 | 19/21 pass, exit 1; two diagnosed findings below, not suppressed |
| Expo dependency check | Exit 1, only Sentry/Stripe recommendations below; Expo/RN/React/Router/animation modules and mobile TypeScript aligned |
| Expo introspection/schema/Metro | Passed; evaluated SDK 57 plugins and native mod configuration; obsolete Metro override removed |
| Native module duplicates / peers | Doctor and autolinking passed; 40 modules, no duplicates |
| Native codegen | iOS + Android passed into `/tmp/rawaq-sdk57-codegen`; not native compilation |
| Production iOS Hermes export | Passed; `/tmp/rawaq-sdk57-export-final/_expo/static/js/ios/index-5f55b20e438384a636d5306643338da7.hbc`, approximately 7.4 MB |
| Production Android Hermes export | Passed; `/tmp/rawaq-sdk57-export-final/_expo/static/js/android/index-3b04cc774bb4597abd935d173fa3d059.hbc`, approximately 7.7 MB |
| Exported assets | 53; includes new Router dependencies; not a measured performance comparison |
| Sentry release CLI | `sentry-cli 3.8.0` executed successfully; no event/upload initiated |
| iOS native build | Attempted; Expo explicitly rejects Linux. CocoaPods/Xcode unavailable, no compilation/signing claim |
| Android native build | No Android SDK/NDK/emulator; codegen only. Native package/release identity must be configured for a first Android build |
| Release classifier vs dde11e8 | Exit 2 as expected: **binary build required**, not an OTA candidate |
| Dynamic Type | Existing source-wide lock test passes; intentionally remains off |

### Explained Expo findings (not waived)

1. **Non-CNG native config synchronization:** the tracked iOS project is intentionally customized (Apple Pay bridge, merchant identity, ReleaseProduction). Expo config plugins do not automatically regenerate all tracked native fields during EAS builds. Required native template/Podfile/target/runtime changes were applied manually; identity scripts retained. Do not run SDK 57's destructive default prebuild on this project. Native project review and pod integration still require a Mac.
2. **Vendor version recommendations:** Expo recommends Sentry ~7.11.0 and Stripe 0.64.0; this app uses newer stable 8.31.0 / 0.82.0. Their vendor peers admit this RN/React/Expo combination, the SDK 57 Directory/native-support/peer checks pass, and both vendors pass native codegen plus application typecheck/bundling. Stripe's documented SPM/dynamic-framework requirement has been applied. **That evidence does not prove native linkage or payment behavior.** The warnings remain visible; no `expo.install.exclude`, Doctor skip list, peer-ignore flag or experimental engine workaround was introduced.

## Cloud acceptance blockers — recovery checklist

1. On macOS with the pinned Xcode 26.6 / supported CocoaPods, run `pnpm install --frozen-lockfile --strict-peer-dependencies`, then `cd apps/mobile/ios && pod install`. Review/commit the generated SDK 57 `Podfile.lock` and any Xcode/SwiftPM integration changes. Build both existing beta and ReleaseProduction configurations. Validate Stripe SPM frameworks are embedded (no `dyld` launch error), and the custom Apple Pay module is still registered.
2. Build Android with its merchant package ID, SDK/NDK/toolchain and credentials configured. The repository has no checked-in Android project; no Android identity/production config was invented here.
3. Supply fresh SDK 57 merchant app/runtime values, inspect native and resolved Expo runtime/identity consistency, and create new binaries. Never publish to the SDK 54 runtime. The checked-in default runtime is 1.3.0; existing environment-provided values were deliberately not edited. Xcode 27/iOS 27-SDK builds require Expo's scene-lifecycle migration before changing the pinned image.
4. Device customer journey: cold start/foreground/expired login/SecureStore recovery; cross-location cart invalidation; menu images (CDN/original/cache/failure); customization/pickers/sheets; totals/quotes; card/Apple Pay/3DS/cancel/retry/finalization timeout; order SSE/poll reconnect; loyalty; push registration/delivery. Cover real iOS and Android gestures, rotation/safe areas, backgrounds and notification permissions.
5. Profile actual device memory and startup behavior with Hermes V1 + Reanimated/Worklets. Installed Expo 57.0.29 / RN 0.86.3 contain the documented fixes; no physical-device memory measurement was possible.
6. The pre-existing cart/location-change-while-PaymentSheet-is-open risk is unchanged. No payment orchestration or backend contract rewrite was performed.

No push, deploy, publication, production credential/data change or unrelated application source edit occurred. SDK/package/source modernization is implemented and JS checks pass; **native acceptance remains incomplete**, with macOS/Android/device prerequisites explicitly identified above.

## Reproducing cloud verification

From the existing repository checkout (do not create a new branch/worktree):

```sh
mkdir -p /tmp/rawaq-pnpm-bin
corepack enable --install-directory /tmp/rawaq-pnpm-bin pnpm
export PATH=/tmp/rawaq-pnpm-bin:$PATH
export COREPACK_HOME=/tmp/lattelink-corepack
export XDG_DATA_HOME=/tmp/lattelink-data
export XDG_CACHE_HOME=/tmp/lattelink-cache
export EXPO_NO_TELEMETRY=1
export __UNSAFE_EXPO_HOME_DIRECTORY=/tmp/rawaq-expo
export NODE_USE_ENV_PROXY=1
CI=true pnpm install --frozen-lockfile --strict-peer-dependencies
CI=true pnpm exec turbo run lint typecheck test --filter=@lattelink/mobile... --concurrency=2 --output-logs=errors-only
CI=true pnpm exec turbo run lint typecheck --concurrency=2 --output-logs=errors-only
cd apps/mobile
CI=true pnpm exec expo install --check
CI=true pnpm dlx expo-doctor@1.20.4 --verbose
CI=true pnpm exec expo-modules-autolinking verify --verbose
CI=true EXPO_OFFLINE=1 NODE_ENV=production pnpm exec expo export --platform ios --platform android --output-dir /tmp/rawaq-sdk57-export-recheck --max-workers 2
```

Run checks individually: full `expo install --check` and Doctor intentionally return nonzero for the documented findings. Do not hide those exit statuses in an aggregate script or add skip lists. Proxy/cache variables above are only for this managed Linux environment; preserve the inherited proxy and CA trust. No auth token or credential value belongs in this file.

## Local commit record

- `56fc562` — SDK/native/tooling migrations, pnpm lockfile and focused tests. Parent is the completed refactor/review `dde11e8`.
- `docs(mobile): record SDK 57 verification and native acceptance blockers` — this full inventory, decisions, actual results and reproducible follow-up (its hash is in Git history).
- At the cloud checkpoint both were local on `develop`. This follow-up pulled
  them from origin; it does not push new work. No native build result beyond
  codegen was inferred from the cloud exports.

## macOS native acceptance follow-up — October 15, 2026

### Recovery and toolchain

- The existing `lattelink-platform` checkout was clean on `develop` at
  `574ac41`. Fetched and fast-forwarded `origin/develop` to `7ff3d6c`; verified
  `dde11e8`, `56fc562`, and `7ff3d6c` are present, with no newer remote commits
  at recovery. No new branch or worktree was created.
- Used Node **22.23.3**, Corepack **0.34.6**, and the repository-pinned pnpm
  **10.5.2**. `CI=true corepack pnpm install --frozen-lockfile
  --strict-peer-dependencies` passed, including workspace postinstall builds.
  `pnpm-lock.yaml` and dependency manifests are unchanged by this follow-up.
- CocoaPods **1.16.2** runs with Homebrew Ruby **4.0.1** (the system Ruby is
  2.6.10). Selected Xcode is **26.3 / 17C529**, with iPhoneOS SDK **26.2**;
  the other installed Xcode is 16.4. Expo's
  [SDK 57 support matrix](https://docs.expo.dev/versions/v57.0.0/) requires
  **Xcode 26.4+**, so this machine is below the documented supported minimum.
  The EAS Xcode 26.6 image pin remains unchanged; no remote build was submitted.
- No Android SDK, `sdkmanager`, `adb`, Gradle, or modern JDK was found. The only
  Java runtime is Java 8 and `javac` is unavailable. There is no Android native
  project or configured Android package identifier. No Android project was
  generated and no production identifier was invented.

### Confirmed integration fix and generated dependencies

The first real `pod install` failed: although the Podfile selected dynamic
frameworks, Expo 57's precompiled-module pre-install hook converted
React-Core-dependent pods, including `stripe-react-native`, into static
libraries. Stripe 0.82's SPM integration correctly rejected that linkage.

Set the supported `ios.usePrecompiledModules: false` build-properties option
and matching native `EXPO_USE_PRECOMPILED_MODULES: "false"`. This source-builds
Expo modules instead of applying that static-linkage conversion. It does not
disable Stripe SPM, change Hermes, disable New Architecture, change vendor
versions, or suppress the linkage check. React Native Core/dependency prebuilt
artifacts remain on their normal supported path. See the installed Expo
autolinking `precompiled_modules.rb#perform_pre_install` and
[Stripe's documented dynamic-framework requirement](https://github.com/stripe/stripe-react-native/tree/v0.82.0#ios-dependency-resolution).

- `pod install` then passed: **117 direct dependencies / 117 pods**, with 186
  pod/subspec entries in the generated lockfile. The lockfile and sandbox
  `Manifest.lock` match. Native source/script phases were reviewed.
- `pod install --deployment` also passed against that lockfile; no dependency
  resolution changes were required. Privacy-manifest aggregation changed only
  ordering of existing reasons; the original ordering was retained to avoid
  committing meaningless privacy changes.
- `xcodebuild -resolvePackageDependencies -workspace LatteLinkBeta.xcworkspace
  -scheme LatteLinkBeta -clonedSourcePackagesDirPath /tmp/rawaq-sdk57-spm`
  passed. Generated `Package.resolved` pins Stripe iOS **26.14.0** at
  `4cc854692674cd38e1efa0c7b3fe9a3f067ad116`.
- CocoaPods generated SDK 57 framework/resource references, the vendor's
  `[stripe-react-native] Embed SPM Frameworks` phase, the correct
  `ReleaseProduction` xcconfig, and RN 0.86.3 paths replacing the stale 0.81.5
  paths. These are actual installer output, not a hand-written lockfile.
- Custom Apple Pay Swift/ObjC sources, shared scheme, entitlement contents,
  app identifiers, and all six iOS deployment-target settings (16.4) are retained.
  CocoaPods warns that multiple entitlement files exist and it uses the first
  when generating Expo integration. The app configurations still explicitly use
  their original beta/production entitlement files; signing/device verification
  remains necessary.
- `expo-updates` emits a missing optional `expo-dev-client/package.json` probe
  during podspec evaluation; installation completes without that optional dev
  client. No unnecessary dev-client dependency was added to silence it.

Final installed versions remain **Expo 57.0.29, RN 0.86.3, React 19.2.3,
Reanimated 4.5.1, Worklets 0.10.1, Stripe RN 0.82.0, Sentry RN 8.31.0**.
The resolved Hermes native/compiler version is **250829098.0.17**. SDK 57's
memory/startup regression fixes remain present; no experimental Worklets mode
or custom Hermes switch was introduced.

### Automated verification on this Mac

| Command/check | Actual result |
| --- | --- |
| Frozen pnpm install with strict peers | Passed, exit 0 |
| CocoaPods install / frozen `--deployment` rerun | Both passed, 117 pods; lockfile and installed manifest match |
| SwiftPM dependency resolution | Passed; Stripe iOS 26.14.0 locked |
| `turbo run lint typecheck test --filter=@lattelink/mobile... --concurrency=2 --output-logs=errors-only` | Initial 35/35 tasks, zero cache hits; after native regression tests 35/35, 32 cached |
| Mobile tests | 26 files, **126 passed**, zero failed/skipped |
| Shared dependency tests | **83 passed**, zero failed/skipped; **209** total with mobile |
| Repository `turbo run lint typecheck --concurrency=2 --output-logs=errors-only` | **81/81 passed**, 74 cached after preserving stale ignored dashboard `.next/types`; final recheck 81/81 cached |
| Expo install compatibility check | Exit 1, recommendations remain visible (below) |
| Expo Doctor 1.20.4 `--verbose` | **19/21 passed**, exit 1, no exclusions or suppressions |
| `expo-modules-autolinking verify --verbose` | Passed, no duplicate native modules |
| `expo config --type introspect --json` | Passed, exit 0; schema and Metro checks also pass in Doctor |
| iOS codegen | Passed during CocoaPods installation |
| Android `generate-codegen-artifacts.js --path . --targetPlatform android --outputPath /tmp/rawaq-sdk57-mac-codegen-android` | Passed; not an Android native build |
| Final production Hermes export for both platforms | Passed, exit 0, 53 assets; output `/tmp/rawaq-sdk57-mac-export-final` |
| Native project/manifest `plutil -lint`, lockfile path review, `git diff --check` | Passed; no machine-absolute native lockfile paths or unintended source changes |

Exports used `CI=true EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 NODE_ENV=production
APP_VARIANT=local corepack pnpm exec expo export --platform ios --platform
android --output-dir /tmp/rawaq-sdk57-mac-export-final --max-workers 2`.
iOS bytecode is `index-5f55b20e438384a636d5306643338da7.hbc` (7.4 MB);
Android is `index-3b04cc774bb4597abd935d173fa3d059.hbc` (7.7 MB), matching the
cloud export filenames. Exports are not native compilation, signing or UI QA.

The first repository-wide check failed only on pre-existing ignored Next types
referring to the removed dashboard catch-all route. Preserved that directory at
`/tmp/rawaq-stale-dashboard-types.OoCf8X/types`; the recheck passed without
modifying dashboard/backend source or weakening TypeScript settings.

Doctor's two findings remain native/config synchronization and version
recommendations. As of this run, Expo also recommends newly published
**57.0.30 / Router 57.0.28**, in addition to the already documented older
Sentry ~7.11 / Stripe 0.64 recommendations. The Expo patch changelog lists no
user-facing changes. These were not silently installed while verifying the
pinned upgrade; the four recommendations are unresolved, not reported as a
passing dependency check. Native compilation, not peers/codegen alone, is
needed to accept the vendor versions.

### Native compilation results and remaining blockers

Inspected the actual workspace/project: one `LatteLinkBeta` app target/scheme,
with `Debug`, `Release` (beta), and `ReleaseProduction` configurations.
Both full-app attempts used the existing workspace and scheme, generic iOS
device destination, two build jobs, unsigned compilation, local-only identity
(`us.nomly.local`), app version 1.3.0, and disabled Sentry uploads. No merchant
release identity, asset or credential was replaced. Commands were:

```sh
# Run from apps/mobile/ios with Node 22 / pnpm 10.5.2 on PATH.
export APP_VARIANT=local APP_VERSION=1.3.0
export SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_NO_TELEMETRY=1
xcodebuild -workspace LatteLinkBeta.xcworkspace -scheme LatteLinkBeta \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/rawaq-sdk57-ios-build \
  -clonedSourcePackagesDirPath /tmp/rawaq-sdk57-spm \
  -disableAutomaticPackageResolution -jobs 2 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  IOS_BUNDLE_IDENTIFIER=us.nomly.local EXPO_PUBLIC_APP_DISPLAY_NAME='Nomly Local' build
# Same command, replacing Release with ReleaseProduction, was run separately.
```

- **Release / beta:** attempted full generic-device build. It stalled in Stripe
  resource asset compilation; after several minutes without progress it was
  explicitly interrupted (exit 75, `BUILD INTERRUPTED`). This is not a source
  failure or a passing native build. The later configuration got past asset
  processing, so the initial delay is not established as a permanent blocker.
- **ReleaseProduction:** package resolution, resource processing, native
  codegen, and native dependency compilation ran. Build **failed, exit 65** in
  `ExpoModulesCore`'s `ios/Core/Events/EventEmitter.swift`, lines 52 and 79:
  `sending 'emitter' risks causing data races`. The installed compiler is
  Apple Swift **6.2.4** in Xcode 26.3. This matches the
  [upstream Xcode 26.3 issue and minimum-version guidance](https://github.com/expo/expo/issues/48961)
  and [source-build reproduction](https://github.com/expo/expo/issues/47539).
  Supported Xcode **26.4+ / Swift 6.3**, preferably the pinned **26.6**, is
  required before another acceptance build. No unsafe Sendable wrapper,
  concurrency-check suppression, language-mode downgrade, vendor patch or
  native framework workaround was applied.
- **Android binary compilation:** not attempted, blocked by missing modern
  JDK/SDK/Gradle/native project and explicit merchant package configuration.
  Android codegen and production Hermes export passed, but neither is binary
  compilation.

No successful full native build, link, signing, install, launch, or Apple Pay
bridge runtime registration is claimed. Stripe/Sentry/native framework
embedding still needs a successful supported-Xcode build and device launch.
The initial asset delay's cause is not proven; the actionable compile blocker
is the documented unsupported Swift/Xcode version. No simulator/emulator was
booted or application launched; only dependency resolution and generic-device
build commands were used. Xcode's asset compiler uses its own platform helper
internally during device builds; that was not an app/simulator verification.

Native acceptance is **incomplete; not ready for physical-device QA binaries**.
Install/select supported Xcode and rerun both configurations; provision Android
tooling and legitimate release identity separately. Signing/device/live-service
acceptance remains outside the evidence from unsigned builds and JS exports.

### Runtime and physical-device safety

Default app version / iOS runtime remain **1.3.0**; checked-in Expo.plist and
config match. This shell has no explicit app/runtime/release-identity overrides,
and no mobile `.env` file exists beyond the example. Existing tests verify
explicit merchant overrides are preserved, so real release inputs must still
be checked for a fresh SDK 57 runtime before any build/update. Remote EAS
environment values and signing credentials were not fetched or changed.
**Never publish SDK 57 bytecode to an SDK 54 runtime.** Beta/production channel
separation remains unchanged; a channel name alone does not establish native
runtime compatibility.

After successful supported-toolchain native builds and signing, physical QA
still needs all of:

- [ ] Authentication persistence, cold start, expired-session recovery, Apple sign-in.
- [ ] Brand/location isolation, location switching, cart invalidation and quote scope.
- [ ] Navigation, gestures, sheets, safe areas and the intentionally disabled Dynamic Type.
- [ ] Menu images, fallback/cache behavior, modifiers/defaults, cart totals and authoritative quotes.
- [ ] Notification permission, registration, delivery and foreground/background behavior.
- [ ] Stripe card/3DS success, cancellation, decline, retry, deep-link return and timeouts.
- [ ] Apple Pay entitlement/merchant identity, custom bridge registration, payment-sheet behavior.
- [ ] Orders/history, realtime reconnect and loyalty balances/activity.
- [ ] Embedded Stripe dynamic frameworks at launch (including absence of `dyld` missing-library errors).
- [ ] Hermes/Reanimated/Worklets startup, memory, animations and interruptions on physical hardware.

No physical-device/live-payment/push QA, OTA publication, deployment, submission,
real charge, notification send, backend change, or production-data write is
part of this follow-up. The cart-change-during-payment architectural issue is
unchanged.

### Follow-up local commits

- `88434cd` — `fix(mobile): resolve SDK 57 native Stripe dependency integration`:
  supported source-build option, real CocoaPods/SwiftPM locks and generated
  Xcode integration, with two additional regression tests.
- The accompanying documentation commit records the Mac checks and the exact
  native acceptance blockers. Both commits are local on `develop`; no push,
  merge, deployment, publication or submission was performed.

## Physical-device development client (2026-10-16)

The first cloud beta build, **35**, finished successfully on the pinned Xcode
26.6 image: [EAS build c02eed65](https://expo.dev/accounts/yazandaoud/projects/lattelink-mobile/builds/c02eed65-4e20-4426-8137-d99cd626a999).
This establishes signed beta compilation, not physical-device acceptance. It
was not submitted to TestFlight or the App Store. Preview configuration was
explicitly updated to version/runtime **1.3.0**, with the existing Rawaq beta
identity and dev API; production configuration was unchanged.

Daily UI development uses a separate `development` EAS profile, not repeated
TestFlight builds. It includes `expo-dev-client` **57.0.20**, uses Debug/internal
ad hoc distribution, inherits Xcode 26.6 and the preview environment, and keeps
the existing beta bundle/Apple Pay identity. It displays **Rawaq Dev**. Because
it reuses the beta bundle identifier, installing it replaces an installed Rawaq
beta, not the production app; their beta-local data is not isolated from each
other. No new production identifiers or payment credentials are created.

`EAS_BUILD_PROFILE=development` maps to the existing `beta` app variant in the
shared native identity resolver and asset-sync step. A development profile
cannot select the production variant, and full merchant identity validation
still applies. The custom AppDelegate already supports the Expo dev launcher;
the custom Apple Pay bridge, dynamic frameworks, deployment target, schemes,
and ReleaseProduction configuration are retained. The native plist declares
local network access and `_expo._tcp` discovery for Metro. No prebuild is used.

One-time local environment setup from `apps/mobile` (requires Expo login):

```sh
APP_VARIANT=local EXPO_SLUG=lattelink-mobile \
EAS_PROJECT_ID=18320a67-0f15-4860-9f84-845eb0f4c31c \
npx --yes eas-cli@24.14.0 env:pull --environment preview --path .env.local --non-interactive
```

`.env.local` is ignored by Git. This pulls the existing preview configuration;
the Sentry upload secret is intentionally unavailable and is not needed to run
Metro. Do not copy production environment values into this file.

After installing the development build on a registered physical iPhone:

```sh
pnpm dev:client --scheme lattelink
```

Use the same Wi-Fi network, allow local-network access, and scan Metro's QR
code with the iPhone. If LAN access is blocked, append `--tunnel`. The explicit
scheme matches the existing native `$(EXPO_SCHEME)` value in preview; there is
no generated-native-project dependency. Enable iOS Developer Mode if prompted.
Saving JS/TS/styles uses Fast Refresh. Native dependency/code/configuration
changes require another development build. Neither command submits an app,
publishes an OTA update, or launches a simulator.

The native project uses environment-valued bundle/version settings. Xcode
resolves those correctly, but EAS's static parser does not. Cloud build
invocations must first verify resolved Xcode settings, then supply the
process-scoped `EAS_DANGEROUS_OVERRIDE_IOS_BUNDLE_IDENTIFIER` matching that
verified beta identity; this does not change native signing settings. EAS may
display `$(APP_VERSION)` in build metadata even though Xcode resolves 1.3.0.

Development build signing/install remains pending device registration and
an ad hoc provisioning profile containing that device. Do not claim a dev
client build or live Fast Refresh passed until those steps actually complete.
