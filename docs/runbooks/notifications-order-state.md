# Notifications Push Tokens and Order-State Events

Last reviewed: `2026-09-23`

## Purpose

Validate local push-token registration and order-state notification dispatch behavior.

## Endpoints

- Gateway public endpoint:
  - `PUT /v1/devices/push-token`
- Notifications service internal endpoint:
  - `POST /v1/notifications/internal/order-state`
  - `POST /v1/notifications/internal/outbox/process`
  - `POST /v1/notifications/internal/receipts/process`
  - `GET /v1/notifications/internal/delivery-health`

## Local Flow

1. Register a device push token to a user.
2. Trigger an order lifecycle event for the same user.
3. Confirm notifications service accepted and enqueued the event.
4. Process outbox entries and confirm dispatch summary.

Internal notifications routes now require `NOTIFICATIONS_INTERNAL_API_TOKEN`.

## Register Push Token Through Gateway

```bash
USER_ID="123e4567-e89b-12d3-a456-426614174950"

curl -s http://127.0.0.1:8080/v1/devices/push-token \
  -X PUT \
  -H "content-type: application/json" \
  -H "x-user-id: ${USER_ID}" \
  -d '{
    "deviceId": "ios-dev-01",
    "platform": "ios",
    "expoPushToken": "ExponentPushToken[local-dev-token]"
  }'
```

Expected response:

```json
{ "success": true }
```

## Emit Internal Order-State Event

```bash
curl -s http://127.0.0.1:3005/v1/notifications/internal/order-state \
  -X POST \
  -H "content-type: application/json" \
  -H "x-internal-token: ${NOTIFICATIONS_INTERNAL_API_TOKEN}" \
  -d "{
    \"userId\":\"${USER_ID}\",
    \"orderId\":\"123e4567-e89b-12d3-a456-426614174951\",
    \"status\":\"PAID\",
    \"pickupCode\":\"PICKUP1\",
    \"locationId\":\"location-01\",
    \"occurredAt\":\"2026-03-10T18:00:00.000Z\",
    \"note\":\"Payment accepted\"
  }"
```

Expected response shape for simulated dispatch:

```json
{ "accepted": true, "enqueued": 1, "deduplicated": false }
```

Repeat the same payload:
- expected `deduplicated: true`
- expected `enqueued: 0`

## Process Outbox Entries

```bash
curl -s http://127.0.0.1:3005/v1/notifications/internal/outbox/process \
  -X POST \
  -H "content-type: application/json" \
  -H "x-internal-token: ${NOTIFICATIONS_INTERNAL_API_TOKEN}" \
  -d '{"batchSize":50}'
```

Expected response shape:

```json
{ "processed": 1, "dispatched": 1, "retried": 0, "failed": 0 }
```

You can also run the local worker loop instead of manual processing:

```bash
START_NOTIFICATIONS_DISPATCH_WORKER=1 pnpm dev:services
```

Ensure the worker environment also has `NOTIFICATIONS_INTERNAL_API_TOKEN` set.

In Expo mode, `dispatched` means Expo accepted the push ticket. It does not mean delivery.
The same worker polls Expo receipts and persists `DISPATCHED` (receipt `ok`), `FAILED`,
or `EXPIRED` after 24 hours without a receipt. It retires a `DeviceNotRegistered`
token only if the device still has the same token; a fresh registration is preserved.
`EXPO_RECEIPT_API_URL` overrides the receipt endpoint for a controlled test server.
`NOTIFICATIONS_ENVIRONMENT` labels new outcomes (set it to `dev` on live dev;
otherwise `DEPLOY_ENV` is used).

The internal delivery-health endpoint requires `x-internal-token` and returns
`pending`, `submitted`, `oldestSubmittedAgeSeconds`, and outcome counts grouped by
`merchantId`, `environment`, and `notificationType`. Postgres resolves merchantId
from `catalog_client_locations.tenant_id`, falling back to location ID when that
mapping is absent. The endpoint exposes no device token, message content, or
provider credential. Monitoring for #417 can alert on old `submitted` entries;
its workflow and alert destination are owned by that issue.

## Orders Integration

`services/orders` emits internal order-state events for `PENDING_PAYMENT`, `PAID`,
`IN_PREP`, `READY`, `COMPLETED`, and `CANCELED`. Confirmed refunds emit a
`REFUNDED` notification while the authoritative order remains `CANCELED`.

The notifications service also accepts `REFUNDED` when a refund is confirmed by
the payment path. Order status remains `CANCELED`; receipt outcomes never update
order state. Unpaid `PENDING_PAYMENT` is not pushed. Earlier rows marked
`DISPATCHED` before receipt tracking existed have no receipt IDs and cannot be
retroactively verified.

The integration is best-effort and does not block order responses if notifications is unavailable.
