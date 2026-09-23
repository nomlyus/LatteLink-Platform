# Merchant Onboarding Runbook

Last verified: `2026-05-07`

## Scope

Use this runbook to onboard a pilot merchant from signed intent to live ordering.

This is the operating source of truth for merchant launch. Follow it in order. If a step fails, hold launch and use [pilot-incident-response.md](./pilot-incident-response.md).

## Environment Policy

- `dev`: shared integration and staging-validation environment at `api-dev.nomly.us`.
- `production`: live pilot environment at `api.nomly.us`.
- Beta mobile builds point to `dev`.
- Production mobile builds point to `production`.
- Never test new code, migrations, or unverified configuration against production.
- Never share Supabase databases, Redis/Valkey instances, Stripe credentials, or Apple mobile identifiers between dev and production.

Reference: [two-environment-deploy.md](./two-environment-deploy.md).

## Required Inputs

Collect these before creating the client:

- Merchant legal/business name.
- Public brand name.
- Primary location name.
- Market label, for example `Detroit, MI`.
- Owner name and email.
- Store hours, pickup instructions, tax rate, prep ETA if Nomly is entering initial defaults.
- Fulfillment mode. Use `staff` for every real merchant.
- Stripe onboarding contact. Only the merchant owner should connect payments from the client dashboard.
- Menu source: manual seed, CSV/manual entry, or upstream menu sync.
- Initial visible menu categories/items.
- Menu image assets.
- Mobile app bundle identifier and merchant display name if this merchant receives a branded app.

Do not collect or ask the merchant for a `locationId`. The system generates tenant, brand, and location identifiers. Record the generated `locationId` after client creation because it is still used by backend APIs, mobile configuration, logs, and support tooling.

## Gate 0: Repository and Deploy State

Before onboarding a merchant:

- `develop` CI is green.
- `main` CI is green.
- `dev` deploy is healthy: `https://api-dev.nomly.us/ready`.
- `production` deploy is healthy: `https://api.nomly.us/ready`.
- Latest database restore drill has passed for `dev`.
- Sentry projects are receiving errors for backend services, mobile, dashboard, and admin console.
- Uptime monitors exist for both `/health` and `/ready`. Reference: [pilot-uptime-monitoring.md](./pilot-uptime-monitoring.md).

## Step 1: Create the Client Shell

Preferred path:

1. Open the admin console for the target environment.
2. Go to `Clients`.
3. Select `New Client`.
4. Enter the client name, user-facing location name, market label, owner email, and optional initial store defaults.
5. Create the client shell.
6. Record the generated `tenantId`, `brandId`, and `locationId` from the response and client detail page.

API fallback:

```bash
curl -X POST "$API_BASE_URL/v1/internal/clients" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Rawaq Coffee",
    "locationName": "Rawaq Coffee",
    "marketLabel": "Detroit, MI",
    "ownerEmail": "owner@example.com",
    "ownerName": "Merchant Owner"
  }'
```

Verification:

- Admin console `Clients` shows the new client.
- The client detail page shows a generated `locationId` that starts with `loc_`.
- `GET /v1/internal/locations/:locationId` returns the expected brand and location.
- `GET /v1/internal/locations/:locationId/onboarding` returns the onboarding checklist.

## Step 2: Send Owner Invite

Preferred path:

1. Admin console: `Clients` -> select client -> `Owner`.
2. Enter owner display name and email.
3. Send the owner invite.
4. Confirm the invite email was sent, or copy the invite URL from logs only for local/dev testing.

API fallback:

```bash
curl -X POST "$API_BASE_URL/v1/internal/locations/$LOCATION_ID/owner/invite/resend" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Merchant Owner",
    "email": "owner@example.com"
  }'
```

Verification:

- Owner summary shows a pending invite before acceptance.
- Owner opens the token-free `/invites/#<invite-token>` link from the email. The dashboard reads the token from the URL fragment and submits it in the invite lookup and acceptance POST request bodies; it is never part of an API URL.
- Owner summary shows an active owner after acceptance.
- Owner cannot access another location.

Operator note for dev rollout: revoke and resend any outstanding invitations issued with the legacy `/invites/:token` path format before rollout. Use the admin console's resend action or the owner invite resend API; replacement invites revoke prior pending invites for that owner and location. Do not copy real invite tokens into logs or tickets.

## Step 3: Client Dashboard Setup

The owner should complete most launch setup from the client dashboard Setup tab:

1. Business profile.
2. Store operations.
3. Stripe Connect.
4. Optional connectors such as Clover. Clover is not required for launch.
5. Menu review or menu entry.
6. Team setup or skip.
7. Test order confirmation.
8. Submit for Nomly review.

Only owners should connect payment providers. Managers and store users must not be used for Stripe Connect onboarding.

## Step 4: Configure Payment Profile

Preferred path:

1. Client dashboard: `Setup` -> `Payments`.
2. Owner starts Stripe Connect onboarding.
3. Owner completes onboarding through Stripe.
4. Owner returns to the client dashboard.
5. Confirm Stripe status is `completed` before launch.

Verification:

- Payment profile has `stripeAccountId`.
- Stripe onboarding status is `completed`.
- Dev uses dev/sandbox payment credentials.
- Production uses production/live payment credentials.

Hold launch if:

- Stripe onboarding is incomplete.
- Payment profile is missing.
- The account belongs to the wrong merchant.

## Step 5: Seed or Import Menu

Preferred path:

1. Operator dashboard for the target environment.
2. Go to `Menu`.
3. Create categories and menu items.
4. Mark launch items visible.

If using menu sync:

- Confirm `MENU_SYNC_LOCATION_ID` matches this merchant.
- Run or wait for the menu sync worker.
- Verify imported categories/items before exposing the merchant.

Verification:

- `GET /v1/menu?locationId=$LOCATION_ID` returns at least one visible item.
- Mobile app menu loads from backend, not fallback data.
- No placeholder items are visible.

Deferred feature:

- AI-assisted Nomly menu seeding is Gate 2. For Gate 1, seed menus manually, import them through existing tooling, or use an approved connector/sync path.

## Step 6: Validate Fulfillment Mode

Every live merchant must use staff-driven fulfillment.

Preferred path:

1. Admin console: `Clients` -> select client -> `Capabilities`.
2. Set fulfillment mode to `staff`.
3. Save.

Verification:

- Launch-readiness check `fulfillment_mode_set` passes.
- A paid order does not auto-progress to `READY`.
- Dashboard operator can manually move order status.

Hold launch if fulfillment mode is `time_based`.

## Step 7: Upload Menu Media

Preferred path:

1. Operator dashboard: `Menu`.
2. Edit an item.
3. Upload JPG/PNG image.
4. Save and verify it appears in the menu editor.

Verification:

- Item has an `imageUrl`.
- Mobile app renders the image.
- Upload size and content type validation reject invalid files.

Hold launch if operators need external image hosting to manage the menu.

## Step 8: Verify Store Config

Operator dashboard:

1. Go to `Store Settings`.
2. Set hours text, open state, next-open behavior if used, prep ETA, pickup instructions, and tax rate.
3. Save.

Verification:

- `GET /v1/store/config?locationId=$LOCATION_ID` returns correct values.
- Tax calculation in quote matches expected merchant tax behavior.
- Pickup instructions are customer-safe.

## Step 9: Register Merchant App Values

For a branded app, update EAS environment values before building.

Reference: [mobile-eas-builds.md](./mobile-eas-builds.md).

Required per merchant:

- `APP_DISPLAY_NAME_BASE`.
- `IOS_BUNDLE_IDENTIFIER`.
- `EXPO_PUBLIC_API_BASE_URL`.
- `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID`.
- `EXPO_PUBLIC_BRAND_NAME`.
- Apple Sign-In client/bundle identifier must be registered in Apple Developer.

Rawaq current identifiers:

- Beta: `com.lattelink.rawaq.beta` -> `dev`.
- Production: `com.lattelink.rawaq` -> `production`.

Verification:

- Beta build points to `https://api-dev.nomly.us/v1`.
- Production build points to `https://api.nomly.us/v1`.
- Apple Sign-In works in the target app build.
- Apple Pay merchant id matches the target environment.

## Step 10: Place a Staging Test Order

Use `dev` first.

1. Install or open the beta app.
2. Sign in with Apple.
3. Load menu.
4. Add item to cart.
5. Quote order.
6. Pay through the configured dev/sandbox payment path.
7. Confirm order appears in preview/operator dashboard for `dev`.
8. Advance order status from dashboard.
9. Confirm mobile app sees status changes.
10. Confirm loyalty balance/ledger loads if enabled.

Verification:

- Order reaches `PAID`.
- Dashboard can advance to `IN_PREP`, `READY`, and `COMPLETED`.
- Support page can find the order by order ID.
- Sentry has no new unexpected errors.

## Step 11: Submit and Complete Launch Readiness

Client action:

1. Owner opens client dashboard `Setup`.
2. Owner confirms all client-owned checks are complete.
3. Owner selects `Submit for review`.

Nomly action:

1. Open admin console `Launch Readiness`.
2. Review blockers.
3. Complete mobile build/App Store work manually.
4. Update mobile release status as work progresses, for example `submitted_for_review`, `approved`, or `ready_for_launch`.
5. Approve launch manually only after critical checks pass.
6. Mark live only after the app is actually live.

Required checks:

- Owner provisioned.
- Stripe onboarded.
- Menu has visible items.
- Fulfillment mode explicitly configured as `staff`.
- Test order confirmed.
- Mobile release is ready for launch.
- Manual launch approval is recorded.

Reference: [launch-readiness-checklist.md](./launch-readiness-checklist.md).

Hold launch if any automated check fails. Manual test-order confirmation must include the test order ID.

## Step 12: Production Go-Live

Only after dev validation passes:

1. Promote the exact validated image SHA to production.
2. Confirm production deploy is complete.
3. Verify `https://api.nomly.us/health`.
4. Verify `https://api.nomly.us/ready`.
5. Open production admin console and confirm launch readiness.
6. Open production dashboard and confirm owner can sign in.
7. Confirm client dashboard shows the current mobile release status.
8. Install or open production app build.
9. Place one controlled real production order if the merchant accepts it.
10. Confirm order appears in production dashboard.
11. Confirm staff can complete fulfillment.
12. Mark launch live in the admin console.

Record:

- Release commit SHA.
- Image SHA.
- Merchant generated `locationId`.
- Test order id.
- Stripe payment id.
- Approver.
- Launch timestamp.

## Step 13: Owner Handoff Checklist

Before telling the merchant they are live:

- Owner can sign in.
- Owner can see live orders.
- Owner knows how to advance statuses.
- Owner knows where menu editing lives.
- Owner knows how to contact Nomly support.
- Merchant understands that `READY` should only be selected when the order is actually ready.
- Merchant understands refund/support escalation path.

## Rollback / Hold Launch

Hold launch when:

- `/ready` fails.
- Stripe onboarding is not complete.
- Production payment profile is missing or wrong.
- Fulfillment is not `staff`.
- Menu has no visible items.
- Owner cannot sign in.
- Test order cannot be found in dashboard.
- Sentry shows new checkout/auth/payment errors during validation.

Rollback production when:

- checkout is broken after deploy.
- Apple Sign-In is broken for production app.
- paid orders do not reconcile.
- dashboard cannot reach backend.
- support page cannot find newly paid orders.

Rollback procedure:

1. Stop launch announcement or pause ordering if already announced.
2. Promote the previous known-good image SHA to production.
3. Re-run `health`, `ready`, auth, menu, checkout, dashboard, and support lookup checks.
4. Record the incident using [pilot-incident-response.md](./pilot-incident-response.md).
5. Create GitHub issues for follow-up fixes.
