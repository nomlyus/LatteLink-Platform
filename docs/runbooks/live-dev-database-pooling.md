# Live Dev Database Pooling Audit

Observed 2026-09-22 for GitHub issue #231. This is a dev-only audit; no
production database was inspected or changed.

## Verified connection path

- The `nomly-api-dev` Heroku app runs one Eco web dyno containing seven
  internal services, a public gateway, and embedded workers.
- Its configured database URL has a Supabase shared-pooler host, session-mode
  username, and port `5432`. No URL, password, or project reference is recorded
  here. This is **Supavisor session pooling**, not direct Postgres or PgBouncer.
- The seven `/ready` upstream responses all report PostgreSQL and a pool maximum
  of `2`. The enabled payment reconciler creates one additional database pool.
  The notification dispatcher and menu-sync workers do not create their own
  database pools.
- `createPostgresDb` reads `POSTGRES_POOL_MAX` from the process environment.
  The Heroku deployment's `*_POSTGRES_POOL_MAX` values are not passed into the
  seven services or the reconciler. With `POSTGRES_POOL_MAX` absent, the
  library default `2` applies to all eight pools: **16 maximum application
  client connections per web dyno**. The configured dev budget values of `30`
  and `10` headroom are not runtime-enforced or checked by the Heroku workflow.
- The `check-postgres-pool-budget.sh` script covers the separate Compose
  topology. It is not invoked by Heroku deploys. Compose does not include the
  reporting service. Its 13-connection example must not be used as a Heroku
  capacity figure.

## Measurements and limits

A read-only query through the dev session pooler reported PostgreSQL
`max_connections = 60` and `18` current backend connections (`1` active,
`9` idle) at one sample on 2026-09-22. This gives **42 slots below the raw
PostgreSQL ceiling at that instant**, not 42 guaranteed Nomly slots. Supabase
services, migrations, admin sessions, backups, and other clients share the
database limit. The project-specific Supavisor pool-size setting and maximum
client allocation were **not accessible** from the current Heroku/database
credentials; confirm them in Supabase Dashboard > Database > Settings before
declaring the provider-side headroom known.

Session pooling keeps a backend connection assigned for a client session. It
does not turn 16 long-lived application connections into a smaller number of
PostgreSQL connections. A second identical backend process would approximately
double the configured application ceiling to 32; three would make it 48,
before release migrations and other database clients. This is a connection
budget illustration, not a load-test result or a claim that Eco can run three
web dynos.

## Migrations

`heroku.yml` runs `node dist/migrate.js` in Heroku's release phase. That script
checks the expected Supabase target, uses the same session-pooler URL as the
runtime, runs Kysely migrations, and closes its pool. The live dev release
completed and `/ready` succeeds, which verifies the current path is compatible
with the migrations. Several services also call `runMigrations` during startup;
that does not imply separate migration credentials or a direct connection.

## Follow-up and boundaries

- Read the actual Supavisor session pool size and client limit from the dev
  project dashboard, then compare peak database and pooler metrics with this
  app-side ceiling. A single snapshot does not establish peak headroom.
- Correct the Heroku deployment's unused per-service pool variables and add a
  pre-deploy check that models all eight pools before increasing concurrency or
  adding dynos. Treat this as a separate implementation change from this audit.
- Load-test the order and notification paths before raising pool sizes. A
  two-connection service pool may queue requests even when PostgreSQL has free
  slots; database connections are not the only scaling constraint.
- Verify the production connection path and provider limits only at the
  client-#2 release-readiness gate. No production claim in this audit is a
  live observation.
