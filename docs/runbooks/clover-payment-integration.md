# Clover Payment Integration Path

Last reviewed: `2026-04-03`

## Scope

M4.3 introduces Clover charge and refund paths across `orders` and `payments`:

- `payments`:
  - `POST /v1/payments/charges`
  - `POST /v1/payments/refunds`
- `orders`:
  - `POST /v1/orders/:orderId/pay` now calls payments charge endpoint
  - `POST /v1/orders/:orderId/cancel` triggers refund for paid orders

## Provider Modes

`payments` supports two Clover provider modes:

- `simulated` (default): deterministic local outcomes for development/testing
- `live`: real upstream Clover HTTP calls using configured endpoints and credentials

Live mode env:

- `CLOVER_PROVIDER_MODE=live`
- `CLOVER_BEARER_TOKEN` or `CLOVER_API_KEY` legacy fallback
- `CLOVER_API_ACCESS_KEY` (required for Clover card tokenization and when charging with `applePayWallet` unless Clover OAuth is connected)
- `CLOVER_MERCHANT_ID`
- `CLOVER_OAUTH_ENVIRONMENT=sandbox|production`
- `CLOVER_APP_ID`
- `CLOVER_APP_SECRET`
- `CLOVER_OAUTH_REDIRECT_URI`
- `CLOVER_OAUTH_STATE_SECRET` (optional; defaults to `CLOVER_APP_SECRET`)
- `CLOVER_OAUTH_AUTHORIZE_ENDPOINT` (optional override)
- `CLOVER_OAUTH_TOKEN_ENDPOINT` (optional override)
- `CLOVER_OAUTH_REFRESH_ENDPOINT` (optional override)
- `CLOVER_OAUTH_PAKMS_ENDPOINT` (optional override; sandbox default is `https://scl-sandbox.dev.clover.com/pakms/apikey`)
- `CLOVER_CHARGE_ENDPOINT` (supports `{merchantId}` template)
- `CLOVER_REFUND_ENDPOINT` (supports `{merchantId}` and `{paymentId}` templates)
- `CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT` (required for Clover card tokenization and when charging with `applePayWallet`)
- `CLOVER_WEBHOOK_SHARED_SECRET` (required for verified webhook deliveries; set this to the Clover webhook auth code / `X-Clover-Auth` value after Clover validates the callback URL)
- `ORDERS_SERVICE_BASE_URL` (defaults to `http://127.0.0.1:3001`)
- `ORDERS_INTERNAL_API_TOKEN` (required in both `payments` and `orders`; payments charge/refund writes and orders reconciliation both reject requests until it is set)

### Sandbox endpoint baseline (validated)

For Clover sandbox ecommerce:

- `CLOVER_CHARGE_ENDPOINT=https://scl-sandbox.dev.clover.com/v1/charges`
- `CLOVER_REFUND_ENDPOINT=https://scl-sandbox.dev.clover.com/v1/refunds`
- `CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT=https://token-sandbox.dev.clover.com/v1/tokens`

Token roles:

- `CLOVER_BEARER_TOKEN` in service runtime is the Clover Bearer credential used for `/v1/charges` and `/v1/refunds`.
  - for single-merchant ecommerce setups, this can be the Clover private ecommerce token
  - for app-based OAuth setups, the service stores and refreshes the Clover OAuth access token and uses that instead
- `CLOVER_API_ACCESS_KEY` is the Clover public `apiAccessKey` used as the `apikey` header on `/v1/tokens` for Clover card tokenization and Apple Pay wallet tokenization.
  - for app-based OAuth setups, the service fetches and stores this from Clover PAKMS after OAuth callback/refresh
- `CLOVER_API_KEY` remains supported as a legacy alias for `CLOVER_BEARER_TOKEN` while existing environments migrate.
- `CLOVER_MERCHANT_ID` should be Clover `merchantId` (for sandbox this is commonly a 13-character alphanumeric value), not an external MID label.

## OAuth Connection Flow

When merchant ecommerce tokens are not sufficient, `payments` supports Clover OAuth app connection endpoints:

- `GET /v1/payments/clover/oauth/status`
- `GET /v1/payments/clover/oauth/connect`
- `GET /v1/payments/clover/oauth/callback`
- `POST /v1/payments/clover/oauth/refresh`

Recommended sandbox flow:

1. Configure `CLOVER_APP_ID`, `CLOVER_APP_SECRET`, `CLOVER_OAUTH_REDIRECT_URI`, and `CLOVER_PROVIDER_MODE=live`.
2. Open `GET /v1/payments/clover/oauth/connect` and follow the returned `authorizeUrl`.
3. Complete Clover approval and land on `GET /v1/payments/clover/oauth/callback`.
4. Confirm `GET /v1/payments/clover/oauth/status` reports `connected: true` and `credentialSource: "oauth"`.
5. Verify `GET /ready` reports `providerConfigured: true`.

Production note:

- completing OAuth and webhook verification proves the Clover app connection is live, but it does not by itself validate charge/refund execution
- the current production checkout path can now reach live Clover through either Apple Pay or the Clover card-token path
- the deployed production test-merchant validation has already covered Clover card tokenization, successful charge, declined-payment retry behavior, and refund/cancel flow through the card path
- Apple Pay enablement remains a separate launch concern only if the chosen release explicitly needs Apple Pay

Direct Clover app-launch note:

- Clover can launch your app before `code` and `state` exist. In that case Clover typically sends merchant context first, and your app must start the `/oauth/v2/authorize` step from there.
- `payments` now treats callback hits that only include `merchant_id` as an OAuth launch and immediately redirects into Clover authorization instead of returning `CLOVER_OAUTH_INVALID_CALLBACK`.

Connection persistence:

- OAuth access token, refresh token, expiry times, and PAKMS `apiAccessKey` are stored in `payments_clover_connections`.
- When the stored access token is near expiry, the service refreshes it automatically before live charge/refund calls.

## Webhook Reconciliation

`payments` now accepts provider callbacks at:

- `POST /v1/payments/webhooks/clover`

Verification note:

- Clover may first send a verification payload containing `verificationCode` before normal webhook auth is active.
- `payments` now accepts that verification callback with `200` so Clover can validate the public URL.
- `payments` also logs the received `verificationCode` clearly for operators. During onboarding, click `Send Verification Code` in Clover, then read the code from the live `payments` service logs and paste it back into the Clover webhook form.
- the latest active verification code is also available briefly at `GET /v1/payments/clover/webhooks/verification-code` through the public API. Before Clover sends the verification payload this returns `404`; after the payload arrives it returns the latest `verificationCode`, `receivedAt`, and `expiresAt`.
- after verification, production deliveries authenticate with the Clover auth header (`X-Clover-Auth`), which should match `CLOVER_WEBHOOK_SHARED_SECRET`

On each webhook:

1. `payments` resolves the corresponding charge/refund from persisted state
2. updates persisted payment/refund status with provider outcome
3. dispatches internal reconciliation to:
   - `POST /v1/orders/internal/payments/reconcile`

`payments` charge and refund endpoints are internal-only. Callers must supply the shared `ORDERS_INTERNAL_API_TOKEN` as `x-internal-token`.

`orders` then applies idempotent order transitions:

- `CHARGE: SUCCEEDED` -> transition `PENDING_PAYMENT` -> `PAID`
- `REFUND: REFUNDED` -> transition `PAID` -> `CANCELED`

Loyalty side effects are applied using existing idempotency keys, so duplicate webhook deliveries are safe.

## Charge Outcomes

`payments` simulates Clover outcomes based on payment payload content:

- `applePayToken` includes `decline` -> `DECLINED`
- `applePayToken` includes `timeout` -> `TIMEOUT`
- if using structured `applePayWallet`, its `data` value is used for the same simulation rules
- any other signal -> `SUCCEEDED`

`orders` maps these outcomes to API behavior:

- `SUCCEEDED` -> order transitions to `PAID`
- `DECLINED` -> `402` with `PAYMENT_DECLINED`
- `TIMEOUT` -> `504` with `PAYMENT_TIMEOUT`

Timeout hardening rule:

- once a timed-out Clover charge snapshot is persisted on the order, subsequent pay attempts for that order return `409 PAYMENT_RECONCILIATION_PENDING`
- pilot operators should not start a brand-new payment attempt until either:
  - Clover reconciliation webhook marks the charge `SUCCEEDED` or `DECLINED`
  - support verifies in Clover that the timed-out charge did not settle and explicitly decides the customer should retry

## Refund Outcomes

When canceling a `PAID` order:

1. orders submits a refund request to payments
2. if refund status is `REFUNDED`, order transitions to `CANCELED`
3. if refund status is `REJECTED`, orders returns `409` with `REFUND_REJECTED`

For dev simulation, a cancel reason containing `reject` returns a rejected refund.

## Idempotency

- Charges are idempotent in payments by `orderId:idempotencyKey`.
- Refunds are idempotent in payments by `orderId:idempotencyKey`.
- Orders keeps pay idempotency per `orderId:idempotencyKey` for paid responses.
- Orders refund requests use `cancel:<orderId>:<reasonHashPrefix>` so identical cancel retries are idempotent while failed refund attempts can be retried with changed cancellation context.

## Pilot Recovery Matrix

- charge `DECLINED`
  - customer retry is allowed with a new payment idempotency key
- charge `TIMEOUT`
  - do not ask the customer to keep tapping pay
  - wait for Clover webhook reconciliation or verify the payment outcome in Clover first
- refund `REJECTED`
  - order stays in its current state
  - rejected refund snapshot is persisted so support has the Clover identifiers needed for follow-up
- refund webhook after `COMPLETED`
  - orders accepts the reconciliation as a no-op
  - no automatic order state regression occurs
  - support reviews the refund separately

## Verification

```bash
pnpm --filter @lattelink/persistence build
pnpm --filter @lattelink/payments lint
pnpm --filter @lattelink/payments typecheck
pnpm --filter @lattelink/payments test
pnpm --filter @lattelink/orders lint
pnpm --filter @lattelink/orders typecheck
pnpm --filter @lattelink/orders test
```

## Free-First Rollout Mapping

For the DigitalOcean/free-first deployment lane, the live Clover inputs are split between GitHub variables and secrets.

GitHub variables:

- `FREE_PAYMENTS_PROVIDER_MODE` -> `PAYMENTS_PROVIDER_MODE` and `CLOVER_PROVIDER_MODE`
- `FREE_CLOVER_OAUTH_ENVIRONMENT` -> `CLOVER_OAUTH_ENVIRONMENT`
- `FREE_CLOVER_CHARGE_ENDPOINT` -> `CLOVER_CHARGE_ENDPOINT`
- `FREE_CLOVER_REFUND_ENDPOINT` -> `CLOVER_REFUND_ENDPOINT`
- `FREE_CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT` -> `CLOVER_APPLE_PAY_TOKENIZE_ENDPOINT` for Clover card tokenization and Apple Pay wallet tokenization

GitHub secrets:

- `FREE_CLOVER_BEARER_TOKEN` -> `CLOVER_BEARER_TOKEN`
- `FREE_CLOVER_API_KEY` -> `CLOVER_API_KEY` legacy fallback
- `FREE_CLOVER_API_ACCESS_KEY` -> `CLOVER_API_ACCESS_KEY`
- `FREE_CLOVER_MERCHANT_ID` -> `CLOVER_MERCHANT_ID`
- `FREE_CLOVER_APP_ID` -> `CLOVER_APP_ID`
- `FREE_CLOVER_APP_SECRET` -> `CLOVER_APP_SECRET`
- `FREE_CLOVER_OAUTH_REDIRECT_URI` -> `CLOVER_OAUTH_REDIRECT_URI`
- `FREE_CLOVER_OAUTH_STATE_SECRET` -> `CLOVER_OAUTH_STATE_SECRET`
- `FREE_CLOVER_WEBHOOK_SHARED_SECRET` -> `CLOVER_WEBHOOK_SHARED_SECRET`

Before enabling `FREE_PAYMENTS_PROVIDER_MODE=live`, validate the final env shape with:

```bash
./infra/free/bin/check-live-payments-env.sh infra/free/.env.example
```

On the host, `deploy-free` runs the same validation against the generated server `.env` before `docker compose up`.
