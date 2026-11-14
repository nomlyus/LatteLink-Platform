# Mobile UI review — 27 October 2026

## Reviewing on the installed development client

Open **Home → Design previews · Dev only**. The preview gallery includes:

- Confirmed order, confirmation pending, interrupted payment, checkout preparation failure.
- Paid, preparing, ready, completed, canceled, and refunded receipts.
- Actual Menu, History, and item-customization loading layouts.
- Item unavailable, generic empty/error/loading/sign-in states.
- Rewards balance/activity, loading, failure, and legitimate zero/empty states.
- The complete profile-setup form, including keyboard and birthday picker.
- Native account-deletion confirmation without a deletion operation.

Every sample is labeled PREVIEW. Payment actions return to the gallery. Profile
inputs remain in component state. The deletion sample only dismisses its alert.
The gallery does not seed the cart, authentication, React Query caches, checkout
confirmation state, or persistent storage. It never submits an order or payment.

The gallery also links to live Account and History. Those links use the current
session and normal product behavior; they do not simulate an account. Do not
confirm destructive operations on live account screens just to inspect styling.

### Access boundary

Both conditions are required:

1. `__DEV__` is true (a Metro development bundle).
2. The configured API is HTTPS `api-dev.nomly.us`, or an explicit loopback HTTP(S)
   endpoint, and the runtime variant is not production.

Release bundles, including release beta builds, do not expose previews. Production
API targets are rejected even in a development bundle. The Home entry, route
layout, and direct scenario routes independently check the boundary. URL/query
parameters cannot enable it. Unknown scenarios are rejected.

## Responsibility and design pass

| Surface | Changes / retained behavior |
| --- | --- |
| Payment confirmation | Shared adaptive presentation, authoritative total/items/code, natural scrolling, clear Orders/Menu actions, native modal navigation. Removed the incorrect derivation of earned loyalty points from price. |
| Confirmation pending | Clearly distinguishes submitted payment from confirmed order; directs users to Orders before trying to pay again. Does not invent a success when no confirmation exists. |
| Payment failure | Distinguishes preparation failure from an interrupted payment. Removed unverified claims that nothing was charged or no order exists. Recovery returns to Cart or Orders. |
| Receipts / refunds | Compatibility URLs now share the current History receipt. Refund information appears only when the backend supplies it; loyalty reversal entries remain supported. Added the correct opaque-vs-overlay header inset distinction. |
| Active order | Existing status progression and pickup code retained. Shared adaptive glass surface, system symbols, Reduce Motion-aware progress, readable captions. Failed refreshes no longer present cached active-order data as current. |
| Search | Replaced temporary boxes with compact, virtualized results from the existing location-scoped menu query. Matches name, description, and category. Hidden products/categories are excluded and duplicate products removed. Unavailable products remain identifiable but cannot be opened. Results use the existing customization route. Native Search input/header and tab-reselection focus behavior retained. Older clients/Android use a native text-input fallback sharing the results. |
| Rewards | The main tab deliberately remains blank following the prior explicit request. The existing Account Rewards page now shares its presentation with the gallery. Balance and activity have distinct loading/error/empty states; failed loads never display cached points as current or invent zero. |
| Account navigation | Existing sheets, native back navigation, and corner treatment retained. Row icons/disclosures now use system symbols. |
| Profile setup | Shared production/preview form, native-backed inputs, optional phone/birthday labels, keyboard avoidance and scrolling, deliberate save errors and pending controls. Existing completion/skip policy retained. |
| Profile editing | Friendly name placeholder, handled save-error path, calendar-date birthday serialization rather than UTC date shifts. |
| Authentication | Native modal header replaces custom grabber; less technical progress copy. Environment/API hints restricted to development. Existing Apple sign-in and return destinations preserved. |
| Session | Native navigation and grouped read-only details, no opaque internal member identifier in the main presentation. |
| Settings | Existing informational flags/privacy behavior retained; sign-out failure is handled. Account deletion uses a native destructive confirmation with duplicate/disposed-callback protection. No new notification or account capabilities invented. |
| Location chooser | Existing isolation and cart-clear confirmation behavior retained. Larger close target, system typography, corrected contrast on the switch action. |
| Loading / unavailable | Menu skeleton no longer shows removed collapse controls. History skeleton matches the month archive. Shared skeleton animation cancels on unmount and respects Reduce Motion. Item unavailable and receipt failures use the shared state presentation. |

System semantic colors remain the basis for light/dark appearance. Forest green
remains the brand tint. Liquid Glass is reused through the installed native
capability boundaries; this pass adds no native code or dependency upgrades.
Existing disabled font scaling policy remains unchanged.

Obsolete confirmation/refund/receipt primitives and the abandoned Search test-box
prototype have been removed after checking consumers. Existing cart payment,
discount, and order-submission logic was not rewritten.

## Verification

- Mobile TypeScript and ESLint passed. Complete Vitest suite: **495 tests across
  89 files passed**. `git diff --check` passed.
- Production iOS and Android Hermes exports passed with Expo. These are JavaScript
  export checks, **not native compilation or physical-device acceptance**.
- Export tooling reports package-export fallback warnings from the installed
  Expo Router/Sentry integration. Exports complete, but the warnings remain.
- Development Metro tunnel checked via its `/status` endpoint.
- No EAS build, simulator/emulator, deployment, live charge, refund, cancellation,
  account deletion, or production-data write was performed.

Export output is in `/tmp/rawaq-design-review-export` (not tracked).

Metro's current tunnel is
`https://c-yazandaoud-jzvd30-mvq6c3i4btzg6dt8.on.expo.app`.
If a saved server entry has expired, enter this URL in the development launcher.
The server was reachable locally and through the tunnel when this pass finished;
it must stay running for phone reloads.

## Physical review still required

1. Review every gallery scenario in both system light and dark appearance.
2. Check native header positions, close/back/swipe behavior, bottom safe areas,
   and long receipts on the actual phone. Verify compatibility receipt links do
   not reserve header space twice.
3. Verify Search results/availability against the selected location, opening a
   real product, keyboard toggling on tab reselection, and native scroll edges.
4. Inspect Account → Rewards, Profile, Settings and the signed-out Apple sign-in
   sheet. Confirm profile fields stay visible above the keyboard.
5. Check Reduce Motion, Reduce Transparency, VoiceOver labels, and longer names.
6. Verify real sign-in return/session continuity separately. Preview flows do not
   exercise Apple authentication, Stripe callbacks, finalization, order streams,
   notifications, or provider/device behavior.

No new client build is required for these JavaScript/UI changes. All prior local
work is preserved; changes remain uncommitted on the existing `develop` checkout.
