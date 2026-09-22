# Live Dev Database Pooling Audit

Updated 2026-09-22 for GitHub issues #231 and #497. This is a dev-only audit; no
production database was inspected or changed.

## Verified connection path

- The `nomly-api-dev` Heroku app runs one Eco web dyno containing seven
  internal services, a public gateway, and embedded workers.
- Its configured database URL has a Supabase shared-pooler host, session-mode
  username, and port `5432`. No URL, password, or project reference is recorded
  here. This is **Supavisor session pooling**, not direct Postgres or PgBouncer.
- Before the change, the seven `/ready` upstream responses all reported PostgreSQL
  and a pool maximum of `2`. The enabled payment reconciler created one additional database pool.
  The notification dispatcher and menu-sync workers do not create their own
  database pools.
- Before the change, `createPostgresDb` read `POSTGRES_POOL_MAX` from the process
  environment. The Heroku deployment's `*_POSTGRES_POOL_MAX` values were not
  passed into the seven services or the reconciler. With `POSTGRES_POOL_MAX`
  absent, the library default `2` applied to all eight pools: **16 maximum
  application client connections per web dyno**. The old budget values were
  not runtime-enforced or checked by the Heroku workflow.
- The `check-postgres-pool-budget.sh` script covers the separate Compose
  topology. It is not invoked by Heroku deploys. Compose does not include the
  reporting service. Its 13-connection example must not be used as a Heroku
  capacity figure.

## Final dev architecture

The dev-only `POSTGRES_SHARED_POOL_ENABLED=true` path reuses one `pg.Pool` for
each group, keyed by database URL and group within the backend process. Every
service retains its own Kysely instance and repository lifecycle; reference
counting closes the underlying pool only after the last user closes. Production
does not enter this path, even if the flag were accidentally set, because it
also requires `DEPLOY_ENV=dev`. All groups still use the same Supabase session
pooler URL and credentials.

| Group | Users | Configured max |
| --- | --- | ---: |
| General | identity, catalog, loyalty, notifications, reporting | 4 |
| Critical | orders, payments | 4 |
| Reconciler | enabled payment reconciliation worker | 1 |
| **One dev web process** | | **9** |

This is a **maximum**, not nine permanent connections. If reconciliation is
disabled, the ceiling is eight. A release-phase migration runs in a separate
process with its own short-lived pool (default max two), so deployment can
briefly consume extra connections. Each service's `/ready` now exposes a
non-secret pool group, max, open/idle/waiting counts, and cumulative contention
metrics. Orders and payments are isolated from reporting, authentication, and
notifications; the reconciler cannot monopolize the order pool. No runtime
query was found to require service-specific session state. Kysely owns each
transaction's acquired connection and releases it after completion.

The dev configuration sync validates `general + critical + enabled reconciler
+ reserved <= planning budget` before changing Heroku config. Current values
are `4 + 4 + 1 + 10 <= 30`. The `30` is an application planning limit, **not**
a verified provider allocation. The sync also removes the seven ignored
per-service variables from the dev Heroku app. GitHub `workflow_run` executes
the workflow definition from `main` even when it checks out a `develop`
commit, so this validation lives in the checked-out sync script as well as in
the updated workflow; this was verified in the dev deployment.

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
does not multiplex idle application clients into fewer backend connections.
The new per-process ceiling is nine; two identical processes would be 18, but
Eco and the present in-process worker/event setup are not ready for horizontal
scaling. This is a connection-budget illustration, not a recommendation to add
dynos before the other architecture gates.

## Migrations

`heroku.yml` runs `node dist/migrate.js` in Heroku's release phase. That script
checks the expected Supabase target, uses the same session-pooler URL as the
runtime, runs Kysely migrations, and closes its pool. The live dev release
completed and `/ready` succeeds, which verifies the current path is compatible
with the migrations. Several services also call `runMigrations` during startup;
that does not imply separate migration credentials or a direct connection.

## Live dev order-path load test

The bounded probe in `scripts/dev-order-path-load.mjs` used the deployed dev
API on 2026-09-22. Each virtual buyer used dev access, then quote, checkout
draft, and Stripe **test-mode** mobile payment initialization. It did not
confirm a card payment or create a paid order. All calls used the same dev
location/menu item and the same client network; results are a small burst
sample, not sustained multi-merchant capacity certification.

| Concurrent buyers | Successful paths | Stage wall time | Worst auth | Worst quote | Worst checkout | Worst payment init |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2/2 | 2.76 s | 730 ms | 613 ms | 603 ms | 839 ms |
| 4 | 4/4 | 2.93 s | 713 ms | 808 ms | 721 ms | 819 ms |
| 8 | 8/8 | 3.66 s | 1,213 ms | 741 ms | 953 ms | 925 ms |
| 12, after earlier stages in the same minute | 10/12 | 4.30 s | 1,624 ms | 809 ms | 1,193 ms | 1,014 ms |
| 12, fresh rate-limit window | 12/12 | 5.13 s | 1,794 ms | 1,131 ms | 1,440 ms | 1,054 ms |

At 12, two dev sign-ins returned HTTP 429 after the preceding stages had
already used the 24-per-minute gateway authentication-write budget. This is
an intentional rate limiter, not a database error. Pool acquisition queues
were recorded at all tested stages, including two concurrent buyers; the
readiness probes and background worker may also contribute. At eight buyers, the general
pool's peak waiting count reached 10 and the critical pool's reached 4; at
12, those cumulative peaks reached 12 and 6. In the separate fresh 12-buyer
run, peaks reached 15 and 8, respectively. The highest observed acquisition
wait was 520 ms (general) and 272 ms (critical) across these runs, with no
5-second pool timeout.
The configured four-connection pool limits are therefore a **latency/queuing
constraint**, while the first hard failure in this probe was the auth rate
limit. Stripe API latency and one Eco dyno also contribute to end-to-end time;
this probe cannot uniquely apportion CPU/network/provider time.

For merchant #2, this setup is **provisionally sufficient for the tested
12-buyer burst**, without a connection-limit error. This is not a final
capacity approval: merchant #2's peak order rate, a sustained test, paid-order
webhook/settlement concurrency, and the actual Supavisor allocation are still
unknown. Do not raise pool sizes or add dynos on this evidence alone.

## Follow-up and boundaries

- Read the actual Supavisor session pool size and client limit from the dev
  project dashboard, then compare peak database and pooler metrics with this
  app-side ceiling. A single snapshot does not establish peak headroom.
- Repeat a sustained order-path test and include card confirmation, webhook
  settlement, reporting and notification traffic before setting a client-#2
  peak-throughput target. Do not bypass rate limits merely to pass a test.
- Verify the production connection path and provider limits only at the
  client-#2 release-readiness gate. No production claim in this audit is a
  live observation.
