# Replace mobile Orders polling with real-time order-state updates

## Problem

The mobile Orders screen currently requires manual refresh to pick up backend order-state changes unless the client polls the orders endpoint.

Polling is not the right long-term behavior because it:

- adds avoidable network traffic while an order is active
- increases battery usage compared with event-driven updates
- can produce visible refresh chrome if not carefully hidden
- still introduces delay between the authoritative backend transition and the UI update

## Current stopgap

The short-lived mobile polling experiment has been removed. Orders now rely on manual refresh again.

This avoids the UX and battery cost of polling, but it means the active-order experience is not truly live yet.

## Why this needs a real solution

The order-tracking surface should update when the backend order state changes, without:

- requiring a user pull-to-refresh
- continuous polling from the foreground screen
- client-side heuristics that guess when an order may have changed

## Proposed target design

Use backend-originated order-state events to trigger near-real-time mobile refresh.

Preferred flow:

1. `services/orders` writes an authoritative order-state transition.
2. `services/orders` emits an internal order-state notification event.
3. `services/notifications` delivers a device push notification for the affected user.
4. The mobile app listens for that foreground/background notification.
5. The mobile app invalidates or refetches the `["account", "orders"]` query when the event is for the signed-in user.

## Scope

Backend:

- ensure all meaningful order-state transitions emit order-state notification events
- ensure notifications outbox processing is reliable for active-order updates
- define payload shape/versioning for mobile-safe order-state refresh triggers

Mobile:

- add `expo-notifications`
- register device push permissions and token in production flow, not just dev testing
- listen for foreground notification receipt and notification responses
- invalidate `["account", "orders"]` and related account/order queries on relevant order-state events
- avoid visual pull-to-refresh chrome during background-triggered query invalidation

## Data and event considerations

- notification payloads should include at minimum `orderId`, `status`, `occurredAt`, and a stable event type
- client handling should be idempotent
- stale or duplicate events must not create bad UI state
- if the user is signed out, the app should ignore order-state refresh events

## Testing requirements

- foreground notification receipt refreshes Orders data without visible pull-to-refresh
- background/opened-app notification refreshes Orders data on resume/navigation
- duplicate notifications do not cause broken UI state
- irrelevant notifications do not refetch Orders unnecessarily
- missing notification permission degrades gracefully to manual refresh

## Acceptance criteria

- active-order UI updates without manual refresh
- no continuous polling is required on the Orders screen
- no visible pull-to-refresh chrome appears for background-triggered updates
- update latency is driven by backend event delivery rather than client polling interval
- notification-driven refresh is idempotent and resilient to duplicate delivery
