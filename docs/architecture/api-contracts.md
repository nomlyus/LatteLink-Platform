# API Contracts: First Cut

Historical first-cut reference. See [payment and order flow](../payment-order-flow.md) for the supported 1.2.0 customer checkout sequence.

## Base URL

`https://api.gazellecoffee.com/v1`

## Auth

- `POST /auth/apple/exchange`
- `POST /auth/passkey/register/challenge`
- `POST /auth/passkey/register/verify`
- `POST /auth/passkey/auth/challenge`
- `POST /auth/passkey/auth/verify`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

## Catalog

- `GET /menu`
- `GET /store/config`

## Orders

- `POST /orders/quote`
- `POST /orders/checkouts` (create a customer-bound checkout draft)
- `POST /orders` (retired; returns 410 `LEGACY_ORDER_CREATE_RETIRED`)
- `GET /orders`
- `GET /orders/{orderId}`
- `POST /orders/{orderId}/cancel`

## Loyalty

- `GET /loyalty/balance`
- `GET /loyalty/ledger`

## Notifications

- `PUT /devices/push-token`
