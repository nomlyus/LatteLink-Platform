# Native tabs and adaptive cart accessory

## SDK 58 follow-up — October 19, 2026

The audit below describes the initial SDK 57 implementation, not the current
dependency graph. Mobile now resolves Expo 58.0.16, Router 58.0.24, RN 0.88.0,
React 19.3.1 and Screens 4.30.0. Native tabs import `expo-router/native-tabs`.
See [the SDK upgrade record](MOBILE_SDK_UPGRADE.md) for checks and remaining native
acceptance requirements. The SDK 57 development client must be rebuilt.

Screens 4.30 exposes independent native `role`, `automaticallyActivatesSearch`
and iOS 27 `prominentScreenKey`. Router 58's high-level `role` still maps to
`systemItem`; access to other Screens properties is through its typed native
overrides. This upgrade alone does not establish Apple Music's exact grouped-
expanded/separate-minimized Search appearance. No scroll-driven role swapping,
custom native patch, navigator remount or simulated tab bar was introduced.

Menu minimization was confirmed by the user on the prior physical-device build
after preserving the non-collapsable first-child scroll chain. SDK 58 device
verification remains pending. The cart pill's NativeWind style-callback failure
was fixed using static layout styles; the user confirmed the corrected layout
before this dependency upgrade.

## Historical SDK 57 implementation

Implementation audit: October 19, 2026. Development-only changes; no dependencies,
native projects, identifiers, credentials, backend contracts, or payment behavior changed.

## Installed architecture and API

- Expo 57.0.29, Expo Router 57.0.27, React Native 0.86.3, React 19.2.3,
  react-native-screens 4.26.2.
- Expo Router vendors its React Navigation implementation. The app does not install
  or use the standalone `@react-navigation/bottom-tabs/unstable` navigator.
- Existing iOS navigation already used `expo-router/unstable-native-tabs`.
  Android previously used the custom JS pill because native labels scale with SP.
  Native labels are now hidden, so Android also uses the system navigator.
- The standalone [React Navigation API](https://reactnavigation.org/docs/native-bottom-tab-navigator/)
  requires Screens 4.30+. Installing it would introduce a dependency/native-binary
  upgrade and different navigation-context integration. This implementation retains
  the existing SDK-matched [Expo native tabs API](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/).
  These APIs are not interchangeable; no unsupported props are passed.

Installed types/source checked:

- `expo-router/build/native-tabs/types.d.ts`: `minimizeBehavior`, `role`.
- `common/elements.d.ts` and `hooks.d.ts`: `BottomAccessory`, `usePlacement()`.
- `react-native-screens/src/components/tabs/host/TabsHost.ios.tsx`:
  both accessory placements mount simultaneously on iOS 26+.
- `ios/tabs/host/RNSTabsHostComponentView.mm`: the prop setter assigns
  `UITabBarController.tabBarMinimizeBehavior` dynamically.
- Local generated native component registration already includes RNSTabsHostIOS,
  RNSTabsScreenIOS, RNSTabsBottomAccessory, RNSTabsBottomAccessoryContent and
  RNSSafeAreaView. No additional native module was introduced.

## Route and history ownership

```text
root Stack (unchanged cart/auth/customization/checkout/order-detail modals)
  (tabs) Stack
    (navigation) NativeTabs on iOS/Android
      home
      menu
      orders
      search -> native Stack -> SearchScreen
    account -> existing AccountScreen
    home/menu/orders -> old group-qualified link compatibility redirects
  account/settings, account/alerts, account/rewards, account/session (unchanged)
```

The four visible destinations are Home, Menu, Orders, Search, in that order.
Search has a permanent `role="search"`. Labels remain visually hidden; accessibility
names and platform symbols remain. All native screens keep stable keys.

Account is a parent-stack screen, not a hidden fifth tab and not another Account
navigator. Installed NativeTabs rejects navigation to hidden routes. The existing
Home top-right button opens `/(tabs)/account`, now with a person icon. The other
Home controls, loyalty card, and homepage layout are unchanged.
The existing AccountFloatingHeader back affordance is enabled for both guest and
signed-in Account, with a Home fallback when no prior navigation entry exists.

`destinations.ts` owns canonical group-qualified targets. In-app entry/return
navigation goes directly to the existing native group instead of pushing a
compatibility redirect into tab history. Auth's return-value allowlist and default
Menu behavior remain unchanged. Existing `/(tabs)/home`, `/(tabs)/menu`, and
`/(tabs)/orders` links still resolve through thin redirects forwarding query params.
Public URLs remain /home, /menu, /orders, /search, /account and existing nested URLs.

All tab content mounts immediately, including inactive tabs; there is no first-visit
gate. Content remains mounted through tab switches. Search has no React.lazy or
Suspense boundary; its older-client native fallback loads synchronously behind a
capability check so unsupported clients do not import Expo UI views.
Account pushes do not intentionally remount the native navigator. No cart-dependent
navigator key, second cart store, new lifecycle listeners, or manual tab animations
are introduced.

## Cart and minimization

### Primary destination swap (2026-10-26)

The four native destinations are now Home, Menu, Rewards (gift), Search.
Home's previously disabled gift action is now an enabled Orders/History action,
beside the unchanged disabled bell. History and active-order tracking live at
`/(tabs)/orders` in the parent stack; `/orders` and auth returns still resolve
there. Orders opens as a native form sheet (65% initial height, expandable to 95%,
system corners and grabber); dismissing it reveals the prior selected tab.
Orders reuses `AccountSheetSurface`, including native regular Liquid Glass,
adaptive appearance and Reduce Transparency fallback. Its content and loading
state are transparent; it has no tab-screen wrapper or phantom tab-bar clearance.
The removed internal tab destination
`/(tabs)/(navigation)/orders` is no longer a canonical route.
Rewards reuses the existing balance/activity screen with native-header tab
presentation. Existing Account sheet rewards routes remain intact. Guest sign-in
from the Rewards tab returns to that tab through an explicit allowlisted path.
No cart, payment, order-status, loyalty calculation, or notification semantics change.

The existing CartProvider owns items, location binding, quantity, and subtotal.
Orders/checkout still obtain authoritative quotes from the backend. Accessory totals
are previews from the existing cart model, not a new pricing authority.

NativeBottomTabNavigator reads the cart once and memoizes display strings.
It supplies one summary and one cart-opening callback to the native accessory.
Both native placement views are stateless; neither subscribes to the cart, fetches
data, or performs effects. Tapping either opens the existing /cart modal.

| Cart / platform | Installed API behavior | Cart access |
| --- | --- | --- |
| Empty, iOS 26+ | `minimizeBehavior="never"` | No accessory |
| Nonempty, iOS 26+ | `minimizeBehavior="onScrollDown"` | Native BottomAccessory |
| Older iOS / Android | Unsupported minimization props omitted | Regular cart action above native tabs |
| Web | Standard Expo JS Tabs, not the old custom pill | Regular cart action |

The SDK 57 name `never` corresponds to the standalone navigator's `none`.
Cart quantity/price changes update accessory props without replacing navigation.
Removing the last item removes BottomAccessory and sets `never`.

**Immediate expansion limitation:** the installed native setter and Apple's public
documentation establish the policy change, but do not guarantee exactly when an
already-minimized bar expands after switching to `never`. There is no supported
imperative expand/reset command exposed here. No private API or forced navigator
remount is used. Last-item removal while minimized requires physical-device QA.

## Native accessory presentation and safe areas

`NativeCartAccessory` uses `BottomAccessory.usePlacement()`:

- Regular: wide row, bag icon, item count, USD subtotal, forward affordance.
- Inline: more compact spacing/type with the same count, subtotal and action.

The native UITabAccessory supplies the material, shape placement, and animations.
There is no custom BlurView/GlassView wrapper, absolute positioning, coordinate
measurement, or simulated tab bar. UIKit owns the available inline width; the API
cannot guarantee a center pill wider than adjacent controls or exact dimensions.
Text is single-line and may truncate at constrained widths; VoiceOver receives
the full count/subtotal label. Light/dark accessory colors are explicit. Native
transitions defer to the OS, including accessibility/reduced-motion preferences.

NativeTabScreen lets iOS 26+ content extend behind the bar; bottom clearance is
scroll-content padding from measured safe-area insets, not opaque viewport padding.
Menu places its existing Animated.ScrollView first in the native child chain. The
redundant ScreenBackdrop is omitted only from the populated menu because its root
already paints exactly the same background color. This permits native scroll-view
discovery while retaining refs, refresh controls, snapping and scroll handlers.
Menu's root and both native tab wrapper Views explicitly set `collapsable={false}`:
Fabric flattening can otherwise move the scroll view out of the first native-child
chain despite its JSX order. This follows the [Screens maintainer's workaround](https://github.com/software-mansion/react-native-screens/issues/3954)
for scroll-driven minimization; physical confirmation is still required. The
maintainer also notes that the OS may expand only at the top, not on every small
upward gesture. No JavaScript-driven fake minimization is added.
An attempted experimental ScrollViewMarker wrapper was removed after a reported
Fabric HostFunction render error. Local generated component registration was not
proof that the installed development binary could safely instantiate that view;
the exact native exception was not captured. The final implementation introduces
no marker/native component and does not depend on that experimental API.
The native safe-area provider is expected to update when accessory layout changes;
overlap and inline/regular transitions must still be checked on hardware.
Android/older iOS use Screens SafeAreaView with an ordinary cart row in layout.
That fallback is mounted only for the focused screen. It does not emulate glass
or minimization. Web uses the standard JS Tabs bar; native platforms never use it.
Old PillTabBar implementations remain as prior uncommitted cleanup/test material,
but no application navigator imports them.

## Search and catalog integration

Search has a nested native Stack with `headerSearchBarOptions`, allowing native
search-field presentation. Android uses supported search autofocus; on iOS the OS
owns Search activation. Web uses a normal text input. The installed API exposes
only the older system-item Search role, not `tabBarSearchAutoFocus` or the newer
iOS 27 prominent-role option. Thus iOS 26 can detach Search; iOS 27's separately
visible/minimized Search behavior is **not guaranteed by this installed version**.
Dedicated Search remains functional; no unsupported option or native patch is added.

Search reuses location-keyed `useMenuQuery` (existing cancellation/schema/cache
behavior), MenuItemRow, and /menu-customize with only itemId. It matches normalized
name, description, category and badges; products are deduplicated by ID.
Hidden items/categories are excluded; sold-out items remain visible but cannot
open customization. Location resolution and API errors do not expose stale results.
Loading, initial prompt, empty matches, and retry are explicit. No hardcoded products.

## Verification and remaining acceptance

Verification executed:

- `pnpm --filter @lattelink/mobile typecheck`: passed.
- `pnpm --filter @lattelink/mobile lint`: passed, zero warnings.
- `pnpm --filter @lattelink/mobile test`: 36 files, 205 tests passed, zero failures.
- `pnpm exec expo-modules-autolinking verify`: passed, no duplicate modules.
- Production-mode iOS/Android Hermes exports: passed, including the final rerun
  after navigation-target/back-action updates (7.4 MB iOS / 7.7 MB Android).
- `git diff --check`: passed.

Focused tests cover cart model transitions, both accessory placements and their
shared action, count/subtotal updates, platform capabilities, native route ordering,
Search role, account separation/auth returns, route compatibility/query forwarding,
search filtering and existing customization navigation, loading/error/stale scope.
Path tests execute the installed Expo route parser and real path validator for 12
public/group-qualified routes, independently of native module loading in Node.

Read-only development API check: /menu returned HTTP 200, passed the shared schema,
and provided 9 categories / 57 visible item memberships. A real available item
was found by the new search function and resolved to /menu-customize.
No cart/order/account/backend writes were performed.

Native compilation is not claimed: local Xcode 26.3 is below SDK 57's documented
minimum (26.4+; the project pins EAS 26.6). Existing MOBILE_SDK_UPGRADE.md records
the prior generic-device native compiler failure. Android has no checked-in native
project or configured Android SDK/adb, and local Java is 8. No dependencies/native
integration changed, so those blockers were not worked around with prebuild/upgrades.

No simulator/emulator, native build submission, OTA publish, deployment, or push.
No physical acceptance is claimed for this slice; Metro had no connected phone
during the verification pass. Prior native-tab mounting is not proof of this new
accessory/search behavior. Physical-device checklist:

- Empty cart: four expanded native destinations, no accessory; scroll does not minimize.
- Add item: regular accessory; Menu/Orders/Search scrolling minimizes/restores natively.
- Both placements open /cart; quantity/subtotal update; remove last item while minimized.
- Switch tabs with cart, keep prior screen state, no duplicate accessory/subscriptions.
- Search/keyboard/cancel, unavailable results, location change, customization return.
- Home account button, guest sign-in/return, nested account pages and back navigation.
- Direct legacy/current links, query preservation, auth/checkout/order-detail returns.
- iOS 26 and iOS 27 inline Search arrangement, older-iOS and Android native fallback.
- Small screens, large accessibility settings, VoiceOver, Reduce Motion, dark appearance.

## Files in this slice

Paths below are relative to `apps/mobile`; pre-existing startup and homepage work
was preserved, not included as part of this navigation task's implementation.

Navigation and cart:

- `src/navigation/NativeBottomTabNavigator.tsx`
- `src/navigation/BottomTabNavigator.tsx`, `BottomTabNavigator.android.tsx`
- `src/navigation/NativeTabScreen.tsx`, `TabScreen.tsx`, `TabScreen.android.tsx`
- `src/navigation/CartAccessory.tsx`, `FallbackCartAccessory.tsx`, `cartAccessoryModel.ts`
- `src/navigation/bottomTabs.ts`, `tabContentLayout.ts`, `destinations.ts`
- `src/navigation/JavaScriptTabNavigator.tsx`, `JavaScriptTabScreen.tsx` (web only)

Routes, Search and account entry:

- `app/(tabs)/_layout.tsx`, `home.tsx`, `menu.tsx`, `orders.tsx`, `account.tsx`
- `app/(tabs)/(navigation)/_layout.tsx`, `home.tsx`, `menu.tsx`, `orders.tsx`
- `app/(tabs)/(navigation)/search/_layout.tsx`, `search/index.tsx`
- `src/search/SearchScreen.tsx`, `src/search/catalogSearch.ts` (initial implementation;
  deleted with the rejected results UI on October 26, 2026)
- `src/screens/HomeScreen.tsx` (only account-control wiring in this slice)
- `src/screens/AccountScreen.tsx` (optional existing-header back action)
- `src/home/LoyaltyCard.tsx` (missing fixed-font multiplier attributes from earlier
  uncommitted UI work, required by the existing font-scaling regression test)

Canonical return-target updates only, no payment/auth/business logic changes:

- `src/auth/presentation.ts`
- `app/index.tsx`, `auth.tsx`, `profile-setup.tsx`, `menu-customize.tsx`
- `app/checkout-success.tsx`, `checkout-failure.tsx`
- `app/orders/[orderId].tsx`, `refunds/[orderId].tsx`, `account/settings.tsx`

Tests and documentation:

- `test/native-tab-navigation.test.ts`, `bottom-tab-navigation.test.ts`
- `test/cart-accessory.test.ts`, `catalog-search.test.ts`, `search-screen.test.ts`
- `test/navigation-routes.test.ts`, `account-navigation.test.ts`, `auth-presentation.test.ts`
- `NATIVE_TABS_RESEARCH.md`
