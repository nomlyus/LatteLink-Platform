# Rawaq mobile SDK 57 upgrade

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

## Final verification results

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

## Required native/device follow-up — acceptance blockers

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
- Both remain local on `develop`. No native build result beyond codegen was inferred from passing exports.
