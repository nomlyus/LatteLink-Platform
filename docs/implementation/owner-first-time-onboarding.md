# One-time owner brand onboarding

## Ownership and lifecycle

- The shared dashboard provider gates every dashboard route for unfinished
  owners, before mounting the route's content. Managers/store users retain their
  existing access semantics. This is a dashboard UX gate, not a new API
  authorization policy.
- Nomly provisions the brand/location identities and allocated locations, not
  owner-confirmed business information. Placeholder values never count as input.
- The owner enters their personal name, brand name, and customer-facing name once.
  An omitted customer-facing name explicitly defaults to the entered brand name.
- Each allocated location then requires its own name, address, IANA timezone,
  operating-hours text, and tax percentage. The existing hours-text contract is
  retained; this is not a new scheduling engine. Continue validates, saves, and
  advances, with no separate edit/save CTA. Percentages convert exactly to integer
  basis points (6.25% = 625); a tax of 0% must still be explicitly entered.
- The modal saves owner-confirmed location details using scoped APIs, connects
  Stripe, and records team configuration/deferral. Final submission uses
  `PATCH /admin/onboarding` with `{ "submitOwnerSetup": true, "locationIds": [...] }`.
- Completion belongs to the merchant/brand (`catalog_clients`), not a browser,
  operator, or location. All locations project the same completion timestamp.
- There is no finish-later, close, backdrop, or Escape dismissal. Leaving the
  browser does not lose saved progress, but returning requires completing setup
  before entering the dashboard. Direct dashboard links are gated too.
  Completion is confirmed by the backend, not a local-storage flag. Errors or
  unresolved setup/location state do not unlock the dashboard.
- Settings edits configuration directly. It never hosts or reopens the modal.
- App Store metadata, payment readiness, menu/team preparation, release jobs,
  and launch approval remain independent. Their failure cannot reset completion.
- Existing `/onboarding` links are compatibility redirects; Stripe and Google
  callbacks retain their existing auth/provider behavior.

## Backend invariants

`0060_owner_setup_completion` adds nullable `owner_setup_completed_at` to
`catalog_clients`. Existing merchants with completed profile/operations flags,
or reviewed/approved/live status, are grandfathered as configured. Their marker
uses the existing client update timestamp; it is not an exact historical audit
event. Draft/unfinished merchants remain eligible.

`0061_owner_entered_onboarding` adds nullable `catalog_clients.owner_profile_json`
and `catalog_client_locations.owner_address_text/owner_details_confirmed_at`.
No defaults are backfilled as confirmations. Existing completed brands retain
their 0060 marker and do not re-onboard.

Identity remains the authoritative operator-name store. Its self-profile endpoint
accepts only a name (no role/email/access changes). The dashboard writes Identity
first and Catalog's confirmed onboarding profile last; an interrupted sequence
is retryable and cannot mark the brand profile complete prematurely. There is no
cross-service transaction. Catalog's profile is the submitted business/contact
record, not a replacement authentication identity.

Catalog updates the internal business name once and projects the customer-facing
name across location store/app configuration and mobile brand bootstrap. Location
input updates store hours/tax, app location labels, canonical location names,
address, timezone, and the confirmation timestamp in one transaction. The new
owner-input operations are owner-only at Gateway; internal Catalog operations
retain the authenticated Gateway boundary. These fields remain editable through
owner-only Settings; native bundle/SKU, assets, and App Store metadata remain
Nomly-managed.

Current owner submission requires the full provisioned-location set, a confirmed
owner profile and confirmation on every location, valid
location details, payment readiness, and each location's team step configured or
explicitly deferred. Branding, native app identity, and menu preparation are not
owner-onboarding prerequisites. PostgreSQL validates persisted state and records
submission/completion atomically. The older `completeOwnerSetup` operation remains
an explicit compatibility path with its earlier profile/app-name requirements
plus owner-entered details, so placeholders cannot bypass the input requirement;
the current UI does not use it.
There is no public reset/completion-false input. Existing owner capability and
authorized-location checks remain authoritative at the Gateway.

## Rollout and rollback

Deploy migrations 0060/0061 and the Identity/Gateway/Catalog changes before using
the new owner-input forms. An older backend will reject these mutations, not
silently claim they were saved. Deploy the completion backend before relying on permanent completion
in the frontend. The public operator summary adds optional
`ownerSetupRequired` and `ownerSetupCompletedAt` for rolling compatibility.
Against an older backend, configured merchants are not forced into setup, and
the frontend refuses to claim completion unless the server returns the marker.

Application rollback should retain the additive database column. The explicit
schema-down migration removes completion history and must not be used as a
routine application rollback. No production migration is performed by this
implementation task.

## Verification

Characterization covers new/existing owner entry, non-owner access, interrupted
resume, permanent completion despite later release/configuration changes,
read-only/pending forms, missing configuration, and Settings without modals.
Catalog HTTP coverage verifies actionable incomplete-setup errors; Gateway
coverage verifies forwarding and role/location enforcement.

Real PostgreSQL cases share the existing isolated Catalog fixture lifecycle
in `catalog-relational.postgres.test.ts`. They verify full migration/rerun,
invalid completion rollback, concurrent idempotency, brand-wide projection,
legacy backfill, unfinished brands, and deliberate transactional failure.
Browser first-time form transitions were checked with a disposable local UI
fixture, removed afterward; existing-owner navigation was checked against the
dev API without changing configuration or creating real accounts.
