# Heroku Backend Deployment

Last reviewed: `2026-09-03`

## Topology

| Environment | Heroku app       | Dyno      | Public API         | Database                     |
| ----------- | ---------------- | --------- | ------------------ | ---------------------------- |
| dev         | `nomly-api-dev`  | Eco web   | `api-dev.nomly.us` | external Supabase dev        |
| production  | `nomly-api-prod` | Basic web | `api.nomly.us`     | external Supabase production |

Heroku does not own Nomly's merchant data. `DATABASE_URL` points to the matching
Supabase shared session pooler on port `5432`. `EXPECTED_SUPABASE_PROJECT_REF`
causes startup and release migrations to fail if an environment points at the
wrong project.

## Runtime

`@lattelink/backend-runtime` starts services in this order:

1. identity;
2. orders;
3. catalog;
4. payments;
5. loyalty;
6. notifications;
7. public gateway;
8. embedded workers.

Only the gateway binds `0.0.0.0:$PORT`. Internal services bind stable loopback
ports. Shutdown stops workers, closes worker resources, then closes Fastify apps
in reverse order.

## One-Time Provisioning

```bash
heroku login
heroku create nomly-api-dev --stack container --region us --no-remote
heroku create nomly-api-prod --stack container --region us --no-remote

gh variable set HEROKU_APP_NAME --env dev --body nomly-api-dev
gh variable set HEROKU_APP_NAME --env production --body nomly-api-prod
```

Create a dedicated Heroku OAuth authorization for GitHub Actions and store it as
the repository secret `HEROKU_API_KEY`. Do not use a password or commit a token.

Each GitHub environment owns its own application variables and secrets. The
deployment workflow sends only the allowlist in
`scripts/heroku-sync-config.mjs` and logs names, never values.

## Database URLs

Use Supabase **Shared Pooler / Session mode**, not the direct database host and
not transaction mode:

```text
postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

The exact host comes from Supabase Dashboard > Connect > Session pooler. Keep a
direct IPv6 URL separately for backup tooling that runs on an IPv6-capable host.

## Deployment

Development is automatic:

1. Push a commit to `develop`.
2. The full `ci` workflow must pass.
3. `deploy-dev` synchronizes config and pushes that SHA to Heroku.
4. Heroku builds the Docker image and runs migrations in the release phase.
5. GitHub runs health, readiness, CORS, auth-forwarding, and checkout E2E checks.

Production is release-only:

1. Validate the exact commit in development.
2. Fast-forward that commit to `main`.
3. Publish an advancing semantic GitHub Release with release notes for the
   current `main` commit.
4. `deploy-prod` validates the release, deploys it, and runs smoke checks.

## Domains And TLS

Add domains after the first successful release:

```bash
heroku domains:add api-dev.nomly.us --app nomly-api-dev
heroku domains:add api.nomly.us --app nomly-api-prod
heroku certs:auto:enable --app nomly-api-dev
heroku certs:auto:enable --app nomly-api-prod
```

For each domain, copy the Heroku DNS target into the DNS provider as a CNAME.
Do not point the API domains at a `herokuapp.com` hostname guessed from the app
name; use the target returned by `heroku domains`.

Verify:

```bash
heroku domains --app nomly-api-dev
heroku certs:auto --app nomly-api-dev
curl --fail https://api-dev.nomly.us/ready
```

Repeat for production.

## Operations

```bash
heroku logs --tail --app nomly-api-dev
heroku ps --app nomly-api-dev
heroku releases --app nomly-api-dev
heroku config --app nomly-api-dev
```

Never paste `heroku config` output into tickets or chat because it contains live
secrets.

## Rollback

Use the GitHub production workflow with a known-good full SHA already present on
`main`:

```bash
gh workflow run deploy-prod.yml -f source_sha=<known-good-main-sha>
```

The rollback rebuilds source and runs forward-only migrations before release.
If a migration is not backward compatible, roll forward with a corrective
release instead of deploying incompatible old code.

## Scaling

The first vertical step is a larger Heroku dyno. Before horizontal scaling,
follow the gates in ADR 0002: managed Redis/Valkey, separate worker dynos,
measured Supabase pool budgets, and idempotent job validation.
