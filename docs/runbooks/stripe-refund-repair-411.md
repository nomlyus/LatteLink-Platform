# Gate 1 Stripe test refund repair (#411)

## Read-only finding, 2026-09-23

The development app `nomly-api-dev` used `PAYMENTS_PROVIDER_MODE=simulated` for the legacy Clover path. Before #411, the customer refund route also followed that setting. A read-only database query found five `payments_refunds` rows whose message begins `Simulated Stripe refund`; all are 371 USD cents and dated 2026-09-22. A read-only Stripe test-mode `refunds.list` for each persisted PaymentIntent under its persisted connected account returned no provider refunds. The local `REFUNDED` state therefore does not establish Stripe settlement.

| Local refund ID | PaymentIntent ID |
| --- | --- |
| `33a577bd-8319-4d82-8824-8a537a02662d` | `pi_3UIal0E0rmI4ZtQG18EwutPz` |
| `52102ff4-16f4-4bbd-b9cb-b3045c2ed001` | `pi_3UIalmE0rmI4ZtQG1w5f5QH6` |
| `6baadd65-433b-4e82-b67b-ddac5e21d724` | `pi_3UIamIE0rmI4ZtQG1nUuQipY` |
| `1a23ef72-c0f7-4741-8d95-cf6ccd8edecd` | `pi_3UIb11E0rmI4ZtQG10Fz7H4A` |
| `a19bbad7-bfa0-400e-8fc4-133ead39fea3` | `pi_3UIc7XE0rmI4ZtQG07ZkM5pY` |

## Reviewed repair procedure

The user authorized test-mode provider refunds for these five transactions after the #411 fix is reviewed. No production action is authorized. An operator must perform each transaction separately after the exact candidate is reviewed and deployed to development.

1. Re-read the five local rows and join each to `payments_stripe_payment_intents` and `orders`. Confirm exact PaymentIntent, connected account, location, order, 371-cent amount, USD currency, local simulated message, and canceled order/refund state. Exclude any row that differs.
2. Retrieve each PaymentIntent from Stripe test mode under its recorded connected account. Confirm `livemode=false`, `status=succeeded`, matching amount, currency, checkout/order metadata, and location. List its provider refunds again. Stop for any existing full or partial refund, ambiguity, or account mismatch.
3. For each still-unrefunded PaymentIntent, create one 371-cent refund under the recorded connected account with idempotency key `g1-411-dev-repair:<paymentIntentId>`. Record the returned provider refund ID and status. Reuse that exact key on transport retry; never invent a new key for a retry.
4. Wait for each refund to succeed and its signed Connect webhook to reconcile. The #411 webhook path updates the order refund snapshot and replaces the historical simulated message in `payments_refunds` with the verified provider refund ID. If delivery fails, resend the same Stripe event after inspecting the failure; do not edit the database.
5. Confirm Stripe shows exactly one succeeded 371-cent refund per PaymentIntent; Nomly's order and payment records show the same provider refund, full-order allocation, canceled state, and reporting totals. Keep ID-only evidence in #411. Escalate any mismatch for a separate reviewed repair.

Historical simulated rows return `STRIPE_REFUND_UNVERIFIED` on normal idempotency replay until a verified provider webhook has repaired their local provenance. Partial or multi-refund provider events return `STRIPE_REFUND_REQUIRES_REVIEW` because item allocation cannot be inferred from an aggregate charge amount.

The current internal refund API permits only the full recorded PaymentIntent amount. A partial refund request fails binding validation before a provider call. Supporting intentional partial refunds requires an item allocation contract, cumulative provider refund ledger, and reporting changes; this remains an open #411 acceptance gap.
