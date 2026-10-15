# Rawaq mobile refactor progress

## Scope and recovery

Working branch: `develop`; recovered base: `341d304` (font scaling intentionally disabled). No branch/worktree changes, backend changes, dependency upgrades, publishing, or deployment. Local commits authorized. Existing uncommitted mobile changes belong to this session and are preserved.

Recovered extractions: cart primitives; checkout primitives; order thumbnails and presentation helpers; orders history primitives; menu section builder/header; home news tag; customization footer/image/modal states; Stripe return URL and history mapping. Previous lint/typecheck and 18 files / 96 tests passed. Those checks do not establish visual equivalence.

## Initial metrics

Recovery snapshot: 84 runtime source files (`app`/`src`, TS/TSX/CJS, excluding declaration-only files), 16,966 physical lines. Largest: OrdersScreen 850, cart 702, checkout 647, MenuScreen 614, LiquidGlassPillTabBar 601, HomeScreen 585, menu-customize 554. No multi-thousand-line source files. Graph tracing of relative imports/re-exports found no cycles. Final comparisons use this same metric (formatting can increase LOC).

## Decisions

- Preserve exact styles and business behavior; source comparison against HEAD precedes accepting previous extractions.
- Keep Expo Router entry points, platform/native/build integrations, and intentionally locked Dynamic Type.
- Feature components belong to their feature. Extract complex state lifecycles as hooks; small cohesive helpers may stay local.
- Remove styles only after AST/reference checks; removal of exports requires whole-repository tracing.
- Validate incrementally, with full mobile checks and both production bundles at the end when feasible.

## Audit coverage and work queue

- [x] Recover branch, status, history, previous diff, architecture/tooling, source inventory, dependency graph.
- [x] Presentation extraction parity and dead style cleanup. Restored original definitions; AST comparison of 269 extracted styles across 20 target modules found zero differences against `341d304`.
- [x] app routes: root/tabs, auth/profile, cart/checkout/outcomes, order/refund details, account routes.
- [x] src: account, api, auth, brand/config, cart, components, home, legal, location, menu, navigation, notifications, observability, orders, screens, theme, ui.
- [x] native, build/config/scripts/assets, tests and shared-package consumers reviewed for references and integration boundaries. Native source/config/assets preserved; no native runtime test claimed.
- [x] Focused domain tests, lint/typecheck, complete tests. Production Hermes bundle validation passed on both platforms, including the final committed implementation.
- [x] Final dependency/style checks, metrics, diff review, implementation and verification documentation commits.

## Implementation checkpoint

- Restored exact original styles for order history, checkout primitives, and menu section headers. Earlier session extractions had introduced visual differences; those were caught by source comparison.
- Extracted order progress, menu loading, account rows/guest CTA, settings rows, rewards activity, order/refund/outcome primitives, shared profile sheets, auth presentation/return-path helpers, startup gates, customization selection, order-event parsing/polling, and checkout controller.
- Consolidated native glass capability checks and confirmation sheets. Shared profile Birthday sheet has identical styles and behavior in both original consumers.
- Fixed notification effect dependency churn, ignored stale session refresh completions after session replacement/clear, prevented overlapping order polls and results after disposal, and cleaned profile saved-notice timer.
- Removed orphan style definitions by checking all property references (no dynamic style indexing found). Removed unreferenced legacy OrderDetailSheet (387 lines), passkey/identity mutation wrappers with no consumers, unused TitleBlock, obsolete theme facade and its sole assertion test, and demo payment/correlation helpers with only self-tests. Whole-repository reference searches included native/config/test files; removed files remain recoverable from Git.
- Preserved native Apple Pay adapter/button: Swift/ObjC integration still exists in the shipped native project, and native behavior is explicitly in scope to preserve. Preserved catalog fallback service and brand-level order/loyalty cache semantics; these implement existing contracts.
- Extracted shared navigation selection/geometry into usePillTabSelection; platform-specific gesture/morph/rendering remains owned by each tab bar. Removed incomplete gesture memoization that captured changing navigation closures.
- Verification checkpoint before latest navigation group: lint/typecheck passed, 20 test files / 101 tests passed. Added SSE parsing and polling lifecycle tests and customization selection invariant tests. Three obsolete helper/theme tests were subsequently removed with their dead implementations; final counts pending.

## Validation and risks

Baseline known checks: mobile ESLint/typecheck and 96 tests passed in prior session work. Prior repository pushes reported existing Dependabot findings; dependency remediation is outside this architectural change. No simulator/device visual or live payment verification has run. The static audit, architectural pass, available validation and final diff review are complete, subject to the explicit limitations below.

## Coverage findings and retained responsibilities

| Area | Audit and disposition |
| --- | --- |
| app root/tabs | Router entries traced; direct screen imports replace eager screen barrel. Startup gating extracted; provider order, stack options, Sentry initialization, Stripe callbacks preserved. Initial URL lookup rejection handled. |
| auth/profile/account routes | Return-path allowlist and error copy extracted and tested; shared birthday/country sheets; settings/reward rows separated; unsafe ref casts removed; profile effect dependencies corrected; saved timer cleaned. |
| cart | Domain pricing/customization/location snapshot invariants retained and covered by existing tests. Row component and primitives extracted. Stable provider actions avoid action-identity effect churn. |
| checkout/orders/refunds | Payment controller separated without changing request order, payloads, finalization or retry rules. Quote/cart/location checks retained. Stream parsing and polling separated/tested; shared order descriptions/points and history/progress components. |
| home/menu | Dynamic home sections separated from animated header/data composition; menu sections, loaders, customization selection and footer separate. Shared image fallback hook preserves CDN/original/icon sequence. Existing query keys, freshness and service fallback retained. |
| location | All provider, picker, preference and model code evaluated. Selection persistence, cancellation of old catalog queries, explicit destructive switch confirmation and cart ownership retained. Provider remains cohesive (~274 lines). No location-bound public API client introduced. |
| navigation | Shared selection geometry/state hook. Liquid Glass morph gestures and classic blur implementations retain separate presentation/animation ownership; they remain larger because each includes its full style sheet and platform-specific rendering. Gesture closures now follow current navigation values. |
| notifications | Stable mutateAsync dependency stops cancellation/restart on mutation observer renders. Permission/token/storage failures remain best effort; effect cleanup retained. |
| API/observability | Environment guards and brand/location client boundaries retained. SSE schemas/parser/polling separated. Existing Sentry throttling and cancellation suppression preserved. |
| shared UI/config/legal/brand | Native capability checks centralized; confirmation sheet shared. UI system remains the cohesive public primitive/token interface. Merchant identity checks, native manifests, keyboard handling, privacy policy configuration and display-name fallbacks traced. |
| tests/tooling/native/assets | All test modules inventoried, tests for removed dead-only facades removed. Native Swift/ObjC, Expo entry/config, Metro/Babel, EAS profiles and merchant/release scripts checked for consumers before deletion. No backend/shared-package source or native/build identity changed. |

The native Apple Pay adapter/button are explicitly retained with the matching native bridge. They are not used by current Stripe PaymentSheet UI; deleting native integration without a native verification environment is unnecessary risk for this architectural pass.

ScrollView composition and stable domain keys remain for menu/history/rewards. Menu/home have measured collapsing headers; history/rewards have existing scroll wrapper/inset behavior and no pagination contract. Replacing them with virtualized lists requires device profiling and interaction validation to establish equivalent header/scroll behavior; no performance improvement is claimed without that evidence. This is a documented retained architecture, not a skipped directory.

## Environment recovery and reproducible checks

The first broad Turbo invocation selected runner-global pnpm instead of the pinned version, attempted automatic installation, and disrupted node_modules. The repository and lockfile remained unchanged. Recovery uses a local Corepack shim and frozen installation; final checks must complete after recovery.

```sh
mkdir -p /tmp/rawaq-pnpm-bin
corepack enable --install-directory /tmp/rawaq-pnpm-bin pnpm
export PATH=/tmp/rawaq-pnpm-bin:$PATH
export COREPACK_HOME=/tmp/lattelink-corepack
export XDG_DATA_HOME=/tmp/lattelink-data
export XDG_CACHE_HOME=/tmp/lattelink-cache
CI=true pnpm install --frozen-lockfile
CI=true pnpm --filter @lattelink/mobile build:workspace-deps
CI=true pnpm exec turbo run lint typecheck test --filter=@lattelink/mobile... --concurrency=2
```

Production-mode Hermes export completed for iOS (8.06 MB) and Android (8.08 MB), with 50 assets, using local app identity and NODE_ENV=production; this is bundle validation, not merchant release/signing validation. Final committed source was re-exported successfully. No release credentials or production services were required or fabricated.

## Final source metrics

Comparison is against the recovered uncommitted state at the start of this autonomous run, not against the older pre-session application. Source definition is recorded in [the per-file audit inventory](apps/mobile/MOBILE_SOURCE_AUDIT.md).

| Metric | Recovered | Final |
| --- | ---: | ---: |
| Runtime implementation files | 84 | 105 |
| Physical source LOC | 16,966 | 17,645 |
| Largest source file | 850 | 568 |
| Files over 500 lines | 10 | 3 |
| Files over 1,000 lines | 0 | 0 |
| Static relative import cycles | 0 | 0 |

Total LOC rose because previously compressed JSX/styles were formatted into readable multiline definitions and new lifecycle/domain interfaces were added. LOC reduction was not used as a completion proxy. Largest final files: LiquidGlassPillTabBar 568, cart 540, menu-customize 502, OrdersScreen 492, ui/system 445. Remaining size is justified by cohesive platform-specific gestures/styles or screen composition; reusable rows, payment orchestration, customization selection, loaders and independent UI are extracted.

## Final verification record

- Pinned frozen install recovered all 1,253 dependencies; lockfile and manifests unchanged. Eight mobile dependency builds passed.
- Mobile ESLint and strict TypeScript passed after the last implementation edits.
- Mobile tests: **21 files, 104 tests passed**. Recovery had 18 files/96 tests; 11 meaningful domain/transport assertions were added, while 3 assertions attached only to deleted dead helpers/theme facade were removed.
- Broad dependency validation: **35/35 Turbo tasks passed**, across mobile and its dependency scope (11 packages). Shared contract/token/SDK tests contributed 83 passing tests, for **187 total** including mobile. Later mobile-only cleanup was revalidated with mobile lint/typecheck/tests.
- 269 extracted style definitions compared against `341d304`: zero semantic differences. 15 critical payment, environment-guard, SSE parser, customization and auth helper function bodies compared after whitespace normalization: identical.
- Complete relative static dependency scan: zero cycles. Style reference scan: zero orphan properties. Re-export and external symbol searches included repository source/tests/config and native Swift/ObjC references before removal.
- Production exports passed for iOS and Android with Hermes bytecode and 50 assets. Final `d445be6` exports in `/tmp/rawaq-mobile-refactor-verified`: iOS `index-5a31a0440b96ad9838cbf7dc541a3845.hbc` (8.06 MB), Android `index-3a3e51ecc9c23d7d305579ce48fc2033.hbc` (8.08 MB), plus metadata/assets. Expo export exited 0.
- Final scope review: only mobile code/tests and refactoring documents changed. No native sources, dependency manifests/lockfile, backend, dashboard, migrations, credentials or production data changed.
- Dynamic Type remains intentionally disabled; the source-wide font-scaling enforcement test passes.

## Commit record

- `d445be6 refactor(mobile): separate feature presentation and lifecycle logic` — implementation, previous session work, focused tests and progress record.
- `docs(mobile): record completed source audit and verification` — final per-file audit inventory, metrics, results and limitations (own hash available in Git log).
- Commits remain local on `develop`; nothing deployed or published.

## Remaining limitations

All runtime source directories have been statically audited and the justified architectural changes implemented. The per-file inventory includes retained files; unchanged files were evaluated rather than mechanically rewritten. Existing native integration/build configuration was audited for references and preserved.

Linux cannot provide Xcode signing, native iOS/Android simulator interaction or Apple Pay/Stripe device transactions. No native binary build, visual/gesture comparison, live backend checkout, notification delivery or production release preflight is claimed. Merchant release preflight requires real release identity/Sentry configuration and signing inputs; no fake credentials were supplied. Very large menu/history/rewards datasets still warrant device profiling before changing scroll architecture. No known regression remains in the available static, unit or bundling checks.

## Independent regression review after `7556e15`

Reviewed both refactor commits against `341d304` on the existing clean `develop` branch. All 88 changed paths were inventoried, with baseline structural/style comparison, lifecycle and JSX wiring review, repository reference tracing and the complete customer journey traced. See [the independent review](apps/mobile/MOBILE_REGRESSION_REVIEW.md) for findings, per-path inventory and device/live-integration QA priorities. Earlier completion statements and metrics above describe the original checkpoint, not this follow-up.

- Confirmed/fixed P2: changing customization item params during a loading-overlay fade could stop the animation permanently because the reveal effect omitted `resetKey`. A new dependency/state/animation lifecycle regression test failed before the fix and passes afterward; added initial/refresh/skip/reset/unmount coverage.
- Confirmed/fixed P3: shared thumbnails changed the history fallback icon for a bare Cortado. Restored history-specific classification through a typed optional icon prop without changing receipt/refund artwork; added classification and rendered-element tests.
- No broad refactor, dependency changes, new state libraries or additional dead-code removals. Three remaining files over 500 LOC were reassessed and retained for cohesive rendering/composition responsibilities. Independent value-import graph tracing found zero baseline/current relative cycles.
- Uncached full mobile/dependency validation passed 35/35 tasks (11 packages, zero cache hits). Final expanded mobile tests passed 23 files / 115 tests; 83 shared tests also passed, for 198 executed passing tests across final suites.
- Production-mode local-identity iOS/Android Hermes exports passed again: 8.06 MB / 8.08 MB, 50 assets, `/tmp/rawaq-independent-review-export`. No signed binary/device or live integration execution claimed. Dynamic Type remains off by intent.
- Fixes and review documentation are to be committed locally on `develop`; do not push or deploy. The independent review explicitly identifies the unchanged payment-sheet/cart concurrency edge case and physical-device/live-service coverage gaps.
