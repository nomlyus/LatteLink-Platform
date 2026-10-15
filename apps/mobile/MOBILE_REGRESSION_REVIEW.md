# Independent mobile regression review

Reviewed on `develop`: `d445be6` and `7556e15`, against their pre-refactor baseline `341d304`. The checkout was clean at review start. This is a regression review, not another refactor. No push, deployment, backend/native changes, dependency changes or live transactions.

## Confirmed findings — fixed

- **P2: customization loading overlay can remain indefinitely.** In `useInitialReveal`, changing the reset key during the 260 ms fade stops the animation and restores opacity to 1, but neither boolean state changes. The reveal effect omitted the reset key, so no new animation starts. Include `resetKey` in its dependencies. Reproduced with the new dependency/state lifecycle test before the fix (one failure); passes after the fix. Relevant when item params change while the same customization screen remains mounted.
- **P3: history fallback artwork changed.** Consolidating thumbnails added Cortado to history's coffee classifier; the original history used the generic sparkles icon for a bare Cortado, unlike receipts/refunds. Preserve history's original classifier through an optional typed fallback-icon prop; keep receipt/refund behavior unchanged. Added classification and rendered-element assertions, including overlapping category names.

No other introduced code-level regression was confirmed. Static comparison is not proof of native/UI equivalence.

## Review method and coverage

All **88 changed paths** were included: 80 application-source paths, 6 test paths, and 2 documents. `7556e15` is documentation-only. Used full-source TypeScript structural comparison, moved-function/style comparison, dependency tracing, source review of changed lifecycle/control flow and extracted JSX wiring, plus tests and both platform bundles. Independently reconstructed the relative value-import/re-export graph: baseline 72 TS/TSX modules / 213 edges; reviewed 104 / 305; **zero cycles in either**. This excludes type-only edges, native integration and dynamic imports. Repository-wide reference searches also checked deleted entry points/helpers.

Rechecked 269 moved style definitions with zero differences in those definitions; additionally examined effective thumbnail style overrides (receipt square 108×132, history 42×52), fallback artwork and callback bindings. Rechecked 15 critical payment/environment/parser/customization/auth function bodies: unchanged. These parity checks supplement rather than replace the lifecycle review; the two findings above escaped definition-only comparison.

## Customer journey trace

| Journey | Review result |
| --- | --- |
| Startup | Provider order, public bootstrap, selection hydration, query gating, splash and store-configuration/error gates preserved. Initial Stripe URL failure is now caught without blocking startup. |
| Authentication | Apple/dev mutation payloads and return-destination allowlist preserved; profile setup, defer and return routes traced. Refresh identity guard rejects an old refresh response after session replacement/logout. SecureStore keys and session expiry policy unchanged. |
| Location | Location provider/preference implementation unchanged; traced every new caller. Cart mutation callbacks read the latest snapshot; catalog keys remain location + brand scoped, history remains customer/brand scoped. Confirmed switches clear cart and retry/failure state; old catalog cancellation preserved. |
| Menu/customization | Section ordering, deduplication, availability, option limits, notes, quantity, pricing, add-to-cart location checks and close routes preserved. Fixed the reset-during-fade race. Image variant/original/fallback order and hero-ready callbacks preserved. |
| Cart/quote | Quantity/remove/clear callback arguments, discount normalization, tax display, auth return-to-cart and focus-based success/failure routing preserved. Quote/draft/payment-session location checks and payloads unchanged. |
| Checkout/payment | Extracted controller still owns the same state at the same screen lifetime. Stripe init → sheet init → present → backend finalize order unchanged; cancel/retry/failure/success/confirmation-pending routes and account invalidations preserved. Return URL/scheme normalization and platform payment flags unchanged. |
| Orders/refunds/loyalty | History merge/key, cancellation, active progress, order-detail/refund routes, reversal totals, reward visibility and ledger formatting preserved. Polling now prevents overlap and late delivery after cleanup; SSE parsing unchanged. Restored history fallback icon. |
| Notifications/persistence | Registration depends on stable mutation function rather than result-object identity; async currentness guard retained. Permission flow, device identity key, brand registration and notification behavior unchanged. Cart/checkout remain in-memory as before; no new persistence policy. |

## Architecture assessment

- New feature-local presentation files have explicit props and no API access. Checkout orchestration is isolated from rendering; pure selection/formatting/transport helpers are testable.
- Shared confirmation sheets retain caller-specific titles, tones, snap points and pending/pan behavior. Small domain wrappers keep those policies out of shared UI; not excessive fragmentation.
- No new libraries, state managers or package/lockfile changes. No new import cycles. The small components barrel is retained; screen entry points now import explicit modules.
- Removed sheet, screen/theme facades, passkey hooks and dummy checkout helpers have no remaining repository consumer; Expo Router routes and native Apple Pay bridge/adapters remain. No removal performed during this review.
- `catalog.ts` retains its image-helper re-export for current callers; this is a useful public interface, not a duplicate implementation.
- Both tab bars now create their gesture configuration per render. Installed Gesture Handler updates callbacks while retaining handler tags; no evidence of a cancellation regression. Additional native config updates are a profiling/gesture-QA consideration, not a confirmed functional defect.

### Remaining files over 500 LOC

| File | LOC | Assessment |
| --- | ---: | --- |
| `src/navigation/LiquidGlassPillTabBar.tsx` | 568 | Cohesive native glass renderer: worklets, gesture morphing, layered icon tracks and platform-specific styles. Shared selection logic already extracted. Styles start at line 365. Retain. |
| `app/cart.tsx` | 540 | Cart screen composition and local confirmation/navigation state; rows, artwork and controls extracted. Styles start at line 358. No payment orchestration remains here. Retain. |
| `app/menu-customize.tsx` | 502 | One item customization lifecycle/form/composition; selection rules, footer and loading/image states extracted. Styles start at line 322. Retain. |

No additional splitting warranted for this review. Shared SummaryRow variants deliberately preserve differing per-surface styles rather than adding a universal style-configuration abstraction.

## Verification

- Fresh uncached `turbo run lint typecheck test --filter=@lattelink/mobile... --concurrency=2 --force --output-logs=errors-only`: **35/35 tasks passed**, zero cache hits, across 11 packages. Includes mobile ESLint (zero warnings), TypeScript and dependency builds/checks/tests.
- Expanded final mobile suite: **23 files, 115 tests passed**; dependency suites add 83 tests. Initial uncached aggregate ran 113 mobile tests; the final mobile rerun adds two further reveal lifecycle tests. Total final test coverage executed: **198 passing tests**.
- New reveal tests use a deterministic React hook-dependency/state/effect host and fake native animation; thumbnail assertions use mocked native elements. They are not device-renderer tests.
- Production-compatible `expo export --platform ios --platform android --max-workers 2`, with offline local app identity and `NODE_ENV=production`: exit 0. Hermes iOS **8.06 MB**, Android **8.08 MB**, 50 assets; output `/tmp/rawaq-independent-review-export`. This is not a signed release/native build or merchant release preflight.
- Source-wide font-scaling test passed; Dynamic Type remains intentionally disabled.
- `git diff --check` passed. Final changes limited to the two fixes, focused tests and review/progress documentation.

## Remaining risks / required QA (not confirmed introduced defects)

1. **High-impact live/native integration:** Apple sign-in and expired-session foreground recovery; Stripe card and Apple Pay success, cancellation, decline, 3DS/deep-link return, finalization timeout, duplicate submission/retry; verify server quote/payment location and account order/loyalty results.
2. **Location/payment concurrency:** Switch stores during quote preparation and payment-sheet opening; verify blocked stale preparation, cart invalidation, retry isolation and brand-wide history. Changing cart/location while the external payment sheet is already open remains a baseline edge case: controller body is unchanged and successful payment clears the current cart. Do not infer this race is solved by the refactor.
3. **Native UI/interaction:** iOS Liquid Glass and fallback iOS/Android tabs (pan across tabs during cart updates, interruption and rotation); all confirmation/profile sheets, safe-area/keyboard behavior, collapse headers, modal push/back/dismiss, missing/CDN-failed images and rapid item changes. Compare screenshots with baseline; no native visual parity run was possible.
4. **OS lifecycle/delivery:** SecureStore restart and failed persistence, background/foreground reconnect, denied/re-enabled push permissions, token delivery and order updates on physical iOS/Android devices.
5. **Scale/performance:** Long menu/history/rewards ScrollViews and native image caching/network behavior need device profiling; these strategies were not changed. No measured performance claim.

Ready for device-level QA after successful automated validation, **not a production approval**. No signed native/device/live-payment/push end-to-end execution was available. No remaining automated failures; initial added-test reproduction and JSX test-harness setup failure were resolved.

## Changed-path review inventory

Each path below was included in the baseline diff/structural/reference review. Source behavior and extraction wiring were evaluated under the journey/architecture areas above; test deletions were checked against actual removed helpers. Historical audit metrics describe the refactor checkpoint, not the subsequent regression fixes.

- `A` `MOBILE_REFACTOR_PROGRESS.md`
- `A` `apps/mobile/MOBILE_SOURCE_AUDIT.md`
- `M` `apps/mobile/app/(tabs)/account.tsx`
- `M` `apps/mobile/app/(tabs)/home.tsx`
- `M` `apps/mobile/app/(tabs)/menu.tsx`
- `M` `apps/mobile/app/(tabs)/orders.tsx`
- `M` `apps/mobile/app/_layout.tsx`
- `M` `apps/mobile/app/account/alerts.tsx`
- `M` `apps/mobile/app/account/rewards.tsx`
- `M` `apps/mobile/app/account/session.tsx`
- `M` `apps/mobile/app/account/settings.tsx`
- `M` `apps/mobile/app/auth.tsx`
- `M` `apps/mobile/app/cart.tsx`
- `M` `apps/mobile/app/checkout-success.tsx`
- `M` `apps/mobile/app/checkout.tsx`
- `M` `apps/mobile/app/menu-customize.tsx`
- `M` `apps/mobile/app/orders/[orderId].tsx`
- `M` `apps/mobile/app/profile-setup.tsx`
- `M` `apps/mobile/app/refunds/[orderId].tsx`
- `A` `apps/mobile/src/account/AccountPrimitives.tsx`
- `M` `apps/mobile/src/account/DeleteAccountSheet.tsx`
- `A` `apps/mobile/src/account/ProfileSheets.tsx`
- `A` `apps/mobile/src/account/RewardActivityRow.tsx`
- `A` `apps/mobile/src/account/SettingsRows.tsx`
- `M` `apps/mobile/src/account/data.ts`
- `A` `apps/mobile/src/account/presentation.ts`
- `M` `apps/mobile/src/api/client.ts`
- `A` `apps/mobile/src/api/orderEvents.ts`
- `A` `apps/mobile/src/auth/presentation.ts`
- `M` `apps/mobile/src/auth/session.tsx`
- `M` `apps/mobile/src/auth/useAuth.ts`
- `A` `apps/mobile/src/cart/CartLineItem.tsx`
- `A` `apps/mobile/src/cart/CartPrimitives.tsx`
- `M` `apps/mobile/src/cart/ClearCartSheet.tsx`
- `M` `apps/mobile/src/cart/GlassActionPill.tsx`
- `M` `apps/mobile/src/cart/RemoveItemSheet.tsx`
- `M` `apps/mobile/src/cart/model.ts`
- `M` `apps/mobile/src/cart/store.tsx`
- `A` `apps/mobile/src/components/ConfirmationSheet.tsx`
- `M` `apps/mobile/src/components/MenuItemRow.tsx`
- `A` `apps/mobile/src/components/OrderItemThumbnail.tsx`
- `M` `apps/mobile/src/components/OrderStatusPill.tsx`
- `M` `apps/mobile/src/components/index.ts`
- `A` `apps/mobile/src/home/HomeNewsTag.tsx`
- `A` `apps/mobile/src/home/HomeSections.tsx`
- `A` `apps/mobile/src/menu/CollapsibleSectionHeader.tsx`
- `M` `apps/mobile/src/menu/CustomizationGroupSection.tsx`
- `A` `apps/mobile/src/menu/MenuCustomizeFooter.tsx`
- `A` `apps/mobile/src/menu/MenuCustomizeStates.tsx`
- `A` `apps/mobile/src/menu/MenuLoadingState.tsx`
- `M` `apps/mobile/src/menu/catalog.ts`
- `A` `apps/mobile/src/menu/customizationSelection.ts`
- `A` `apps/mobile/src/menu/images.ts`
- `A` `apps/mobile/src/menu/presentation.ts`
- `A` `apps/mobile/src/menu/useMenuImage.ts`
- `M` `apps/mobile/src/navigation/ClassicPillTabBar.tsx`
- `M` `apps/mobile/src/navigation/LiquidGlassPillTabBar.tsx`
- `M` `apps/mobile/src/navigation/PillTabBar.tsx`
- `A` `apps/mobile/src/navigation/usePillTabSelection.ts`
- `M` `apps/mobile/src/notifications/usePushNotificationRegistration.ts`
- `A` `apps/mobile/src/orders/CheckoutPrimitives.tsx`
- `A` `apps/mobile/src/orders/CheckoutSuccessPrimitives.tsx`
- `A` `apps/mobile/src/orders/OrderDetailPrimitives.tsx`
- `D` `apps/mobile/src/orders/OrderDetailSheet.tsx`
- `A` `apps/mobile/src/orders/OrderProgress.tsx`
- `A` `apps/mobile/src/orders/OrdersHistoryPrimitives.tsx`
- `A` `apps/mobile/src/orders/RefundPrimitives.tsx`
- `M` `apps/mobile/src/orders/checkout.ts`
- `A` `apps/mobile/src/orders/checkoutPresentation.ts`
- `A` `apps/mobile/src/orders/presentation.ts`
- `A` `apps/mobile/src/orders/useCheckoutController.ts`
- `M` `apps/mobile/src/screens/AccountScreen.tsx`
- `M` `apps/mobile/src/screens/HomeScreen.tsx`
- `M` `apps/mobile/src/screens/MenuScreen.tsx`
- `M` `apps/mobile/src/screens/OrdersScreen.tsx`
- `D` `apps/mobile/src/screens/index.ts`
- `A` `apps/mobile/src/startup/StartupGate.tsx`
- `D` `apps/mobile/src/theme/tokens.ts`
- `A` `apps/mobile/src/ui/glass.ts`
- `M` `apps/mobile/src/ui/system.tsx`
- `A` `apps/mobile/src/ui/useInitialReveal.ts`
- `A` `apps/mobile/src/ui/useRefresh.ts`
- `A` `apps/mobile/test/auth-presentation.test.ts`
- `A` `apps/mobile/test/checkout-presentation.test.ts`
- `M` `apps/mobile/test/checkout.test.ts`
- `A` `apps/mobile/test/customization-selection.test.ts`
- `A` `apps/mobile/test/order-events.test.ts`
- `D` `apps/mobile/test/theme.test.ts`
