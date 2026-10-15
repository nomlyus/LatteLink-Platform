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
- [ ] Focused domain tests, lint/typecheck, complete tests, production bundle validation.
- [ ] Final dependency/style checks, metrics, diff review, logical commits.

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

Baseline known checks: mobile ESLint/typecheck and 96 tests passed in prior session work. Prior repository pushes reported existing Dependabot findings; dependency remediation is outside this architectural change. No simulator/device visual or live payment verification has run. No completion claim until all boxes have evidence. Work remains in progress.

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

Production-mode Hermes export already completed for iOS (8.06 MB) and Android (8.08 MB), with 50 assets, using local app identity and NODE_ENV=production; this is bundle validation, not merchant release/signing validation. Re-export final source after the last edits. No release credentials or production services are required or fabricated.
