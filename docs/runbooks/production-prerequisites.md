# Production Prerequisites Checklist

Last reviewed: `2026-03-21`

## Purpose

Hard-gate checklist before enabling real passkey auth, Apple Pay, and Clover processing.

## Domain and DNS

- [ ] Acquire domain (`<your-domain>`).
- [ ] Create DNS records:
- [ ] `api.<your-domain>` -> gateway ingress
- [ ] `auth.<your-domain>` -> identity ingress (or route via gateway)
- [ ] TLS is active for all public endpoints.

## Apple Developer Setup

- [ ] Apple Developer account has active enrollment.
- [ ] App ID includes required capabilities:
- [ ] Sign In with Apple
- [ ] Associated Domains
- [ ] Apple Pay
- [ ] Associated domains configured:
- [ ] `webcredentials:<your-domain>`
- [ ] `applinks:<your-domain>` (if universal links are used)
- [ ] Merchant ID created.
- [ ] Apple Pay payment processing certificate created and stored.
- [ ] AASA file is hosted and reachable over HTTPS.

## Clover Setup

- [ ] Clover sandbox account enabled.
- [ ] Clover production account enabled.
- [ ] Clover app created with OAuth redirect URI configured.
- [ ] Clover app credentials (`appId`, `appSecret`) stored in vault.
- [ ] Merchant OAuth approval succeeds in sandbox.
- [ ] PAKMS/apiAccessKey retrieval succeeds after OAuth callback.
- [ ] Sandbox merchantId confirmed.
- [ ] Webhook endpoint URL and signing secret configured.
- [ ] Idempotency behavior validated in sandbox.

## GitHub Vars and Secrets

Set in the repository vars and secrets used by the free-first deploy workflows and document them in internal vault:

- [ ] `FREE_API_DOMAIN`
- [ ] `FREE_IMAGE_REGISTRY_PREFIX`
- [ ] `FREE_CLIENT_DASHBOARD_DOMAIN`
- [ ] `FREE_DATABASE_URL` or `FREE_POSTGRES_PASSWORD`
- [ ] `FREE_GATEWAY_INTERNAL_API_TOKEN`
- [ ] `FREE_ORDERS_INTERNAL_API_TOKEN`
- [ ] `FREE_LOYALTY_INTERNAL_API_TOKEN`
- [ ] `FREE_NOTIFICATIONS_INTERNAL_API_TOKEN`
- [ ] `FREE_JWT_SECRET`
- [ ] `LETSENCRYPT_EMAIL`
- [ ] `APPLE_TEAM_ID`
- [ ] `APPLE_KEY_ID`
- [ ] `APPLE_PRIVATE_KEY`
- [ ] `APPLE_ALLOWED_CLIENT_IDS`
- [ ] `FREE_GOOGLE_OAUTH_CLIENT_ID`
- [ ] `FREE_GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] `FREE_GOOGLE_OAUTH_STATE_SECRET`
- [ ] `FREE_CLOVER_APP_ID`
- [ ] `FREE_CLOVER_APP_SECRET`
- [ ] `FREE_CLOVER_OAUTH_REDIRECT_URI`
- [ ] `FREE_CLOVER_OAUTH_STATE_SECRET`
- [ ] `FREE_CLOVER_BEARER_TOKEN`
- [ ] `FREE_CLOVER_API_ACCESS_KEY`
- [ ] `FREE_CLOVER_MERCHANT_ID`
- [ ] `FREE_CLOVER_WEBHOOK_SHARED_SECRET`

## Exit Criteria

- [ ] Passkey challenge + verify works on physical iOS device.
- [ ] Apple sign-in exchange issues valid session.
- [ ] Apple Pay -> Clover charge + refund works in sandbox.
- [ ] Webhook reconciliation updates payment state reliably.
