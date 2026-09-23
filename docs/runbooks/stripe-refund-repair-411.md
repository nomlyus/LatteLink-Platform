# Gate 1 Stripe test refund repair (#411)

## Read-only finding, 2026-09-23

The development app `nomly-api-dev` used `PAYMENTS_PROVIDER_MODE=simulated` for the legacy Clover path. Before #411, the customer refund route also followed that setting. A read-only database query found five `payments_refunds` rows whose message begins `Simulated Stripe refund`; all are 371 USD cents and dated 2026-09-22. A read-only Stripe test-mode `refunds.list` for each persisted PaymentIntent under its persisted connected account returned no provider refunds. All five PaymentIntents were independently verified as test-mode, succeeded, and matching the stored connected account, order/checkout, location, amount, and currency. Three local refund rows are `REJECTED` and their orders are `COMPLETED`; two rows are locally `REFUNDED` and their orders are `CANCELED`. Only the latter two are false-positive refund settlement records.

| Local refund ID | PaymentIntent ID | Local refund | Order |
| --- | --- | --- | --- |
| `33a577bd-8319-4d82-8824-8a537a02662d` | `pi_3UIal0E0rmI4ZtQG18EwutPz` | `REJECTED` | `COMPLETED` |
| `52102ff4-16f4-4bbd-b9cb-b3045c2ed001` | `pi_3UIalmE0rmI4ZtQG1w5f5QH6` | `REJECTED` | `COMPLETED` |
| `6baadd65-433b-4e82-b67b-ddac5e21d724` | `pi_3UIamIE0rmI4ZtQG1nUuQipY` | `REJECTED` | `COMPLETED` |
| `1a23ef72-c0f7-4741-8d95-cf6ccd8edecd` | `pi_3UIb11E0rmI4ZtQG10Fz7H4A` | `REFUNDED` | `CANCELED` |
| `a19bbad7-bfa0-400e-8fc4-133ead39fea3` | `pi_3UIc7XE0rmI4ZtQG07ZkM5pY` | `REFUNDED` | `CANCELED` |

## Reviewed repair procedure

The user clarified that the repair scope is only the two local `REFUNDED`/`CANCELED` false positives: `1a23ef72-c0f7-4741-8d95-cf6ccd8edecd` and `a19bbad7-bfa0-400e-8fc4-133ead39fea3`. The three `REJECTED`/`COMPLETED` test cases are excluded. The earlier five-row audit incorrectly treated every `Simulated Stripe refund` message as a successful local refund. No production action is authorized. An operator must perform each approved transaction separately after the exact candidate is reviewed and deployed to development.

1. Re-read the approved local rows and join each to `payments_stripe_payment_intents` and `orders`. Confirm exact PaymentIntent, connected account, location, order, 371-cent amount, USD currency, local simulated message, and the expected order/refund state. Exclude any row that differs.
2. Retrieve each PaymentIntent from Stripe test mode under its recorded connected account. Confirm `livemode=false`, `status=succeeded`, matching amount, currency, checkout/order metadata, and location. List its provider refunds again. Stop for any existing full or partial refund, ambiguity, or account mismatch.
3. For each still-unrefunded PaymentIntent, create one 371-cent refund under the recorded connected account with idempotency key `g1-411-dev-repair:<paymentIntentId>`. Record the returned provider refund ID and status. Reuse that exact key on transport retry; never invent a new key for a retry.
4. Wait for each refund to succeed and its signed Connect webhook to reconcile. The #411 webhook path creates a separate provider-verified refund ledger row and updates the order refund snapshot. It retains the historical simulated row with explicit legacy provenance so the discrepancy remains auditable. If delivery fails, resend the same Stripe event after inspecting the failure; do not edit the database.
5. Confirm Stripe shows exactly one succeeded 371-cent refund per PaymentIntent; Nomly's order and payment records show the same provider refund, full-order allocation, canceled state, and reporting totals. Keep ID-only evidence in #411. Escalate any mismatch for a separate reviewed repair.

Historical simulated rows are retained unchanged as audit history; the repair does not delete or rewrite them. A normal idempotency retry returns `STRIPE_REFUND_UNVERIFIED` until the verified Stripe refund total exactly matches the historical amount. Once it matches, the API returns `STRIPE_REFUND_ALREADY_RECORDED` and does not create another refund. Support summaries clear the warning only when there is one unambiguous historical simulated row for that payment and the verified provider total equals that row's amount; duplicate or differently scoped legacy rows remain flagged for review.

Each succeeded provider refund is stored as its own verified ledger row. If multiple Stripe refunds together cover the order's full amount, the order/support snapshot stores the cumulative amount plus the list of provider refund IDs, without assigning the aggregate amount to any single refund ID. Provider-originated partial refunds remain individually settled but unallocated; reporting must count their money and surface item-allocation uncertainty rather than inventing precision.

For Nomly 1.2.0, the operator-initiated refund API remains full-order-only. A partial request fails binding validation before a provider call. External or provider-initiated partial and multiple refunds are recorded individually as settled, with item allocation explicitly unknown until independently verified.
