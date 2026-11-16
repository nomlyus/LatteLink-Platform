# Add client feature configuration and menu-source routing for static vs Clover-backed menus

## Problem

The platform currently assumes too much global behavior for client-facing features and menu sourcing.

That becomes a problem as soon as different clients need different behavior, for example:

- one client should use the current static menu source
- another client should load menu data from Clover
- some clients may need loyalty enabled while others do not
- some clients may have different payment, notifications, or order-tracking capabilities

Right now there is no clear, authoritative client configuration layer that answers:

- which features are enabled for a given client
- which menu source is authoritative for that client
- how services and mobile should branch safely based on that configuration

Without this, client customization risks being scattered across hardcoded environment checks, ad hoc flags, or duplicated logic in multiple services.

## Goal

Introduce a formal client configuration mechanism that:

1. defines feature customizations per client
2. explicitly selects the authoritative menu source per client
3. provides a safe flow for switching between:
   - static/internal menu data
   - Clover-backed menu data
4. gives backend and mobile one consistent way to resolve client behavior

## Why this is needed

This is foundational multi-client / tenant hygiene.

We need one place to describe client-specific behavior so that:

- menu resolution is deterministic
- feature flags are not spread across the codebase
- onboarding a new client becomes configuration work instead of repeated code branching
- production behavior can be audited and reasoned about
- backend and mobile do not drift on what is enabled for a given client

## Proposed target design

Add an authoritative client configuration file (or small config module backed by structured files) that is loaded by backend services and exposed where needed to mobile.

The config should describe, per client:

- client id / slug
- display name
- environment identifiers if needed
- menu source
- enabled feature flags
- integration settings references
- operational defaults

### Recommended initial shape

Use a versioned structured config file, for example:

- `config/clients/<client-id>.json`
- or `packages/config/src/clients/<client-id>.ts`
- or a single `config/clients.json` if the set stays small initially

Preferred structure:

```json
{
  "clientId": "gazelle-default",
  "displayName": "Gazelle Coffee",
  "menu": {
    "source": "static"
  },
  "features": {
    "loyalty": true,
    "pushNotifications": true,
    "refunds": true,
    "mobileOrderTracking": true
  },
  "integrations": {
    "clover": {
      "enabled": false,
      "merchantRef": null
    }
  }
}
```

For a Clover-backed client:

```json
{
  "clientId": "client-with-clover",
  "displayName": "Client With Clover",
  "menu": {
    "source": "clover"
  },
  "features": {
    "loyalty": false,
    "pushNotifications": true,
    "refunds": true,
    "mobileOrderTracking": true
  },
  "integrations": {
    "clover": {
      "enabled": true,
      "merchantRef": "..."
    }
  }
}
```

## Required menu-source flow

We need one clear flow that determines menu behavior based on client config.

### Resolution flow

1. resolve the active client for the request / environment / app build
2. load that client’s configuration
3. inspect `menu.source`
4. route menu reads to the correct provider:
   - `static`
   - `clover`
5. normalize the resulting menu into the existing contract/mobile shape
6. return that normalized menu to consumers

### Menu-source rules

- `static` means the platform’s internal/static menu source is authoritative
- `clover` means Clover is authoritative for catalog/menu reads
- unsupported or unknown menu sources must fail clearly
- missing config must fail clearly in non-dev environments
- fallback behavior, if any, must be explicit and not silent

### Important constraint

The switching logic should happen in one backend resolution layer, not be duplicated across:

- gateway routes
- mobile screens
- individual SDK consumers

The mobile app should not decide whether to use static vs Clover menu data by itself. It should receive one resolved menu contract from the backend.

## Config responsibilities

The client config layer should be the place to answer:

- which menu source is active
- whether Clover integration is enabled
- whether loyalty is enabled
- whether push notifications are enabled
- whether refunds/order tracking features should surface
- any client-specific UX capability flags that must be shared with mobile

It should not become an untyped dumping ground for arbitrary unrelated settings.

## Service changes

At minimum:

### Backend

- add a typed client-config loader
- add validation for config shape at startup or load time
- add a client-resolution helper
- add a menu-provider abstraction:
  - static provider
  - Clover provider
- add one normalization layer that maps either provider into the existing mobile menu contract
- ensure gateway/menu endpoints use the resolved provider instead of hardcoded static assumptions

### Mobile

- avoid local branching on static vs Clover menu source
- continue consuming the same menu contract if possible
- optionally consume exposed capability flags for client-specific UI if needed later

## Client resolution questions to answer

This issue should settle how the active client is identified. Possible options:

- environment variable per deployment
- request host / domain mapping
- authenticated tenant/client id
- store id mapping
- app build flavor / bundle targeting

The implementation should pick one primary mechanism and document it clearly.

## Validation and safety requirements

- invalid config must fail loudly
- unknown feature flags should be rejected
- unknown menu source values should be rejected
- Clover menu source must not be selectable unless required Clover integration config exists
- config resolution must be testable in isolation
- config should be easy to diff, review, and audit in git

## Testing requirements

Add coverage for:

- loading a valid static-menu client config
- loading a valid Clover-menu client config
- rejecting invalid config shape
- rejecting unknown menu source values
- resolving menu provider correctly for each client type
- ensuring normalized menu output stays contract-compatible regardless of source
- verifying a Clover-configured client does not accidentally hit the static provider
- verifying a static-configured client does not accidentally hit the Clover provider
- startup/load behavior when required config is missing

## Acceptance criteria

- there is a typed, documented client configuration mechanism in the repo
- the active client can be resolved deterministically
- menu source is selected from config, not hardcoded business logic
- backend menu reads route through a single provider-selection layer
- both static and Clover-backed menu sources can produce the expected normalized contract
- invalid client configuration fails clearly and safely
- feature customizations are centrally defined instead of scattered in code
- the design is documented well enough that onboarding a new client is primarily a configuration exercise

## Follow-up expectations

This issue should enable later work such as:

- client-specific feature rollout
- multi-tenant operational configuration
- client capability exposure to mobile
- per-client payment/refund/loyalty toggles
- admin tooling for managing client configuration

If the initial implementation uses repo-stored config files, a later follow-up can evaluate whether client configuration should eventually move to a managed admin/config service.
