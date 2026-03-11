# Production Prerequisites Checklist

Last reviewed: `2026-03-11`

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
- [ ] App credentials created for ecommerce flow.
- [ ] Webhook endpoint URL and signing secret configured.
- [ ] Idempotency behavior validated in sandbox.

## GitHub Environments and Secrets

Set in GitHub Environments (`dev`, `staging`, `prod`) and documented in internal vault:

- [ ] `AWS_ROLE_ARN`
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `APPLE_TEAM_ID`
- [ ] `APPLE_KEY_ID`
- [ ] `APPLE_PRIVATE_KEY`
- [ ] `APPLE_SERVICE_ID`
- [ ] `APPLE_MERCHANT_ID`
- [ ] `CLOVER_API_KEY`
- [ ] `CLOVER_MERCHANT_ID`
- [ ] `CLOVER_WEBHOOK_SECRET`
- [ ] `JWT_PRIVATE_KEY`
- [ ] `JWT_PUBLIC_KEY`
- [ ] `EXPO_TOKEN`

## Exit Criteria

- [ ] Passkey challenge + verify works on physical iOS device.
- [ ] Apple sign-in exchange issues valid session.
- [ ] Apple Pay -> Clover charge + refund works in sandbox.
- [ ] Webhook reconciliation updates payment state reliably.
