# Pilot Incident Response and Merchant Support Playbook

Last verified: `2026-04-28`

## Scope

Use this playbook when something goes wrong during a live pilot or merchant launch.

Related runbooks:

- [merchant-onboarding-pilot.md](./merchant-onboarding-pilot.md)
- [launch-readiness-checklist.md](./launch-readiness-checklist.md)
- [database-backup-restore.md](./database-backup-restore.md)
- [payment-retry-failure-recovery.md](./payment-retry-failure-recovery.md)
- [pilot-uptime-monitoring.md](./pilot-uptime-monitoring.md)
- [two-environment-deploy.md](./two-environment-deploy.md)

## Operating Rules

- Never manually edit production database rows unless a documented recovery step explicitly requires it.
- Never test new code against production to diagnose an incident.
- If payment state and order state disagree, Stripe is the payment source of truth.
- If customer money is involved, preserve order ID, payment ID, timestamps, Stripe event IDs, and Sentry event IDs before changing anything.
- Dev alerts can be paused during maintenance.
- Production alerts should not be muted during business hours unless there is an active incident owner.
- If production data may be damaged, stop and take a logical backup before remediation.

## Severity

- `SEV-1`: live checkout, payment reconciliation, auth, or production API unavailable.
- `SEV-2`: dashboard fulfillment, menu loading, loyalty, notifications, or one merchant degraded.
- `SEV-3`: non-critical admin/support tooling issue with workaround.

Every `SEV-1` must have one named incident owner until resolved.

## First Triage

Collect this before changing anything:

- environment: `dev` or `production`
- merchant/location id
- customer email/phone if provided
- order id
- payment id or Stripe PaymentIntent id
- approximate timestamp and timezone
- screenshot or exact error text
- Sentry event id if available
- uptime monitor alert id if available

Check in this order unless the symptom clearly points elsewhere:

1. Uptime monitor.
2. Sentry.
3. Admin console `Support` page.
4. Operator dashboard.
5. Stripe dashboard.
6. Supabase dashboard.
7. DigitalOcean droplet status.
8. Service logs.

## Incident Record

After resolution, create or update an issue with:

- summary
- severity
- environment
- affected merchant(s)
- customer/order/payment ids
- timeline
- root cause or best current hypothesis
- actions taken
- customer/merchant communication sent
- follow-up issues

## Scenario 1: Customer Paid But Merchant Cannot See Order

Symptom:

- Customer has Apple Pay/card confirmation.
- Merchant dashboard does not show the order.

First system to check:

- Admin console `Support` page.
- Stripe dashboard.
- Sentry for payments/orders errors.

Safe first action:

1. Search support page by customer email/phone, order id, PaymentIntent id, and payment id.
2. In Stripe, search the PaymentIntent.
3. If Stripe says payment succeeded and order is missing or still pending, wait for stale payment reconciliation if it is within the reconciliation window.
4. If outside the window, escalate to engineering with Stripe PaymentIntent id and order id.

What not to do:

- Do not create a duplicate paid order manually.
- Do not mark an order paid unless Stripe confirms success.
- Do not refund before confirming whether the merchant can fulfill.

Escalate when:

- Stripe payment succeeded and no matching order is found.
- order is stuck after the reconciliation window.
- Sentry has webhook signature/reconciliation errors.

Merchant/customer message:

> We found your payment and are checking the order reconciliation state. Please do not place a second order yet. We will either confirm the order with the shop or issue a refund if it cannot be fulfilled.

## Scenario 2: Order Stuck in `PENDING_PAYMENT`

Symptom:

- Dashboard or support page shows `PENDING_PAYMENT` longer than expected.

First system to check:

- Stripe dashboard by PaymentIntent id.
- Sentry for payment reconciliation errors.
- Support page audit trail.

Safe first action:

1. If Stripe PaymentIntent is `requires_payment_method`, `canceled`, or failed, leave order pending/canceled according to normal flow.
2. If Stripe PaymentIntent is `succeeded`, wait for or trigger documented stale reconciliation.
3. Record Stripe status and timestamp before taking action.

What not to do:

- Do not advance fulfillment while payment is unresolved.
- Do not treat mobile payment sheet success as source of truth.

Escalate when:

- Stripe succeeded but stale reconciler did not update order.
- Stripe webhook events are missing or failing signature validation.

Message:

> Payment confirmation is still syncing. We are checking Stripe, which is the payment source of truth, before asking the shop to prepare the order.

## Scenario 3: Merchant Cannot Advance Fulfillment Status

Symptom:

- Dashboard status button fails or order stays unchanged.

First system to check:

- Dashboard browser error.
- Sentry gateway/orders errors.
- Support page order audit trail.

Safe first action:

1. Confirm merchant is on the correct environment/dashboard.
2. Confirm operator has access to the order location.
3. Confirm fulfillment mode is `staff`.
4. Search the order in Support page.
5. Retry once after refreshing dashboard.

What not to do:

- Do not change fulfillment mode to `time_based`.
- Do not bypass tenant checks.

Escalate when:

- API returns `403`, `404`, or `STAFF_FULFILLMENT_DISABLED` unexpectedly.
- The order belongs to a different location than the signed-in operator.

Message:

> We are checking your dashboard permissions and fulfillment configuration. Keep preparing orders normally and tell us the order ID you cannot update.

## Scenario 4: App Cannot Load Menu or Store Data

Symptom:

- Customer sees menu load error.
- Mobile app does not show real menu/store state.

First system to check:

- `https://api.nomly.us/ready` for production.
- Sentry mobile and catalog/gateway projects.
- Admin console location menu visibility.

Safe first action:

1. Confirm app build target: beta -> `api-dev.nomly.us`, production -> `api.nomly.us`.
2. Confirm `GET /v1/menu?locationId=<locationId>` works.
3. Confirm at least one visible item exists.
4. Confirm catalog service readiness.

What not to do:

- Do not reintroduce hardcoded mobile fallback menu data.
- Do not point beta/prod app at the wrong API to make the issue disappear.

Escalate when:

- `/health` passes but `/ready` fails.
- menu endpoint returns 5xx or empty data for a configured location.

Message:

> We are checking the live menu feed for this shop. The app should show backend menu data only, so a load failure means we need to fix the source instead of showing stale items.

## Scenario 5: Operator Dashboard Cannot Reach Backend

Symptom:

- Dashboard displays "unable to reach backend".

First system to check:

- Vercel deployment environment variables.
- Gateway `/health` and `/ready`.
- Sentry dashboard/browser and gateway.

Safe first action:

1. Confirm dashboard deployment is preview/dev or production as intended.
2. Confirm dashboard API base URL points to the matching environment.
3. Check CORS allowed origins for the dashboard domain.
4. Check gateway health.

What not to do:

- Do not point preview dashboard at production API for beta/dev testing.
- Do not add wildcard CORS for production.

Escalate when:

- correct API URL and CORS are configured but backend remains unreachable.
- production dashboard cannot reach production API during merchant hours.

Message:

> The dashboard is connected to the wrong backend or the API is unavailable. We are checking the deployment configuration and API health before asking you to retry.

## Scenario 6: Stripe Webhook or Reconciliation Alert Fires

Symptom:

- Sentry alert from payments/orders about webhook handling or reconciliation.

First system to check:

- Sentry event.
- Stripe webhook delivery logs.
- Support page for affected order.

Safe first action:

1. Preserve Sentry event id and Stripe event id.
2. Check whether Stripe retried delivery successfully.
3. Search affected order/payment in Support page.
4. If payment succeeded and order did not update, follow stale reconciliation procedure.

What not to do:

- Do not disable Stripe webhook signing.
- Do not manually replay webhooks without recording event ids.

Escalate when:

- repeated webhook failures.
- payment succeeded but order remains pending beyond reconciliation window.

Message:

> Stripe reported a payment update and we are verifying the order state. We will confirm whether the order should be fulfilled or refunded after reconciliation.

## Scenario 7: `/health` Down

Symptom:

- Uptime monitor reports `/health` down.

First system to check:

- DigitalOcean droplet status.
- Docker Compose service status.
- Sentry backend errors.

Safe first action:

1. Confirm from another network: `curl -i https://api.nomly.us/health`.
2. Check DigitalOcean droplet power/network status.
3. SSH to host and inspect containers.
4. Restart only the failing service if the cause is isolated.

What not to do:

- Do not run migrations during a health outage unless the root cause is a migration.
- Do not deploy new untested code directly to production.

Escalate when:

- gateway is down.
- host is unreachable.
- multiple services are crash-looping.

Message:

> The ordering API is temporarily unavailable. We are restoring service and will confirm when ordering is safe to resume.

## Scenario 8: `/ready` Down but `/health` Passes

Symptom:

- Uptime monitor reports `/ready` down while `/health` is up.

Meaning:

- Process is alive, but a dependency or readiness check is failing.

First system to check:

- readiness response body
- Supabase
- Redis/Valkey
- downstream services
- Sentry

Safe first action:

1. `curl -s https://api.nomly.us/ready`.
2. Identify failing dependency from response.
3. Check the named dependency directly.
4. If database connectivity is failing, follow Supabase scenario.

What not to do:

- Do not ignore `/ready` just because `/health` is green.
- Do not declare launch ready while `/ready` is failing.

Escalate when:

- `/ready` remains down for more than one check interval.
- database or payments dependency is failing.

Message:

> The API process is online but one of its dependencies is not ready. We are checking dependency health before resuming launch or order testing.

## Scenario 9: Supabase / Database Connectivity Issue

Symptom:

- `/ready` fails with database dependency.
- Sentry shows database connection/query errors.
- checkout, auth, menu, or dashboard reads fail.

First system to check:

- Supabase project status.
- connection string configured in GitHub Environment/Droplet.
- Sentry errors.

Safe first action:

1. Check Supabase dashboard status.
2. Verify production points to production Supabase, dev points to dev Supabase.
3. Do not rotate `DATABASE_URL` unless replacing the database intentionally.
4. If data corruption is suspected, freeze writes and take backup.

What not to do:

- Do not point production at dev database.
- Do not point dev at production database.
- Do not manually edit rows to "test" a fix.

Escalate when:

- production database is unavailable.
- migrations failed.
- data integrity is in question.

Message:

> We are seeing a database connectivity issue. Ordering may be paused until the database is healthy to avoid lost or inconsistent orders.

## Scenario 10: Pause Launch Because Readiness Fails

Symptom:

- Launch readiness checklist has red/yellow checks.

First system to check:

- Admin console `Launch Readiness`.
- Relevant system for failing check.

Safe first action:

1. Mark launch as held.
2. Record failed readiness checks.
3. Create or link a GitHub issue for each blocker.
4. Do not announce launch.

What not to do:

- Do not override failed payment, menu, owner, or fulfillment checks.
- Do not treat manual test order as passed without an order id.

Escalate when:

- failure blocks merchant start date.
- payment or fulfillment readiness fails.

Message:

> We are holding launch because one or more safety checks failed. This prevents customers from placing orders before the shop is fully ready.

## Scenario 11: Refund or Manual Reconciliation Needed

Symptom:

- customer should not be charged, or payment/order state disagree after automated recovery.

First system to check:

- Stripe dashboard.
- Support page.
- Sentry.

Safe first action:

1. Confirm Stripe source-of-truth status.
2. Preserve order id, payment id, Stripe event ids, and timestamps.
3. If refund is needed, perform it through Stripe or the documented payments path.
4. Verify the order audit trail after action.

What not to do:

- Do not refund twice.
- Do not manually mark paid if Stripe did not succeed.
- Do not manually reconcile without recording why automation failed.

Escalate when:

- refund fails.
- payment succeeded but order is not recoverable.
- customer was charged twice.

Message:

> We verified the payment state and are correcting it. If the order cannot be fulfilled, we will refund the payment and confirm once the refund has been submitted.
