# Product Stage

Last verified: 2026-04-27 (from code)

## Classification: Commercial MVP (pre-production)

The platform has all the technical pieces required for one merchant to accept real orders and real payments from real customers. It has never done so in a live production environment.

## What "commercial MVP" means here

- The customer ordering flow (browse → cart → checkout → order history) is fully implemented and type-safe.
- Stripe Connect payments (including Apple Pay) are wired end-to-end.
- The merchant operator dashboard covers orders, menu management, store config, and team management.
- An internal admin console exists to onboard merchants via bootstrap + owner provisioning.
- Loyalty (fixed points program) is implemented.
- Push notifications are wired via Expo push.
- CI passes lint, typecheck, unit tests, and contract drift checks.

## What prevents it from being "early SaaS platform"

1. **Never processed a real live payment.** The platform exists but has not run a real pilot.
2. **Time-based fulfillment is the default.** Orders auto-progress without staff confirmation. Real merchants need staff-driven transitions.
3. **Loyalty is cross-merchant.** The `loyalty_balances` table has no `location_id`. A second merchant would share the same loyalty pool as the first. This is a data integrity bug.
4. **Stripe reconciliation has no stale-order recovery.** If a webhook is missed or delayed, an order can remain stuck in `PENDING_PAYMENT` indefinitely.
5. **Single-host deployment.** One Docker Compose host with no failover.
6. **No environment separation.** Development/testing is not properly isolated from the live deployed runtime yet.
7. **No observability.** No error aggregation, no alerting, no metrics beyond `/health`.
8. **Mobile app is one app per merchant.** Separate EAS build profile per merchant required.

## One-sentence honest summary

The platform is a solid, well-typed commercial MVP that could support one merchant in a controlled pilot today if three specific issues are fixed first (fulfillment mode, loyalty scoping, stale payment reconciliation).

## Path to next classification

**Early SaaS platform** requires:
- 2+ merchants processing real orders simultaneously
- Loyalty correctly scoped per merchant
- No hardcoded tenant defaults
- Development and production environments separated cleanly
- Structured logging and basic alerting
- Multi-host or managed container deployment
- SaaS billing per merchant

Estimated progression: Gate 1 + Gate 2 from ROADMAP.md, followed by selective Gate 3 work only after real merchant usage justifies it.
