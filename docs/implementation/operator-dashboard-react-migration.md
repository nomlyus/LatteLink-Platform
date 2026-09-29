# Operator Dashboard React / Next.js migration — Phase 0

> Historical Phase 0 inventory. Its App Builder/`experience` descriptions record
> the implementation that existed during the initial audit. The experimental
> dashboard editor has since been removed from V2; do not treat those references
> as current route ownership or active dashboard functionality. Published mobile
> experience and release infrastructure remains in the Catalog/mobile runtime.

## Current implementation checkpoint — final auth/runtime slice

This checkpoint describes the React migration state after the auth, session, Google callback, and invite work. The audit and plan below are a historical Phase 0 snapshot and must not be read as describing current route ownership.

**Verified current route ownership:** `/` is the React auth/Home entry; `/orders`, `/menu`, `/cards`, `/discounts`, `/team`, `/settings`, and `/onboarding` are explicit Next App Router pages; `/invites` is a React invite-acceptance page. There is no optional catch-all or `/legacy/[section]` route. Unknown paths such as `/legacy/orders` are handled by Next's ordinary not-found behavior.

**Verified current runtime:** the old SPA bootstrap and renderer have been removed (`main.ts`, `render.ts`, `events.ts`, `lifecycle.ts`, `state.ts`, legacy views/controllers, and the legacy host). No current React feature imports that runtime. React owns sign-in, session restoration/refresh/logout, Google callback exchange, and invite lookup/acceptance. Feature state and the shared React session/location providers remain client-owned because the existing token is browser-local and the APIs use bearer authorization.

**Verified compatibility behavior:** persisted operator sessions keep the existing `lattelink.operator.session.v2` serialization and API-base validation; logout clears the session record but retains API-base and per-operator location preferences as before. A root Google return still uses `/?google_auth_callback=1`, exchanges the callback with the backend, and removes only callback parameters while retaining unrelated query/hash values. `/invites/#<opaque-token>` reads the fragment, removes it from the address bar before lookup, locally clears any current session without attempting a remote logout, then preserves invite lookup/accept and post-accept password sign-in. Owner launch intent, Stripe return routing, and store-role Orders landing remain in the React root entry logic.

**Inferred:** this completes the route/runtime cutover described by #535 because the last active consumers of the legacy runtime were the signed-out fallback, invite page, and callback/bootstrap path. This claim is guarded by source import searches and dashboard tests; it is not evidence of a successful third-party Google OAuth round trip.

**Unknown:** production or development deploy behavior is not assessed by this code checkpoint. This slice does not change APIs, OAuth provider configuration, token storage format, backend authorization, or deployments.

- **Issue:** [#535 — G2-13: Complete Operator Dashboard V3 React/Next.js architecture migration](https://github.com/nomlyus/LatteLink-Platform/issues/535)
- **Audit baseline:** `develop` at `574ac41d7819f0f2aa80596f5a5e73128abddf8d`
- **Audit date:** 2026-09-28
- **Scope:** architecture audit and migration/coexistence plan only. No dashboard surface, API, or production behavior was migrated in this phase.

## Executive conclusion

The current dashboard is a client-only imperative SPA hosted by a Next.js App Router catch-all. Next.js currently supplies the document, global CSS, error boundaries, Sentry integration, and deployment/build shell; it does not own dashboard navigation or surface rendering. A React migration therefore needs to replace a runtime architecture, not simply convert isolated templates.

The most consequential compatibility constraints are verified in code:

* Section navigation is a mutable `state.section` value persisted in `localStorage`; it is not encoded in the pathname and does not create browser-history entries.
* Google OAuth and Stripe Connect return to the site root (`/`) with query parameters. Owner invitations use the special path `/invites` and a token in the URL fragment.
* The API session (including bearer tokens) is browser `localStorage` state. There is no server-readable session cookie or middleware auth boundary. Refresh is performed by selected lifecycle flows, not by a universal API-client interceptor.
* Order realtime, audio, online/offline handling, dialogs, toast timers, and focus/DOM preservation are attached to the legacy bootstrap and renderer.

**Recommended coexistence model:** retain the existing optional catch-all as a temporary dispatcher. Make `/` React-owned when the first migrated route is ready; host remaining legacy sections below `/legacy/<section>` through a narrow adapter that seeds the existing persisted section before importing the legacy bootstrap. Keep `/invites` as an explicit compatibility entry and keep OAuth/Stripe callbacks at `/`, handled before normal Home rendering. New static App Router routes take precedence over the fallback as they are added. Do not move the legacy app to `/legacy` before the root callback coordinator and invite route have been characterized and tested. Once all legacy surfaces are gone, remove the dispatcher and legacy adapter and use ordinary App Router pages.

This uses `/legacy` only as a controlled bridge at the root cutover, not as an assumption that moving the SPA there is inherently safe. Today there are no section deep links or `popstate` semantics to preserve; the root callbacks and invite URL are the important exceptions and are explicitly retained.

## 1. Current architecture

### Runtime diagram

```text
Browser document / current pathname (normally `/`)
  │
  ▼
Next App Router: app/[[...path]]/page.tsx
  │  returns ClientDashboardRoot; no route-to-section mapping
  ▼
ClientDashboardRoot (React client component)
  │  useEffect → dynamic import("../main")
  ▼
main.ts module bootstrap
  ├─ registerEvents(): document/root delegated click, submit, input, change, key handlers
  ├─ window online/offline + document visibilitychange listeners
  ├─ parse/clean Stripe and launch query parameters
  ├─ process `/invites/#token` and `google_auth_callback=1`
  ├─ load auth provider state and dashboard data
  └─ start order connection/polling
       │
       ├─ state.ts: module-level mutable AppState singleton
       ├─ lifecycle.ts/controllers/*: fetch, auth, mutations, capability checks
       └─ api.ts: fetch + bearer token + Zod response parsing
              │
              ▼
        Nomly Gateway/API endpoints

state mutation → render.ts → views/*.ts return HTML strings
                         → root.innerHTML replacement
                         → render.ts restores selected DOM nodes/state

user event → delegated data-action/data-form → controller → API → state → render
```

**Verified:** `app/[[...path]]/page.tsx` is the only dashboard page route; it returns `ClientDashboardRoot`. The React component has an effect that imports `main.ts` and returns `<div id="app" />` (`apps/client-dashboard/src/app/[[...path]]/page.tsx`, `src/app/ClientDashboardRoot.tsx`). `main.ts` calls `registerEvents()` and orchestrates the lifecycle. `render.ts` builds markup from `views/*.ts` and assigns `root.innerHTML` (`src/main.ts`, `src/render.ts`). Next's optional catch-all convention matches both the route root and nested paths, so a transition dispatcher must account for both explicitly ([Next.js dynamic route documentation](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes)).

**Consequence:** React component boundaries, React state, and App Router navigation currently do not own the surfaces. Server Components cannot directly render authenticated dashboard data from the current client-only token store without changing the auth architecture; this plan does not require that change.

## 2. Routing and navigation audit

### Current section values

The `DashboardSection` union in `apps/client-dashboard/src/model.ts` is:

| Stored value | Current label | Current surface | Availability behavior |
|---|---|---|---|
| `overview` | Home | Owner Home for owners; generic overview state for other non-store operators | Always the initial non-store section; store operators are routed to Orders instead |
| `orders` | Orders | Orders board/list and order-detail sheet | Requires `orders:read` and at least one available location with staff dashboard + order tracking enabled |
| `menu` | Menu | Items, Categories, Modifier Groups | Requires `menu:read` and at least one platform-managed menu in available locations |
| `cards` | News cards | Mobile-home news cards | Requires `menu:read`; one location at a time |
| `discounts` | Discounts | Discount codes | Requires `menu:read`; one location at a time |
| `experience` | App builder | Branded mobile experience editor, preview, publish/version history | Requires `store:read`; one location at a time; the sidebar also labels it “Planned” although an editor/controller/API path exists |
| `store` | Settings | Store configuration and owner onboarding/setup | Requires `store:read`; one location at a time for writes; owner-only onboarding/payments portions |
| `team` | Team | Operator accounts | Requires `team:read`; one location at a time |

The available section list is built in `src/sections.ts` and validated/fallen back by `ensureSectionIsAvailable()`. A second pure function, `getAvailableSections()` in `src/model.ts`, repeats similar policy using a single config. The active layout/events path uses `sections.ts`; the duplicate is a policy-maintenance risk and should be consolidated deliberately during the migration, not by silently changing capability behavior. `onboarding` is not a `DashboardSection`; it is a Settings subsection/wizard.

### What changes section state

All section transitions currently mutate the singleton rather than the URL:

* Initial state: store-role operators get `orders`; other saved users load `lattelink.operator.section.v2`; a missing/unknown value defaults to `overview` (`src/state.ts`, `src/storage.ts`). The old saved value `onboarding` is normalized to `store`.
* `loadDashboard()` reloads the stored section for non-store operators and forces store operators to `orders` (`src/lifecycle.ts`).
* Verified login preserves the current section only when the same operator was already active; a newly authenticated non-store operator lands on Home, while store role lands on Orders (`applyVerifiedSession`).
* Incomplete owner onboarding can override the selected section to Settings and open its wizard. Launch intent can override to Settings/onboarding or App builder (`src/lifecycle.ts`).
* Sidebar `data-action="set-section"` validates availability, updates state, persists it, and calls `render()` (`src/events.ts`). It also stops order refresh and clears pending cancellation when leaving Orders; entering Home loads owner reporting and entering Orders starts the connection.
* Onboarding buttons use the same section action.
* Selecting a workspace location mutates `selectedLocationId`, resets pagination/dialog state, stops order refresh, and reloads the dashboard. It does not update the URL or a persisted location key (`src/events.ts`).

The complete set of section-write sites found by repository search is:

| Write site | Result |
|---|---|
| `state.ts` initial state | Store role starts at `orders`; otherwise use stored section or default `overview`. |
| `sections.ts::ensureSectionIsAvailable()` | If current section is unavailable after location/config loading, choose first available or role fallback (`orders` for store, otherwise `overview`) and persist. |
| `lifecycle.ts::autoOpenOwnerOnboarding()` | Incomplete unseen owner onboarding changes section to `store` and opens step 1. |
| `lifecycle.ts::applyLaunchEntryIntent()` | Owner with incomplete setup goes to `store`; otherwise owner goes to `experience`; non-owner does not change section. |
| `lifecycle.ts::loadDashboard()` | Store role is forced to `orders`; other roles reload the persisted section. |
| `lifecycle.ts::applyVerifiedSession()` | Store role → `orders`; same operator → preserve current section; new non-store operator → `overview`; persist result. |
| `controllers/onboarding.ts::handleStripeOnboardingStart()` and `handleStripeDashboardOpen()` | Set/persist `store` before leaving for Stripe. |
| `events.ts` `return-to-onboarding` and `open-onboarding-wizard` | Set/persist `store`; the first closes wizard, the second opens it at the requested/default step. |
| `events.ts` `set-section` | After validation, assign and persist the requested section; start/stop Orders runtime as applicable. |

There is no `pushState`, `popstate` listener, section URL, or browser back/forward integration for dashboard navigation. The only `history.replaceState` calls clean callback/intent parameters and invite URLs. Consequently Back/Forward does not switch dashboard sections or restore an order/menu dialog. Adding URL navigation is a migration behavior change and needs explicit characterization and tests.

### Current URL/query contracts

| URL/query | Current behavior | Migration constraint |
|---|---|---|
| `/?google_auth_callback=1&code=…&state=…` | Google OAuth redirect URI is normalized to `/`; callback exchanges code/state, strips callback fields with `replaceState`, then applies the session | Preserve root callback path and registered redirect URI. Do not require an external OAuth-console change as part of UI migration. |
| `/?stripeReturn=1` | Stripe Connect returns to root; bootstrap removes the flag then refreshes payment/onboarding status after dashboard load | Root React entry must process this before normal page logic. |
| `/?stripeRefresh=1` | Root return path triggers a new Stripe onboarding link after load | Same as above; retain the distinct refresh behavior. |
| `/?intent=launch` or `/?start=app` | Root bootstrap records a one-shot launch intent, removes parameters, then after authentication opens incomplete owner setup or App builder | Preserve through sign-in and capability/role handling. |
| `/invites/#<token>` | Invite token is accepted only on `/invites` (optional trailing slash), read from the fragment, moved to memory, then the address bar is replaced with `/`; lookup/accept runs in auth controller | Preserve exact path and fragment behavior; avoid copying the token into logs, query parameters, or a server-rendered URL. |
| `?homeState=…`, `?pageState=…` | Internal visual-state preview parameters used by Home/page-state rendering | Test/development affordances, not route state. Keep out of user navigation semantics. |

Google callback parsing is in `src/google-callback.ts`; Stripe/launch parsing is in `src/main.ts`; invite parsing is in `src/controllers/invite-url.ts` and processing is in `src/controllers/auth.ts`. Sentry scrubbing for invite details is in `src/sentry-scrub.ts`.

## 3. Current surfaces and entry contracts

“Location scope” below is UI/data scope, not the server authorization boundary. The Gateway/API remains authoritative for each request.

| Surface / entry | Render and controller | Principal state/data | API/domain dependencies | Capability, role, and location behavior | Dialogs / navigation behavior |
|---|---|---|---|---|---|
| Sign-in / auth providers | `views/auth.ts`; `controllers/auth.ts`; delegated forms in `events.ts` | `session`, `authApiBaseUrl`, email/password, auth provider state, error, signing-in, invite state, launch intent | Password/dev sign-in; `/operator/auth/providers`; refresh/logout; Google start/exchange; invite lookup/accept; merchant launch request | Unauthenticated; dashboard capabilities do not apply. Successful session resolves role/location from auth response. API base URL override is exposed only in local development UI. | Full-page Google redirect; inline auth screens. Invite acceptance mutates auth and then signs in. Launch-intent query is held in memory after URL cleanup. |
| Owner invite | `controllers/invite-url.ts`, `controllers/auth.ts`, `views/auth.ts` | token in memory, lookup/status/accepting | invite lookup and accept, then password sign-in | Token-fragment path `/invites`; no dashboard capability yet | No modal; URL is scrubbed before network lookup. |
| Owner Home | `views/owner-home.ts`; `lifecycle.ts::loadOwnerHomeReport`; `events.ts` period/chart handlers | ownerHome period/metric/loading/report/error, selected location(s), available-location timezone, orders for attention section | `/admin/reporting/query`; dashboard snapshot/orders for operations/attention and location cards | Owner-only rendering of reporting Home. One selected location or All locations; All uses selected location IDs and requires usable timezone metadata. Overview still exists for non-store non-owners but renders generic operational state instead of owner reporting. | No surface modal. Reporting period and chart metric are local state; changing period reloads report. |
| Onboarding / launch setup | `views/onboarding.ts` embedded in `views/store.ts`; five-step wizard; `controllers/onboarding.ts` | onboarding summary, current step/open state, busy flags, store config, identity draft and payment readiness | onboarding summary/update/review; store config; app identity; Stripe onboarding/dashboard/status APIs | Owner-only setup/payment actions. Requires a specific selected location; all-location writes are rejected client-side. | Wizard modal with step state. Launch intent can auto-open wizard or App builder. Stripe navigates away and returns to root query. |
| Orders | `views/orders.ts`; `controllers/orders.ts`; `orders-runtime.ts` | orders, filter/page/ticket filter, selected order, details open/opening/closing, connection state, refresh/error, pending-cancel timer, busy order | `/admin/orders`; `/admin/orders/stream`; update status; cancel-and-refund; completed-order refund | Read: `orders:read` plus store config enables nav. Store role is limited to assigned location. All locations can be read/aggregated; status/cancel controls require a specific location and `orders:write`; cancel/refund also checks `payments:refund`; refund is shown for owner on All locations and for non-owner only with a specific location. Feature/fulfillment settings gate manual status operations. | Order details modal sheet; cancel uses inline confirmation and a 10s undo/confirm window; refund reason uses native `window.prompt`; status changes run through controller and apply returned order locally. |
| Menu | `views/menu.ts`, `views/menu-items.ts`, `views/menu-categories.ts`, `views/menu-modifier-groups.ts`; `controllers/menu.ts` | categories/items/groups, selected tab, filters/search/page, editor entity/kind, nested modifier-group picker, drafts, busy flags, source/config | Snapshot `/admin/menu`; item/category/modifier CRUD/reorder/assignments; signed image upload path | Requires `menu:read`; normal mutation requires `menu:write` and platform-managed source; visibility has separate `menu:visibility`. Menu editors require one location. At All locations, UI presents a location-selection notice. A read-only external-sync view is possible when Menu is available through another platform-managed location; when all locations are external-sync, current navigation omits Menu entirely. Server enforcement is outside the UI. | Item/category/modifier dialogs/sheets; nested “create modifier group” dialog; browser confirm for delete; focus trap/restore behavior is manually implemented. |
| News cards | `views/cards.ts`; `controllers/cards.ts` | news cards, create/edit/visibility/delete busy state | `/admin/cards` replacement operation | `menu:read`; `menu:write` for create/edit/delete and `menu:visibility` for visibility; specific location only | Inline forms and browser confirm for delete; no central modal. |
| Discounts | `views/discounts.ts`; `controllers/discounts.ts` | discount code list/forms/busy | `/admin/discount-codes` create/update | `menu:read` to read and `menu:write` to mutate; specific location only. | Inline forms; no bespoke dialog. |
| Team | `views/team.ts`; `controllers/team.ts` | staff users, pending updates, busy user, selected location | `/admin/staff` create/update/delete; onboarding setup update on team completion | `team:read` to enter/read, `team:write` to edit; owner role is additionally required by UI for deleting accounts; specific location only. | Inline forms; native confirmation for deactivate/delete. |
| Settings / store | `views/store.ts`; `controllers/store.ts` | store config, selected location, save state; may include owner setup summary | `/admin/store/config` read/update; onboarding APIs where owner setup is rendered | `store:read` to enter; `store:write` to mutate; store config is location-scoped; owner setup is owner-only and specific-location. | Inline form; wizard can overlay. |
| Branded-app management / App builder | `views/experience.ts`; `controllers/experience.ts` | experience draft, version history, build jobs, busy/publishing/rollback IDs | `/admin/mobile-experience`, versions, build jobs; draft update/publish/rollback | `store:read` section gate; `store:write` to save/publish/rollback; one location only. Owner launch intent routes here after setup. | Inline editor/preview/version history; not a separate route today. “Planned” sidebar badge conflicts with implemented UI/code path; whether that label is stale is inferred, not established. |
| Location selection / store identity | selector and shell in `views/layout.ts`; location resolver in `lifecycle.ts` | `availableLocations`, `selectedLocationId`, per-location config | `/app-config` for each authorized location; `/admin/store/config` when `store:read` | Multi-location non-store users default to `all`; store role is pinned to assigned location. Selection is in-memory only and resets from session/default after reload. There is no current location create/delete lifecycle screen; “store/location management” in this dashboard is selection plus per-location settings. | Global select in top bar; changing it reloads data and resets selected menu/order interaction. |

### Data loading and API boundary

`src/api.ts` is a browser-oriented typed HTTP client. `requestJson` builds API URLs, attaches a bearer token when provided, parses JSON, and validates responses with shared Zod contracts. No view calls the Gateway directly. `fetchDashboardLocations()` loads `/app-config` and (when allowed) `/admin/store/config` per location. `fetchOperatorSnapshot()` loads the active location's config, orders, menu, cards, discounts, store config, experience draft/versions/build jobs, and team in one `Promise.all`, conditioned by operator capabilities. At All locations `loadDashboard()` instead loads orders per location and deliberately clears location-specific menu/store/team surfaces.

Owner reporting is separately requested by `loadOwnerHomeReport()`; comments explicitly state that a stale/unavailable orders API should not take down analytics. By contrast, the location snapshot is a single `Promise.all`: one failed member rejects that snapshot. `loadDashboard()` currently catches that failure into a menu-load message and, for non-silent loads, clears orders. This is a verified error-boundary inconsistency to preserve/characterize before splitting data hooks; this Phase 0 plan does not change it.

### Deployment contract observed in-repository

* `apps/client-dashboard/vercel.json` declares the `nextjs` framework.
* `.github/workflows/configure-vercel-dev-domains.yml` and `scripts/configure-vercel-dev-domains.mjs` provide a manually dispatched Vercel domain association; the client-dashboard target is `app-dev.nomly.us` and the default branch input is `develop`.
* The repository's `lattelink-vercel.yml` workflow deploys `apps/lattelink-web`, not `apps/client-dashboard`. No dedicated client-dashboard Vercel deploy workflow was found. The monorepo CI workflow runs typecheck/lint/test/build tasks but does not itself deploy the dashboard.
* **Unknown from repository evidence:** whether the Vercel client-dashboard project is Git-connected and auto-deploys pushes to `develop`, its configured project root, or which runtime routing/rewrite settings are active. Verify the Vercel project settings and a preview deployment before relying on deep-link refresh behavior. Do not claim repository CI automatically deploys this dashboard.

## 4. State ownership map

### Current state

`src/state.ts` contains a single mutable `AppState` covering unrelated domains: auth/session; locations and app config; onboarding and launch; owner reporting; Orders; Menu; cards/discounts; store/experience/releases; Team; dialogs; busy flags; network/refresh; and toasts. `src/model.ts`, `src/menu-page-model.ts`, `src/customizations.ts`, `src/team-state.ts`, and `src/overview-data.ts` contain varying amounts of pure behavior, but controllers and views mutate/read the same singleton. The section/local persistence boundary is `storage.ts`.

| Concern | Current owner | Persistence / lifetime | Proposed React owner |
|---|---|---|---|
| Access/refresh token + operator identity | `state.session`, initialized via `storage.ts` | `localStorage` JSON; cleared locally on sign-out/invalid stored shape/API-base mismatch. Refresh is checked on dashboard/report/order-refresh lifecycle paths; `api.ts` has no universal refresh interceptor. Auth failures handled by lifecycle/controllers sign out locally. | `AuthProvider`/session store with explicit initialize, refresh, sign-in/out, and expiry transitions; browser-only. Reuse API/session schemas. Do not move tokens to SSR without a separately approved auth design. |
| API base URL | `state.authApiBaseUrl` | `localStorage`, checked against build default; localhost can expose override | `ApiClientProvider`/configuration module, stable per session; preserve environment mismatch clearing semantics. |
| Active route | `state.section` | `localStorage` key `lattelink.operator.section.v2`; not in URL/history | App Router pathname is canonical after each surface migrates. A compatibility adapter reads/writes the old key only when entering/leaving legacy. |
| Location scope | `state.selectedLocationId` | memory only; recalculated from role/session after reload; All for multi-location non-store role | `LocationScopeProvider` shared in dashboard layout; preserve store pinning and explicit specific-location requirements. Keep URL persistence out until deliberately specified/tested. |
| Owner reporting query | `state.ownerHome` | memory; timeframe/chart selections | `useOwnerReport` data hook plus route-local metric/period UI state. Abort/stale response guards keyed by operator, location set, and date range. |
| Orders cache/realtime | `state.orders`, selected order, connection state and timers | memory; stream is location-scoped; sessionStorage only dedupes order alert IDs | `OrdersProvider`/feature hook mounted only while authorized and relevant; own subscribe/unsubscribe, polling fallback, stale-scope guard, and selection. Keep server order mutations authoritative. |
| Menu/catalog | categories/groups/filter/dialog/drafts in `state` | memory, reloaded from `/admin/menu`; saved data server-side | Feature-local query/state; keep API/domain contracts and availability/visibility semantics. Dialogs and filters local unless a route-level deep link is explicitly added. |
| Store/team/discount/cards/experience | fields in same singleton | memory; one-location API requests | Feature route loaders/hooks and local form state. No cross-feature global state beyond session, location, and shared shell. |
| Modals/wizards | multiple `state.*Open`, selected IDs, animation flags and timeout handles | memory, lost on navigation/reload | Local component state with accessible dialog primitive and cleanup; encode in URL only if deep-link requirement is established. |
| Toasts | `state.toasts` plus `toast-runtime.ts` timer map | memory; 5s visible + 300ms fade | Shared `ToastProvider`/announcer with effect cleanup and stable IDs. |

## 5. Browser and runtime lifecycle inventory

| Browser/runtime dependency | Current behavior and source | Migration requirement |
|---|---|---|
| `localStorage` | `storage.ts`: session JSON (includes access/refresh tokens), API base URL, active section, per-operator/location onboarding-wizard-seen flags | Keep reads client-only and handle storage unavailable/malformed values. Add explicit migration tests; never read localStorage during Server Component render. |
| `sessionStorage` | `order-alert.ts`: dedupe up to 500 seen order IDs per operator/location scope | Preserve dedupe across reload in the tab; test storage denial and scope changes. |
| SSE/realtime orders | `api.ts::subscribeToAdminOrderStream()` uses authenticated `fetch` + `ReadableStream` and `AbortController`, not browser `EventSource`; parses snapshot/update payloads and reconnects with exponential delay capped at 30s | Move into a hook/service with guaranteed abort/timer cleanup and only mount for entitled, relevant location; retain schema validation and scope guards. |
| Poll fallback | `orders-runtime.ts`: 30s polling; used for All locations and while stream reconnects/unavailable; connected stream clears fallback | Preserve aggregate correctness: an individual location stream must never replace All-locations order state. |
| Online/offline | `main.ts`: `online` reconnects and renders; `offline` renders; Home detects `navigator.onLine` | Use `useSyncExternalStore` or effect listener with cleanup; characterize offline UX and recovery. |
| Visibility | `visibilitychange` on document; on visible resumes audio and refreshes order connection | Hook must remove listener and avoid duplicate subscriptions; test hidden→visible and unmount. |
| Audio | `order-alert.ts` creates WebAudio context, user action enables sound, plays test chime, resumes on visible; alerts only on PAID/IN_PREP/READY new orders | Keep behind user gesture and feature permission; handle unsupported/rejected AudioContext without blocking Orders. |
| Timers | 30s poll; SSE reconnect timers; 10s pending cancel; order detail 420ms close; menu dialog 360ms close; onboarding/modal state; toast 5s + 300ms fade | All timers must be owned by mounted effects/components and cleared on scope change/unmount. Existing timer references live in singleton state or module maps. |
| Focus | Manual modal focus trap; menu dialog opener action+data keys are remembered and focus is restored; order details/buttons explicitly focus in some paths; rerender preserves focused refresh and selected controls | Replace with accessible dialog/focus management and test open/close, Escape, Tab cycling, opener removal, route change. |
| Scroll/DOM preservation | `render.ts` replaces full `#app` HTML, then preserves menu table image nodes, sidebar, conditional topbar/global search/notification elements and store-summary animation; Orders-only refresh preserves horizontal table scroll and Refresh focus | React should eliminate DOM surgery. Characterize whether order vertical/horizontal scroll, scroll position, input cursor, and image-load continuity matter. Do not cargo-cult node preservation. |
| Form/control focus | `events.ts` has helpers to rerender while preserving form control focus/value/selection; keyboard tab handling and row Enter/Space behavior | Move behavior to controlled inputs/React events and preserve keyboard semantics. |
| Toast lifecycle | Module-level timer map; rerenders via registered `renderToasts` callback; 5s then fade/remove | Provider cleanup and route-stable announcements; prevent dangling timers after legacy unmount. |
| Navigation/history | Section clicks call `render`, no push/replace/popstate. `replaceState` only strips callback/intent query and invite paths | New routes should use App Router and browser back/forward. Test callback cleanup does not erase unrelated query/hash and route transitions do not double-submit callbacks. |
| Bootstrap lifetime | `main.ts` is dynamically imported from `useEffect`; `registerEvents()` attaches document/root listeners and returns no disposer; `main.ts` also attaches window/document listeners. Next config enables `reactStrictMode`. | Do not mount legacy bootstrap in a React effect that can be duplicated/unmounted without an idempotent start/stop boundary. Ensure exactly one runtime owns a page. |
| Error reporting | Sentry client instrumentation in `instrumentation-client.ts`, server/edge config, Next `error.tsx`/`global-error.tsx`; invite scrubbing hook | Preserve Sentry environment/release and invite-token scrubbing; add component/API boundary reporting without logging credentials/query secrets. |

## 6. Reusable versus legacy-coupled code

Classification is by current dependency shape, not by filename or assumed future value.

### A. Framework-independent and reusable

* Shared contract schemas/types in `packages/contracts-*`; API response validation and domain statuses.
* Pure order/menu helpers in `src/model.ts`, `src/menu-page-model.ts`, `src/customizations.ts`, `src/team-state.ts`, `src/overview-data.ts`, and date/range/format helpers where no DOM access occurs.
* Capability predicates, section availability rules, selection normalization and ordering/pricing presentation helpers after separating them from singleton reads.
* `api.ts` request/response functions are framework-independent in the sense that they do not depend on React, but are browser fetch/auth-token oriented; classify them as reusable service code, not server-callable API routes.

### B. Reusable with React hooks/providers/adapters

* API functions and Zod contracts: retain as a typed client; inject session/API base, add cancellation and stale-response handling at the hook boundary.
* Auth/session and storage: retain schema/normalization and refresh logic, but wrap with a client-side provider; explicitly own initialize/refresh/sign-out state transitions.
* Capability and location decisions: retain pure rules, expose them through context/hooks and route guards; establish one canonical section/capability policy rather than two lookalikes.
* Orders stream/polling/audio; toast runtime; online/visibility events; Sentry callback scrubbing; upload flow; modal focus semantics. These need effect cleanup and provider/component lifecycle ownership.
* `lifecycle.ts` is mixed. Its business/data decisions can be split into use cases/hooks; its renderer calls, broad singleton mutations, and global load orchestration should not be transplanted wholesale.

### C. Tightly coupled to the HTML-string renderer and intended to disappear

* `render.ts` `innerHTML`, preservation/replacement logic, root lookup at module initialization.
* `events.ts` document/root delegation, `data-action`/`data-form` dispatch, manual DOM focus/rerender helpers.
* `views/*.ts` markup string construction and escaping; `views/layout.ts` switch dispatch based on singleton state.
* Most of `main.ts` bootstrap and controller methods that assume HTML forms, `FormData`, direct state mutation, and `render()` calls. Extract API use cases/side effects; replace presentation orchestration.
* The monolithic `state.ts` as global mutable view state. Domain-shaped subtypes may guide React feature state, but the singleton itself should not become a React global store.

## 7. Test coverage and characterization gaps

Current client-dashboard tests live in `apps/client-dashboard/test`. The suite already characterizes meaningful pieces, but not the whole browser boot/session/route lifecycle.

| Area | Existing evidence | Missing before/during migration |
|---|---|---|
| Auth/session | `auth-controller.test.ts` verifies invite token accepted only from fragment on `/invites`; `auth-view.test.ts`; `api.test.ts` covers auth/API payload helpers; `storage.test.ts` covers API base mismatch and old section normalization; `model.test.ts` covers refresh-window predicate | Password login → persist → reload; refresh success/failure; expired/401 sign-out, remote logout failure, section/role landing after login; Google callback success/error/incomplete/cleanup and duplicate invocation; invite lookup/accept end-to-end; launch-intent retained over auth. |
| Role/capabilities | `sections.test.ts`, `model.test.ts`, surface tests | Route-level denial/redirect; owner vs manager vs store role for every route/action; capability-only subsets; server rejection remains visible; external-sync read-only route availability. |
| Location scope | API tests cover location query parameters; Orders runtime rejects another location; sections and views cover some All-locations restrictions | Selector changes while requests are pending; stale response suppression for every feature; role pinning after reload; All→specific→back; deep link with unauthorized location; location scope not leaking between browser tabs. |
| Orders realtime | `order-stream.test.ts` covers reconnect and unsubscribe; `orders-runtime.test.ts` covers location-filtered snapshots and polling fallback; `order-alert.test.ts` covers dedupe/audio tracker | `main.ts` online/offline/visibility integration; mount/unmount cleanup; duplicate subscriptions; session/location change during callbacks; stream plus mutation reconciliation; All-locations poll; lifecycle after route transition; browser Back. |
| Order mutations | `orders-controller.test.ts`, `orders-view.test.ts`, `model.test.ts` cover representative status/refund/cancel control and view states | Full client API mutation error/401 path; rapid repeated action; modal focus and selection after mutation; location-scope race; refunded/partial-refund/canceled status parity in route UI. |
| Menu | `menu-controller.test.ts`, `menu-page-model.test.ts`, `menu-view.test.ts`, `customizations.test.ts` cover redesigned relational management behaviors | Browser route entry/exit, refresh and session expiry during dialogs/upload, file upload cancellation, React rerender/focus/keyboard behavior, location switch while saving, external-sync UI plus backend rejection integration. |
| Other sections | API tests and limited section/team/experience view tests | Route-level loading/error/empty and capability handling for Cards, Discounts, Team, Settings, App builder, onboarding and release jobs; mutation success/error under React lifecycle. |
| Browser callbacks/navigation | Helper/API tests exercise parts of Stripe URLs and OAuth parsing | Actual root callback routing in Next; `replaceState` preservation; Google callback exact redirect URI; invite hash route and Sentry redaction; query launch intent; Back/Forward and refresh on each migrated route. |
| Rendering/accessibility | string assertions for views; menu keyboard behavior is implemented in delegated event code | Browser tests for tab order, focus trap/restore, announcements, responsive layout, hydration/Strict Mode, error boundary and no-JS/loading behavior. |
| Bootstrap lifecycle | No bootstrap integration test found; `registerEvents` has no teardown return | Start/stop idempotency, repeated mount, listener count, hot reload, timer cleanup, no duplicate API calls under React Strict Mode. |

Test file inventory includes `api`, `auth-controller`, `auth-view`, `customizations`, `menu-controller`, `menu-page-model`, `menu-view`, `model`, `order-alert`, `order-stream`, `orders-controller`, `orders-runtime`, `orders-view`, `owner-home`, `sections`, `sentry-scrub`, `storage`, `team-state`, and `toast-runtime` tests. The test layer is mostly Vitest/module-level, not a browser-level navigation suite.

### Required characterization tests before surface conversion

1. A bootstrap test with a disposable browser DOM: exactly one event/runtime start; cleanup removes listeners, stream, intervals, and timeouts.
2. Session matrix: first load, same-operator refresh, new owner/manager/store login, refresh near expiry, 401, sign-out, malformed/mismatched stored session.
3. Callback matrix: Google success/error/incomplete, Stripe return/refresh, launch intent, invite hash; verify exact path/query/hash cleanup and no secret in telemetry.
4. Section/location matrix: all role/capability combinations; owner Home + multi-location; location switch during outstanding read/write; store role location pinning.
5. Orders browser integration: stream snapshot/update, reconnect/poll fallback, offline/online, visibility resume, status/cancel/refund, order snapshot selection and sound opt-in.
6. Menu route integration: relational read/write, upload, category/modifier dialogs, external-sync read-only, location switching, and authorization/API errors.
7. Browser navigation: direct route entry, reload, Back/Forward, query preservation, focus/scroll restoration, route-level error recovery.

## 8. Proposed target architecture

The target is App Router route ownership plus client-side feature components wherever interaction requires it. There is no requirement to maximize Server Components: current auth and API access are browser-token based, and Orders/Menu are interactive.

```text
apps/client-dashboard/src/
  app/
    layout.tsx                       # metadata, global CSS, Sentry boundaries
    page.tsx                         # root dispatcher/callback coordinator + Owner Home
    (auth)/sign-in/page.tsx
    invites/page.tsx                 # fragment-safe invitation entry
    (dashboard)/layout.tsx           # client auth gate, shell, location scope, nav
    (dashboard)/orders/page.tsx
    (dashboard)/menu/page.tsx
    (dashboard)/cards/page.tsx
    (dashboard)/discounts/page.tsx
    (dashboard)/team/page.tsx
    (dashboard)/settings/page.tsx
    (dashboard)/experience/page.tsx
    legacy/[section]/page.tsx        # temporary bridge only
  components/
    shell/ navigation/ location-picker/ dialogs/ forms/ feedback/
  features/
    auth/ session-provider.tsx sign-in-form.tsx callback-coordinator.tsx
    home/ owner-home.tsx use-owner-report.ts
    orders/ orders-page.tsx use-orders.ts use-order-stream.ts order-detail-sheet.tsx
    menu/ items/ categories/ modifier-groups/ use-menu.ts
    cards/ discounts/ team/ settings/ experience/ onboarding/
  providers/
    auth-provider.tsx location-scope-provider.tsx toast-provider.tsx
  lib/
    api/ client.ts operator-api.ts
    auth/ session-storage.ts capabilities.ts
    routing/ section-routes.ts legacy-bridge.ts callback-urls.ts
    browser/ online-status.ts visibility.ts audio.ts
    domain/ (only existing pure helpers that merit extraction)
```

Folder names are a proposed ownership boundary, not a requirement to split every file on day one. Keep app route files thin. Feature pages own route-specific loading/error/empty data behavior. `lib/api` remains a client using the existing shared contracts and Gateway routes; there is no backend/API rewrite. The dashboard shell owns shared auth, capability, and location scope. Route guards are UX only; Gateway authorization remains the security boundary.

### Route and state ownership target

| State | Canonical target |
|---|---|
| Current surface | pathname/App Router; section switch creates history and reload/deep-link works |
| Auth callback intent | callback coordinator at root plus dedicated invite route; consume once and clean URL without dropping unrelated parameters |
| Session/API base | client AuthProvider around existing storage/API logic; never access browser storage in server rendering |
| Role/capability | shared auth context backed by auth response; route/action policy helper with Gateway still authoritative |
| Location scope | shared provider initialized from allowed locations and role. Preserve current All/default/pinning behavior first; no new URL persistence until product decision. |
| Server data | route/feature hooks using current API methods, abort signal where possible, identity/location keys, and stale response suppression. Avoid introducing a cache framework without need. |
| Filters/dialogs/forms | feature-local React state; preserve existing defaults and validation; forms own submission/error/busy state |
| Toast/audio/realtime/browser events | providers/hooks with mounted lifecycle, explicit cleanup, and focused tests |

## 9. Temporary coexistence architecture (recommended)

### Route dispatcher and ownership rules

The current `app/[[...path]]/page.tsx` can be used temporarily as a dispatcher while static App Router routes are introduced:

* `/` becomes the React-owned root (Owner Home after auth); the root callback coordinator handles the existing Google, Stripe, and launch query flows before choosing normal Home/auth UI.
* `/legacy/<section>` mounts the existing imperative SPA only for sections not yet converted. The adapter validates the requested current `DashboardSection`, writes the already-existing `lattelink.operator.section.v2` value **before** importing `main.ts` (because `state.ts` reads storage at module initialization), and then renders the legacy root. Unknown/unauthorized values fall back through the existing `ensureSectionIsAvailable()` policy.
* `/invites` remains a compatibility entry to the legacy invite screen until invite acceptance is moved into a React auth feature. It must preserve the current fragment-only token parsing and clear the URL before lookup.
* New routes such as `/orders` and `/menu` are explicit React pages. Confirm route matching/build behavior with the current Next.js version before relying on overlap with the optional catch-all. Legacy links for a converted surface use the route adapter to navigate to its React route; React navigation to an unconverted surface enters `/legacy/<section>`.
* Never mount `main.ts` on a React-owned route. The legacy bootstrap attaches global listeners and has no disposer; two runtimes in one document would risk duplicate side effects and conflicting state.
* Retain `/` as the configured Google/Stripe callback URL. After callback processing, route according to the verified session/role and one-shot launch intent. No provider-console URL change is part of the migration plan.

This route bridge is safer than leaving the whole legacy app at `/` until the end because it permits the issue's Home-first route migration while retaining legacy Orders/Menu/etc. It is safer than moving everything to `/legacy` immediately because it is introduced only alongside tested React root callback handling and preserves `/invites` as a special path. The section in `/legacy/<section>` is a bridge selector, not a claim that the current dashboard already has deep links.

### Transition/fallback behavior

* Session remains same-origin browser storage, so route navigation does not force reauthentication. Auth initialization must resolve before displaying a protected route, and logout must clear the old session in both runtimes.
* A legacy operator action that selects a not-yet-migrated section can remain inside the SPA. Selecting a migrated section performs a full App Router navigation. Add a small map from `DashboardSection` to route/legacy URL; do not scatter string mappings across old and new sidebars.
* If a React page/API fails, show its route-level error state and retry; do not silently launch a second legacy runtime over it. An explicit “Open legacy version” escape may be added only for a still-unmigrated surface and only if it does not mask API/auth errors.
* During local development, validate direct navigation and hard reload for `/`, `/legacy/orders`, `/legacy/menu`, `/invites/#token`, and root callback queries. Deployment must route all of these paths to the same Next application; verify the current Vercel project's root, branch deployment, and deep-link behavior before first route rollout.
* Remove `/legacy` adapter and the optional catch-all only after all active sections, auth/invite, callbacks, and lifecycle behaviors have React parity and the old tests are replaced/retained as appropriate.

### Coexistence alternatives considered

| Alternative | Evidence-based assessment |
|---|---|
| Leave the complete SPA at `/` and put React under a temporary `/v3/*` prefix | Lowest callback risk, but Home cannot own the canonical root during the planned Home-first migration; introduces a second dashboard namespace and delays route cutover. Useful only if callbacks cannot be kept at root in the new app. |
| Move the SPA to `/legacy` immediately | Not recommended as the first step. Google/Stripe explicitly return to `/`; invite handling explicitly requires `/invites`; the legacy state has no pathname section decoder. A raw move would break or strand those entry paths unless callback and route adapters were built first. |
| Recommended dispatcher + `/legacy/<section>` bridge | Supports React root/Home and real React routes while unconverted surfaces continue to use the same renderer; preserves callback URLs and provides an explicit bridge selector. Requires one tested dispatcher and a single legacy runtime per document. |

## 10. Migration sequence

Each phase should be independently typechecked/tested and deployable on `develop`; preserve the existing visual language and API semantics. Do not change backend ownership or contracts as part of this migration.

1. **Phase 0 — this document:** architecture/callback/scope/test inventory and agreed coexistence model. No surface migration.
2. **Phase 1 — runtime boundary and tests:** characterize bootstrap/session/callback/location behavior; extract reusable session/callback operations from renderer controllers; implement route dispatcher and a lifecycle-safe legacy host; keep all surfaces on legacy rendering until routing tests pass. No Home UI rewrite in this infrastructure-only commit.
3. **Phase 2 — Owner Home / root:** implement shared client auth gate/shell and owner reporting Home at `/`; preserve manager/store landing behavior; preserve root Google/Stripe/launch callback contracts; put remaining legacy sections behind `/legacy/<section>`. Confirm `/invites` works before redirect or route changes.
4. **Phase 3 — Orders:** route `/orders`, capability/location controls, order detail sheet, mutations, SSE/polling/audio/offline/visibility lifecycle; run browser integration and location isolation tests.
5. **Phase 4 — Menu:** route `/menu`, reuse current relational Catalog APIs/contracts, role/source/location behavior, image upload, category/modifier/item management, and editor dialogs; no domain or backend rewrite.
6. **Phase 5 — remaining existing sections:** Cards, Discounts, Team, Settings/onboarding, App builder. Keep the current exact `store:read`/`store:write`, owner-only onboarding/payments, `menu:read`/`menu:write`/`menu:visibility`, and `team:read`/`team:write` boundaries.
7. **Phase 6 — shared browser lifecycle and route polish:** ensure every event/timer/stream has teardown; implement back/forward, focus/scroll, error/loading/degraded UX and callback hardening; run cross-route and role/location matrix.
8. **Phase 7 — remove legacy:** only after route and behavior parity, delete `main.ts`, `render.ts`, `events.ts`, old HTML-string views, legacy bridge, and obsolete singleton state. Keep reusable domain/API helpers and characterization tests where still relevant.

### Exact first implementation slice after Phase 0

**Phase 1 starts with the compatibility/runtime boundary, not a Home component:**

1. Add characterization tests for the current root OAuth/Stripe/launch handling, invite fragment, session refresh/expiration, role landing, location selection, and one-start/one-stop browser lifecycle.
2. Add the route dispatcher/legacy host contract (root callback coordinator, `/legacy/<section>` seed-before-import adapter, preserved `/invites`) while rendering existing surfaces unchanged. Add direct-load/reload tests for each bridge path.
3. Extract session/callback use cases so they no longer require `render()` as a side effect; both legacy and React can consume them during transition.
4. Only after that passes, the first surface slice is Owner Home at `/`, with owner report loading isolated from other dashboard data and the existing date ranges, location/timezone semantics, zero/unavailable behavior, operational attention, and error states preserved.

This order addresses the hardest failure mode first: an authenticated page can be reached directly, survive reload and callbacks, and coexist with the legacy runtime before its first production surface changes. It does not migrate Orders, Menu, or any other surface in Phase 0.

## 11. Risks and controls

| Risk | Evidence / impact | Control in plan |
|---|---|---|
| Root callback regression | Google and Stripe return URLs are hardcoded to `/`; launch intent is root-query based. Losing them can strand onboarding/payment setup or break sign-in. | Preserve root callback URI; callback coordinator before Home; integration tests against real query/hash shapes. |
| Invite token leakage or lost invite | Token is fragment-only and `clearInviteUrl()` replaces the address with `/`; changing pathname behavior can change the URL read before client code runs. | Keep `/invites` explicit; never put token in server params/telemetry; preserve Sentry scrubbing and test URL cleanup. |
| Auth not available to server render | Access/refresh tokens are localStorage; middleware/server components cannot read this session. | Keep authenticated shell client-side initially; no server-side data fetching or cookie migration in this task. |
| Duplicate/unclean legacy runtime | `registerEvents()` and browser listeners have no cleanup; Next has `reactStrictMode: true`; legacy module bootstrap is a side effect. | One runtime per document; add idempotent start/stop/disposer and cleanup tests before mount under route lifecycle. |
| Location data leakage or stale writes | All-location and location-specific data are loaded differently; API requests use `locationId`; current selected location is memory-only. | Preserve server checks; key/abort requests by session and location; test scope changes during pending request and store-role pinning. |
| Capability drift | `src/model.ts` and `src/sections.ts` carry similar section policy; UI gates are not a substitute for Gateway auth. | Establish a single shared client policy helper; exercise role/capability matrix; do not weaken backend checks. |
| Realtime regression | SSE stream snapshots are scoped; All locations relies on polling; audio needs user gesture. | Orders-specific lifecycle tests across mount, reconnect, offline/online, visibility, location/session changes, unmount. |
| Renderer assumptions hidden in helpers | Focus, scroll, modal animation, image node continuity and file uploads are manually coordinated around `innerHTML`. | Characterize only user-visible requirements; rebuild with React-controlled forms and dialogs, not copied DOM preservation. |
| Error behavior changes | `fetchOperatorSnapshot()` uses a shared `Promise.all`; one failure is rendered as a menu-load message and can clear Orders. | Preserve/explicitly test before decomposing queries; distinguish intentional behavior change from migration regression. |
| URL/history behavior changes | No current section history; React routes introduce browser Back/Forward semantics. | Add direct/reload/back/forward tests and define whether modal/filter state is history-addressable. |
| Scope creep into future product routes | Issue's target example includes future Analytics/Customers/Marketing/Stores, while current implementation has only the sections in this audit. | Migrate only current working surfaces; do not build new Analytics/Customers routes under this architecture task. |

## 12. Rollback strategy

* **Before root cutover:** revert or disable the dispatcher/static route change; the original optional catch-all and `main.ts` remain available and the API contracts are unchanged.
* **During coexistence:** keep legacy surfaces reachable under `/legacy/<section>` and keep the legacy renderer in-tree. A React surface can be routed back to the legacy bridge without reverting backend data or migrations.
* **Root/Callback rollback:** preserve an explicit route-map switch that can return `/` to the legacy dispatcher while retaining `/invites` and the root callback handlers. Never roll back by changing OAuth/Stripe destinations without separately updating/validating their providers.
* **Per-surface rollback:** route the surface back to the legacy host and retain its previous code/tests for the agreed observation window. Do not run two runtimes simultaneously in one DOM.
* **Final legacy removal:** only after the agreed production observation/acceptance period. A code rollback remains a deployment/revision rollback; this plan requires no database migration and creates no persisted-data rollback requirement.

## 13. Evidence status and unanswered questions

### Verified

* The audit baseline is `develop` at `574ac41d7819f0f2aa80596f5a5e73128abddf8d`, and the checkout was clean at inspection time.
* The Next App Router has one optional catch-all page for the current app; that page mounts a React component which imports imperative `main.ts` in an effect.
* Section navigation is state/localStorage based; browser Back/Forward does not currently navigate dashboard sections.
* Google and Stripe callbacks use `/`; invite acceptance uses `/invites/#token`.
* Session and API base are client localStorage; API requests use bearer tokens and shared response schemas.
* Orders use authenticated fetch-stream SSE with reconnection and polling fallback; browser visibility and network state are wired in `main.ts`.
* Current surfaces and client capability gates are represented in `sections.ts`, views, controllers, and typed API functions as mapped above.

### Inferred (strongly suggested, not explicit intent)

* The existing `experience` “Planned” badge is likely stale relative to implemented editor/publish code, but source history/product intent should be checked before removing it.
* `/legacy/<section>` is the lowest-risk coexistence bridge because the current section is not URL-addressable and the exceptional external URLs can remain fixed; validate provider/deployment path behavior before implementation.
* A client-side AuthProvider is the smallest migration-compatible choice given token storage; adopting server auth would be a separate security/architecture decision.

### Unknown / needs confirmation before implementation

* Whether dashboard Vercel deployments are triggered by Git integration, their project root, and which hosting/rewrite layer handles arbitrary deep paths in each environment; only the `app-dev.nomly.us` → `develop` domain association is established in-repository.
* Whether product wants browser Back/Forward to restore section only or also filters/dialogs; current behavior defines no precedent.
* Whether the App builder “Planned” badge is intentional rollout messaging or stale UI.
* Whether new React forms should continue persisting the selected location only in memory or deliberately promote it into the URL; no current behavior supports URL persistence.
* The required observation window before deleting legacy code and whether a React route should expose a legacy escape hatch after launch.

## Source map

Principal references in this audit:

* Next bootstrap and routes: `apps/client-dashboard/src/app/[[...path]]/page.tsx`, `src/app/ClientDashboardRoot.tsx`, `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `next.config.ts`.
* SPA runtime: `src/main.ts`, `src/render.ts`, `src/events.ts`, `src/state.ts`, `src/lifecycle.ts`, `src/storage.ts`, `src/sections.ts`.
* Rules/API: `src/model.ts`, `src/api.ts`, `src/orders-runtime.ts`, `src/order-alert.ts`, `src/toast-runtime.ts`, `packages/contracts-auth/src/index.ts`.
* Surface rendering and actions: `src/views/*.ts`, `src/controllers/*.ts`, `src/google-callback.ts`, `src/controllers/invite-url.ts`.
* Tests: `apps/client-dashboard/test/*.test.ts` (inventory and gaps in §7).

### Current auth/runtime files

The active final-slice implementation is now in:

* Routes: `apps/client-dashboard/src/app/page.tsx`, `app/invites/page.tsx`, and the explicit pages under `app/{orders,menu,cards,discounts,team,settings,onboarding}/page.tsx`.
* Authentication and session: `features/auth/auth-api.ts`, `auth-types.ts`, `auth-domain.ts`, `session-domain.ts`, `session-provider.tsx`, `features/auth/google-callback.ts`, and `features/auth/components/`.
* Invitation flow: `features/invites/invite-api.ts`, `invite-domain.ts`, and `features/invites/components/`.
* Route and capability navigation: `lib/navigation/dashboard-entry.ts`, `dashboard-navigation.ts`, and `dashboard-sections.ts`.
* Compatible persistence: `storage.ts` (session/API base/location/wizard preferences; retired SPA section preference is removed).
* Tests: `test/auth-domain.test.ts`, `auth-react.test.tsx`, `session-domain.test.ts`, `invite-domain.test.ts`, `callback-compat.test.ts`, `dashboard-entry.test.ts`, and `storage.test.ts`.

The historical SPA files listed above under the Phase 0 source map have been deleted and are not current implementation references.
