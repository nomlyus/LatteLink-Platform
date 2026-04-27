# Roadmap

Last updated: 2026-04-27  
Basis: code audit + product vision  
See PRODUCT_STAGE.md for current classification and ARCHITECTURE.md for system map.

## Vision

LatteLink begins as a branded mobile ordering platform for independent coffee shops. The long-term goal is to become a **Growth OS**: a platform that helps merchants own customer relationships, understand order patterns, identify revenue opportunities, and run targeted campaigns that drive repeat business.

## Current State Summary

- One active merchant (`rawaqcoffee01`) in a pre-production state
- Full ordering, payment, and loyalty flow implemented
- Merchant dashboard functional for orders, menu, store config, team
- Internal admin console for merchant onboarding
- Single-host Docker Compose deployment
- Development, testing, and deployed runtime are not properly separated yet
- Three blocking issues before any live pilot: fulfillment mode, loyalty scoping, stale payment reconciliation

---

## How This Roadmap Works

This roadmap is organized as **execution gates**, not dates.

- **Gate 1** must be completed before live pilot operations are considered safe.
- **Gate 2** starts once the platform is safe enough to sell and onboard while the rest of the startup focuses on client acquisition.
- **Gate 3** starts only after launch dates, merchant count, and real usage justify building Growth OS capabilities.

The rule is simple: do not start Gate 3 work just because there is time. Start it only when Gate 1 is closed, Gate 2 is in a healthy state, and real client demand and data justify it.

---

## Gate 1 — Pilot Safety, Environment Separation, and Merchant Readiness
**Goal**: Make the system safe to operate for live pilot merchants.

### Scope
- Set `staff` fulfillment mode as the default for all real merchant deployments
- Add stale `PENDING_PAYMENT` order reconciliation against Stripe
- Fix loyalty `location_id` scoping before any second merchant
- Audit and enforce tenant isolation on admin/operator routes
- Honor requested operator location context at sign-in and clean up multi-location session handling
- Add structured JSON logging with request IDs
- Add Sentry and basic error visibility
- Enforce absolute session TTL
- Validate and harden the existing R2 media upload pipeline in a deployed environment
- Remove unconditional order-stream polling when event-bus SSE subscription succeeds
- Add launch-readiness checklist in the admin console
- Run backup/restore drill and document recovery steps
- Add basic support tooling needed for early merchants
- Write a clear merchant onboarding runbook
- Create proper environment separation so development and testing no longer happen against the live deployed stack

### Environment Separation Requirements
- Separate **development** and **production** environments
- Separate runtime config and secrets per environment
- Safe deployment path to `dev` before `production`
- No direct day-to-day development against the production deployment

### Exit Criteria
- No known cross-merchant loyalty contamination remains
- No paid order can silently remain unresolved after webhook failure
- Operators cannot cross tenant boundaries through known admin-route gaps
- Logs and alerts are good enough to investigate real incidents quickly
- Backup/restore has been exercised, not just documented
- A merchant can be onboarded through a repeatable checklist and runbook
- Development and testing are isolated from production

### Representative Work
- fulfillment defaults
- stale-payment reconciliation
- loyalty scoping migration
- tenant-isolation audit
- operator session/location cleanup
- structured logging and Sentry
- launch-readiness checklist
- support tooling
- onboarding runbook
- dev/prod environment split

---

## Gate 2 — Surface Polish and Small Operational Features
**Goal**: Improve the mobile app and operator surfaces while sales and onboarding are happening.

### Scope
- Mobile UX cleanup and copy fixes
- Client dashboard UX cleanup and faster daily workflows
- Search/filter improvements for operator order management
- Remove misleading hardcoded fallback data from customer-facing mobile surfaces
- Support-driven small features that reduce onboarding or operating friction
- Merchant-facing polish that materially helps demos, onboarding, or daily service

### Exit Criteria
- Operator workflows feel reliable in day-to-day store use
- The mobile app no longer has obvious demo-breaking or merchant-embarrassing UX issues
- Support and sales feedback is producing incremental polish rather than exposing fundamental gaps

### Representative Work
- pickup ETA copy polish
- dashboard order search/filter
- mobile fallback-data removal
- small dashboard/mobile workflow improvements

---

## Gate 3 — Growth OS Buildout
**Goal**: Build analytics, campaigns, and Growth OS architecture only after there are enough committed/live merchants and enough real usage data to justify it.

### Entry Conditions
- Gate 1 is fully complete
- Gate 2 is healthy enough that onboarding/sales are not blocked by obvious product friction
- Real merchants are committed or live
- Operational support load is under control
- Enough real order/customer data exists to justify analytics and campaign tooling

### Scope

#### Data Foundation
- `merchant_customer_profiles`
- `behavioral_events`
- KPI summary endpoints
- analytics-ready support tables

#### Merchant Growth Tools
- loyalty program configurability
- promo codes
- manual campaigns
- push receipt polling
- analytics dashboard
- attribution
- segments and exports

#### Growth OS / Automation
- event-triggered campaigns
- AI copy suggestions
- Growth Score / merchant digests

#### Later Scale Hardening
- managed containers
- PgBouncer / connection pooling
- SaaS billing
- RBAC
- richer support tooling
- read replicas when justified

### Exit Criteria
- Merchants are actively using analytics/campaign tooling, not just asking for it abstractly
- Attribution and segmentation are backed by real usage data
- Additional Growth OS architecture is justified by operating reality rather than roadmap ambition

---

## What Not To Build Yet

- Email campaigns (no provider, no templates, no compliance infra)
- SMS (TCPA complexity, high cost)
- POS integration (wait for merchant demand signal)
- Web ordering app (mobile is primary; add complexity only when justified)
- Multi-region deployment (single host is fine for <20 merchants)
- Kubernetes (Docker Compose → managed containers first)
- New microservices (extend existing service boundaries)
- A/B testing framework (premature without campaign volume)
- AI recommendations (need 3+ months of real data first)
