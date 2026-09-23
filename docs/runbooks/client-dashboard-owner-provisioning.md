# Client Dashboard Owner Provisioning

Last updated: `2026-05-07`

## Goal

Create the first owner account for a client store without manual database edits and without sharing temporary passwords.

For Gate 1, Nomly creates the client shell in the admin console. The backend generates the tenant, brand, and location identifiers. The owner receives a one-time invite, sets their own password, and completes setup from the client dashboard.

## Default Gate 1 Pattern

Use owner invites as the default first-time access path:

1. Internal admin creates a client shell from the admin console.
2. The system generates `tenantId`, `brandId`, and `locationId`.
3. Internal admin sends an owner invite for the generated `locationId`.
4. Owner opens the emailed `/invites/` link; the token is carried in the URL fragment and submitted to lookup/accept APIs in request bodies.
5. Owner sets their password.
6. Owner signs into the client dashboard and completes the Setup wizard.

Do not ask the client to provide a `locationId`. Only user-facing names, market labels, and owner contact details should be entered by humans.

## Prerequisites

- A real `DATABASE_URL` for the target environment.
- Admin console access with `clients:write`.
- Client dashboard URL for the target environment.
- Email delivery configured for shared or production environments.

## Preferred Admin Console Flow

1. Open admin console.
2. Go to `Clients`.
3. Select `New Client`.
4. Enter:
   - client name
   - location name
   - market label
   - owner email
   - optional owner display name
   - optional initial store defaults
5. Create the client.
6. Open the client detail page.
7. Confirm generated `locationId` starts with `loc_`.
8. Send the owner invite from the Owner panel.

## API Fallback

Create the client shell:

```bash
curl -X POST "$API_BASE_URL/v1/internal/clients" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Northside Coffee",
    "locationName": "Northside Flagship",
    "marketLabel": "Detroit, MI",
    "ownerEmail": "owner@northside.example",
    "ownerName": "Avery Owner"
  }'
```

Then send or resend the owner invite:

```bash
curl -X POST "$API_BASE_URL/v1/internal/locations/$LOCATION_ID/owner/invite/resend" \
  -H "Authorization: Bearer $INTERNAL_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Avery Owner",
    "email": "owner@northside.example"
  }'
```

The gateway exposes `/owner/invite/resend` for both the initial admin-console send and replacement invites. Sending a replacement invite revokes prior pending invites for the same owner and location.

## What The Backend Does

The client creation flow:

- creates a catalog client shell
- generates tenant, brand, and location identifiers
- bootstraps store/app/menu defaults for the generated location
- creates onboarding and mobile release tracking rows
- does not activate an owner automatically

The owner invite flow:

- creates or updates the operator user as role `owner`
- keeps the owner inactive until invite acceptance
- stores only a hash of the one-time invite token (currently valid for seven days)
- sends the invite email when email delivery is configured
- places the token in the URL fragment so browsers and hosting access logs do not receive it
- submits the token only in lookup/accept request bodies; API URLs stay token-free and telemetry redacts sensitive fields and invite URLs as defense in depth
- activates the owner and stores the chosen password only after acceptance

## First-Time Owner Handoff

Send the owner only:

- client dashboard URL
- the invite email
- support contact if they cannot find the email

Do not send a temporary password. The owner sets their password through the invite acceptance page.

Ask the owner to:

1. open the invite
2. set their password
3. sign into the client dashboard
4. complete Setup
5. connect Stripe from Setup if they are the business owner
6. optionally connect Clover if they want POS read/write support
7. submit for Nomly review

## Recovery / Re-Provisioning

If the owner loses the invite before accepting:

- resend the invite from admin console, or call `/owner/invite/resend`
- confirm the prior invite no longer works
- confirm the newest invite can be looked up

If the owner has accepted but forgot their password:

- use the password reset flow when available
- until then, re-invite or re-provision only through approved support handling

## Gate 1 Limits

- AI-assisted Nomly menu seeding is deferred to Gate 2.
- Clover is optional and never blocks launch.
- Toast and Square are future optional connectors after infrastructure exists.
- Launch approval remains manual because builds and App Store data are still manually configured.
- Mobile release status must be maintained by Nomly so the client dashboard can show progress.

See also:

- [merchant-onboarding-pilot.md](./merchant-onboarding-pilot.md)
- [client-dashboard-google-sso.md](./client-dashboard-google-sso.md)
- [client-dashboard-pilot-qa.md](./client-dashboard-pilot-qa.md)
