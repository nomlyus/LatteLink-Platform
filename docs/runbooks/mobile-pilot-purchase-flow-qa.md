# Mobile Pilot Purchase Flow QA

Last reviewed: `2026-09-22`

## Purpose and boundary

Use this checklist for the Nomly 1.2.0 Rawaq customer-to-operator golden path tracked in [#410](https://github.com/nomlyus/LatteLink-Platform/issues/410). The target is the **live dev** stack (`https://api-dev.nomly.us/v1`) and a physical iPhone running the Rawaq beta TestFlight build **1.2.0 (34)**. Use only controlled test accounts, the dev merchant/location, and Stripe **test-mode** payments. Do not use production resources or treat a live-dev pass as production release approval.

The implemented checkout in `apps/mobile/app/checkout.tsx` prepares a quote and checkout draft, creates a Stripe mobile payment session, presents **Stripe PaymentSheet** for card or Apple Pay when available, then finalizes and displays the paid Nomly order. Clover is not the mobile order or payment path for this test. The older [Apple Pay dev-path runbook](apple-pay-checkout.md) describes a legacy token flow; it is not this TestFlight script.

Paid-order cancellation/refund is a separate exception governed by [#415](https://github.com/nomlyus/LatteLink-Platform/issues/415) and [#411](https://github.com/nomlyus/LatteLink-Platform/issues/411). The normal golden path ends at pickup completion and must not trigger a financial reversal. An unpaid customer cancellation may be tested only if a controlled unpaid draft can be reproduced safely.

## Evidence already available

| Check | Status as of 2026-09-22 | Evidence boundary |
| --- | --- | --- |
| Live-dev API readiness | Independently verified | `GET https://api-dev.nomly.us/ready` returned HTTP 200; all seven upstream services reported ready with Postgres persistence, and payments reported Stripe test mode. This does not prove checkout success. |
| Card purchase and manual completion from iPhone 1.2.0 (34) | User-reported pass | The user reports a paid card order placed and completed. No order ID, timestamps, or customer/operator/backend comparison is available in #410. |
| Separate card order from iPhone 1.2.0 (34), refunded by operator | User-reported pass, outside normal path | The user reports a second card order refunded through the operator flow. This is not independently reconciled with Stripe and does not substitute for normal-path or Apple Pay checks. |
| Apple Sign-In/profile, Apple Pay, loyalty, push, interruption recovery, timed state comparison | Unverified | Requires a new controlled run and correlated evidence below. |

Do not turn a user-reported result into an independently verified pass or reuse an earlier order without its identifier and evidence.

## Required inputs

- Physical iPhone model and iOS version; installed TestFlight version/build `1.2.0 (34)` and beta/dev API target confirmed before testing.
- Controlled Nomly-owned customer test account and authorized operator test account for the Rawaq dev location. Record account aliases, not email addresses or personal data.
- Store open for pickup, known available menu item with modifiers, and a test payment method eligible for Stripe test mode. Apple Pay needs a device/account on which it is available.
- Read-only access to the corresponding dev order, payment, and loyalty records or authorized dev observability to compare the same test order across surfaces.
- One evidence record per order with device/build, environment, order ID, observed timestamps, result, and non-sensitive screenshots or event summaries.

## Stepwise live-dev iPhone run

Record **pass, fail, or blocked** for every step. If blocked, state why; do not infer a pass from configuration alone.

1. **Preflight:** Confirm installed build `1.2.0 (34)`, the `api-dev.nomly.us` target, healthy `/ready`, and Stripe test mode before creating an order.
2. **Account and profile:** Sign in with Apple using the controlled account; confirm profile loads and can be reopened after app restart. Record whether account creation or returning sign-in was tested.
3. **Store and menu:** Confirm dev location, open/closed state, pickup instructions/ETA, category and item availability from live dev. Browse an available item and modifier. Placeholder or fallback merchant content is not a pass.
4. **Cart and quote:** Add simple and modified items, change quantity, remove and restore an item; compare item/modifier prices, tax, discount if used, and total with the server-authoritative quote.
5. **Card checkout:** Open Stripe PaymentSheet and complete a test-mode card payment. Record order ID, pickup code, time payment succeeds, time the app shows finalized confirmation, and whether cart clears. If payment is canceled or fails, confirm a usable retry without a duplicate paid order.
6. **Operator visibility and progression:** For the same order ID, record first appearance in the dev operator dashboard. Progress through available normal staff statuses, including prep, ready, and completed/picked up as exposed. Compare status, items, total, location, and pickup code with the backend record. No normal transition may cause a refund or other unannounced reversal.
7. **Customer tracking and history:** Verify each operator transition appears on the active order and later in Orders/history. Compare status and totals with backend truth; reopen Orders after leaving the app.
8. **Loyalty:** If enabled, compare earned reward/points and ledger entry for that paid order with backend truth. Record when visible; a displayed balance alone is not proof of a posted ledger entry.
9. **Push:** With notification permission enabled, record whether expected status push arrives for the same order, the triggering transition, and arrival time. Distinguish missing delivery from disabled permission or device registration.
10. **Apple Pay lane:** Place a separate controlled order through Apple Pay in Stripe PaymentSheet. Verify wallet sheet merchant and total before authorizing, then repeat confirmation, operator/backend, tracking, and financial-state checks. A card pass does **not** count as an Apple Pay pass.
11. **Interruption/reconnect:** In another controlled checkout, interrupt or background the app at an agreed safe point, then resume/reopen it. Verify Orders and backend/payment state converge without duplicate charge/order and with clear recovery. Record interruption point; do not repeat payment blindly when finalization is uncertain.
12. **Unpaid cancellation, only if safe:** Create a controlled unpaid checkout/order without successful charge, cancel through the customer flow if exposed, and verify no capture or refund. Mark blocked if the state cannot be reproduced safely; never substitute a paid order.

For outage/error states, use a safe test scenario or controlled dev fault only; do not disrupt a shared live-dev service. Verify menu/config unavailability, order-query errors, expired sessions, payment failures, and retries show truthful recovery rather than fallback data or an active unpaid order. Track broader accessibility, device-size, and offline coverage under [#430](https://github.com/nomlyus/LatteLink-Platform/issues/430).

## Timing and truth comparison

For each controlled paid order, capture the **same order ID** across customer confirmation, operator dashboard, backend order/payment record, and Stripe test-mode transaction. Record these times with timezone (UTC preferred):

| Field | Meaning |
| --- | --- |
| `t_payment_success` | Stripe test-mode payment success/confirmation as recorded by provider or backend. |
| `t_order_finalized` | Backend paid-order finalization timestamp. |
| `t_customer_visible` | First observed final confirmation or paid order in iPhone UI. |
| `t_operator_visible` | First observed order appearance in dev operator dashboard. |
| `t_status_change` | Backend/operator time for each normal staff transition. |
| `t_push_received` | Actual iPhone receipt time for expected status push, or `not received`. |

Report payment-finalization, operator-visibility, and push intervals from timestamps actually observed. Mark unavailable records **unverified** rather than estimating. Do not publish payment credentials, personal identifiers, raw tokens, or unredacted logs.

## Evidence record and issue disposition

| Date/time (UTC) | Env/build | Device | Test account alias | Order ID | Payment lane | Step/result | Timing/evidence link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `YYYY-MM-DD HH:MM` | `live dev / 1.2.0 (34)` | `model / iOS` | `alias` | `ID or n/a` | `card / Apple Pay / none` | `step; pass/fail/blocked` | `non-sensitive reference` |

Classify every failure as **P0** (cannot safely sign in, pay, create/track a coherent paid order, duplicate charge/order, or unexpected financial reversal), **P1** (materially wrong state, totals, loyalty, notification, or recovery), or **P2** (non-blocking polish). Assign it to a launch-gate issue; do not hide it in a test note. A blocked step is not a pass. Keep [#410](https://github.com/nomlyus/LatteLink-Platform/issues/410) open until each acceptance criterion has dated evidence and customer/operator/backend state and timing are reconciled. No production action follows automatically from a live-dev pass.
