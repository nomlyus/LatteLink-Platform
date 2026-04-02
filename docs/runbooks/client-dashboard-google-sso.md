# Client Dashboard Google SSO Setup

Last reviewed: `2026-04-01`

## Goal

Enable Google sign-in for client dashboard accounts that already exist in the platform.

## Product Rules

- Google only proves identity.
- Store, role, and capabilities still come from the platform database.
- First-time Google sign-in must map to an existing active dashboard account.
- If no active dashboard account exists for the verified email, access is denied.

Create the owner account first with:

- [client-dashboard-owner-provisioning.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/client-dashboard-owner-provisioning.md)

## Required Google Console Setup

Create a Google OAuth `Web application` and capture:

- client ID
- client secret
- authorized redirect URI for the dashboard callback

Recommended settings:

- app type: `Web application`
- redirect URIs:
  - `https://<client-dashboard-domain>/?google_auth_callback=1`
  - `http://127.0.0.1:4173/?google_auth_callback=1` for local QA when needed
- keep the redirect allowlist tight to the actual dashboard origins you intend to support
- for V1, production plus localhost is usually enough; do not add broad preview-domain callbacks unless you intentionally want Google sign-in on preview deploys

Recommended redirect URI pattern:

- `https://<client-dashboard-domain>/?google_auth_callback=1`

## Required Runtime Environment

Set these on the identity service host or through `deploy-free`:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_STATE_SECRET`
- `GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`

For the free-first GitHub Actions deploy path, the mapping is:

- GitHub secret `FREE_GOOGLE_OAUTH_CLIENT_ID` -> runtime `GOOGLE_OAUTH_CLIENT_ID`
- GitHub secret `FREE_GOOGLE_OAUTH_CLIENT_SECRET` -> runtime `GOOGLE_OAUTH_CLIENT_SECRET`
- GitHub secret `FREE_GOOGLE_OAUTH_STATE_SECRET` -> runtime `GOOGLE_OAUTH_STATE_SECRET`
- GitHub variable `FREE_GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS` -> runtime `GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS`

Example:

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_STATE_SECRET=replace-with-long-random-secret
GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS=https://client.example.com/?google_auth_callback=1,http://127.0.0.1:4173/?google_auth_callback=1
```

Generate `GOOGLE_OAUTH_STATE_SECRET` with a long random value, for example:

```bash
openssl rand -base64 48
```

## Readiness Check

Before telling stores to use Google, verify:

```bash
curl https://api.example.com/v1/operator/auth/providers
```

Expected shape:

```json
{
  "google": {
    "configured": true
  }
}
```

The client dashboard now uses this readiness response to disable the Google button when the backend is not configured yet.

## Rollout Order

1. Ensure the client dashboard domain is live on Vercel.
2. Create the owner account first by email.
3. Create the Google OAuth web app in Google Cloud.
4. Add the production callback URI and optional localhost callback URI.
5. Set the four Google OAuth runtime values in GitHub vars/secrets for `deploy-free`.
6. Redeploy the backend with `deploy-free`.
7. Confirm `/v1/operator/auth/providers` returns `configured: true`.
8. Test Google sign-in with the owner email for an existing store account.
9. Test a Google account with no matching store account and confirm it is denied cleanly.

## Request Flow

1. The browser calls `GET /v1/operator/auth/google/start?redirectUri=...`.
2. Identity signs and returns the Google authorization URL.
3. Google redirects back to the client dashboard with `code` and `state`.
4. The browser calls `POST /v1/operator/auth/google/exchange`.
5. Identity exchanges the code, reads Google user info, and resolves the store account.
6. If the Google user is already linked or matches an existing active account by verified email, a normal dashboard session is issued.

## First-Time Sign-In Policy

V1 policy:

- do not auto-provision dashboard accounts from Google
- owner-created accounts are the source of truth
- verified Google email may link to an existing active account on first sign-in

This keeps store, role, and permission assignment under platform control.

Practical first-time flow:

1. Create the owner account in the platform first.
2. The owner signs in with Google using the same email address.
3. Identity matches the verified Google user to the existing active dashboard user.
4. The session inherits store, role, and capabilities from the platform database.
5. If there is no active dashboard user for that verified email, access is denied.

## Validation Matrix

Successful cases:

- owner email for an existing account signs in with Google and lands in the dashboard
- active staff email for an existing account signs in with Google and receives only staff capabilities
- repeat Google sign-in reuses the linked Google subject and keeps the same dashboard identity

Expected-deny cases:

- unknown Google email -> `OPERATOR_ACCESS_NOT_GRANTED`
- inactive dashboard account -> denied
- redirect URI not on the allowlist -> `INVALID_REDIRECT_URI`
- stale or tampered state -> `INVALID_GOOGLE_STATE`

## V1 Limitations

- Apple SSO is deferred
- Google sign-in depends on verified email matching for first-time link
- multi-store account selection is deferred until multi-location support exists
