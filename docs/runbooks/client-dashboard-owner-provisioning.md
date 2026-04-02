# Client Dashboard Owner Provisioning

Last updated: `2026-04-01`

## Goal

Create the first owner account for a client store without manual database edits.

For V1, one client store maps to one `locationId`. The platform team creates the first owner account, then that owner can create staff from inside the client dashboard.

## Default V1 Pattern

Use a temporary password as the default first-time access path:

1. create the owner account against the identity backend
2. send the dashboard URL, email, and temporary password over a secure channel
3. the owner signs in with email and password
4. after first access, the owner rotates their own password from the `Team` tab

Optional Google-first flow:

- create the owner account with the same email they will use for Google
- do not auto-create access from Google
- once Google SSO is configured, that email can link on first sign-in

## Prerequisites

- a real `DATABASE_URL` for the target environment
- a `locationId` for the client store
- the client dashboard URL
- `pnpm install`

## Provision Command

From the repo root:

```bash
pnpm provision:client-owner -- \
  --display-name "Avery Quinn" \
  --email "avery@store.com" \
  --location-id "flagship-01" \
  --dashboard-url "https://client.example.com"
```

Optional:

- pass `--password "ChosenTempPassword123!"` to set the temporary password yourself
- omit `--password` to have the script generate a strong temporary password
- pass `--allow-in-memory` only for local testing; do not use it for shared or production provisioning

The command will print:

- whether the owner was `created` or `updated`
- the resolved store `locationId`
- the temporary password
- the first-time access handoff steps

## What The Script Does

The script:

- provisions or updates the operator user as role `owner`
- ensures the user is active
- binds the owner to the provided `locationId`
- sets or rotates the password
- keeps the access model store-scoped for V1

## First-Time Owner Handoff

Send the owner:

- dashboard URL
- email
- temporary password

Ask them to:

1. sign in to the client dashboard
2. verify the store name and settings are correct
3. go to `Team`
4. update their own password
5. add staff accounts if needed

## Recovery / Re-Provisioning

If the owner loses access before Google SSO is enabled:

- re-run the same command with the same email and `locationId`
- provide a new temporary password with `--password`
- the script will update the existing owner access instead of creating a duplicate user

## V1 Limits

- no public self-sign-up
- no invite acceptance flow yet
- no multi-location organization switcher yet
- Google SSO still requires a matching account that already exists

See also:

- [client-dashboard-google-sso.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-google-sso.md)
- [client-dashboard-pilot-qa.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-pilot-qa.md)
