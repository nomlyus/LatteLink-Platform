# Test full mobile ordering flow against a Clover-connected environment

## Status

- `completed`: `2026-04-03`
- `validated`: live menu/cart/mobile checkout flow against the deployed Clover-connected production test merchant
- `confirmed`: successful Clover card checkout, declined-payment retry behavior without an active unpaid order, paid-order visibility in Orders, and refund/cancel follow-up
- `note`: Apple Pay enablement remains a separate launch concern, but it is no longer required to prove the Clover-connected mobile flow

## Problem

The mobile ordering stack has progressed across menu, cart, checkout, order tracking, session management, and backend order/payment flows, but the full experience has not yet been validated end to end against a real Clover-connected environment.

At the moment, individual slices may work in isolation while the real integrated flow can still fail due to:

- Clover connectivity or credential issues
- environment drift between mobile, gateway, orders, and payments services
- contract mismatches between checkout requests and Clover-backed payment handling
- order state transitions not surfacing correctly after payment
- loyalty, order history, and confirmation UIs not matching the actual persisted result
- refund, retry, or error recovery behavior breaking only in the fully integrated path

Without a deliberate end-to-end test pass, the system can appear feature-complete while still being untrustworthy in the real payment-connected environment.

## Goal

Run and document a full end-to-end validation of the mobile customer flow against an environment with a working Clover connection.

This issue is about proving that the full user journey works as an integrated system, not just that individual screens or routes compile.

## Why this matters

This validation is the point where the app either becomes operationally credible or exposes the remaining gaps.

We need confidence that a real user can:

1. browse the menu
2. customize items
3. add them to cart
4. complete checkout through the Clover-connected payment path
5. receive a persisted order and confirmation
6. see the order in the Orders tab and history
7. observe the expected downstream updates tied to that order

## Scope

In scope:

- mobile app flow on a real device or realistic device target
- backend environment wired to Clover
- gateway, orders, payments, contracts, and mobile integration points
- order confirmation, order history, and active-order surfaces after checkout
- loyalty/ledger behavior if enabled in the tested environment
- refund or cancellation follow-up checks when supported by the environment

Out of scope:

- synthetic unit-only verification
- mocked Clover-only local validation as a substitute for real integration
- UI polish tasks unrelated to proving the operational flow

## Required environment / prerequisites

- a deployed backend environment with:
  - reachable gateway
  - orders service
  - payments flow configured for Clover
  - any required notifications / loyalty dependencies if part of the tested flow
- Clover credentials and merchant/store configuration confirmed valid for the target environment
- mobile app pointed at the correct environment
- test user account(s) available
- test catalog/menu data available
- a known-good payment test scenario and expected Clover behavior documented
- logging/observability access for gateway, orders, and payments services during the test window

## Test matrix

At minimum, run the following:

### 1. Signed-out to sign-in flow

- launch mobile app from a clean state
- verify session bootstrap is healthy
- confirm sign-in works as expected for a test user
- confirm returning into ordering flow does not break cart or checkout context

### 2. Menu and cart flow

- load menu successfully from the target environment
- open item customization
- add at least one simple item
- add at least one customized item
- confirm cart totals and pricing remain correct

### 3. Checkout and Clover payment flow

- start checkout from the mobile app
- execute the Clover-connected payment path end to end
- confirm payment succeeds without manual backend intervention
- verify failure and retry behavior if the environment supports safe test retries

### 4. Post-payment persistence

- verify an order record is created
- verify payment-linked timeline/order metadata is persisted correctly
- verify the mobile confirmation screen shows the expected result
- verify cart is cleared after successful checkout

### 5. Orders tab / active order flow

- verify the new order appears in Orders
- verify active order state is visible and coherent
- verify pickup code, totals, and timeline/status text match persisted backend data
- verify historical order rendering remains correct once the order is no longer active

### 6. Loyalty / ledger integration

- if loyalty is enabled for the environment, verify the expected earn/redeem side effects
- verify ledger entries, balances, and order-related loyalty notes are correct
- verify mobile account/order surfaces reflect the final persisted data

### 7. Refund / cancellation follow-up

- if supported safely in the target environment, validate at least one refund or cancellation follow-up path
- verify resulting order state, timeline, and ledger side effects
- verify mobile refund/order detail surfaces reflect the backend result

## Failure scenarios to exercise

Where safe and practical, explicitly validate:

- Clover connection unavailable or misconfigured
- payment authorization failure
- duplicate checkout submission / idempotency behavior
- client interruption during checkout
- backend success but stale client state
- order created but payment/timeline display missing or wrong
- session expiry or refresh edge cases during checkout/order retrieval

## Required outputs

- a written test report or checklist with pass/fail status for each scenario
- exact environment tested
- timestamps and order IDs used during the test
- screenshots or screen recordings for major checkpoints
- Clover-side evidence where available
- backend log references for failures or unexpected behavior
- a list of follow-up bugs discovered during the run

## Observability / debugging expectations

During the test, we should be able to correlate:

- mobile user action
- gateway request/response
- orders service write
- Clover payment event/result
- resulting order status/timeline
- downstream loyalty/refund side effects if applicable

If this correlation is difficult, create follow-up issues for missing observability.

## Acceptance criteria

- at least one full order is successfully completed through the Clover-connected path from mobile browse to persisted order
- the mobile confirmation screen reflects the real successful order
- the Orders tab shows the correct active/history state for that order
- cart, totals, pickup code, and order status remain coherent across screens
- backend records and mobile UI agree on the final order result
- any failures found during the run are captured as follow-up issues with concrete evidence
- the team has a written record of what was tested, what passed, what failed, and what remains risky

## Follow-up expectations

If the flow does not pass cleanly, follow-up issues should be split by area, for example:

- Clover/payment integration defects
- contract or gateway mismatch
- order persistence/timeline issues
- mobile confirmation/orders UI mismatches
- loyalty/refund side-effect issues
- missing logs or operational visibility
