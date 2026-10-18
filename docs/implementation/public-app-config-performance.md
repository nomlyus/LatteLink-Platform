# Public app configuration latency

## Target and measurement boundary

Target: 200 ms end-to-end for `/v1/app-config`, including current public-location
validation. A local query benchmark is not proof of deployed HTTP latency, and a
mobile network cannot have an unconditional maximum latency guarantee.

Before this change, three successful development HTTP requests measured
1,306–1,479 ms to first byte. Connection/TLS establishment accounted for
91–140 ms of those totals. These measurements include network transit and gateway
overhead; they do not separately attribute all remaining time to PostgreSQL.

## Read-path change

The PostgreSQL repository now reads canonical merchant/location membership,
onboarding progress, store configuration, app configuration, payment readiness,
app identity, release state, and visible-menu existence in one SQL statement.
The existing checklist/status builders and customer-launchability predicate still
make the decision. A relational `EXISTS` replaces full menu/modifier reconstruction
for the checklist's visible-item test; category visibility and the explicit
`menuReady` override retain their existing semantics.

The public app-config handler returns configuration from that same snapshot rather
than checking access and then rereading configuration. No access decision is cached.
The internal access preflight and bootstrap's per-location readiness checks also
use the snapshot path. Memory-backed fixtures retain their existing implementation.
There are no public-contract, database-schema, or index changes.

## Verified measurements

The new SELECT was exercised against the explicitly verified **development**
database in a read-only transaction, without constructing the repository (whose
startup runs migrations):

- 12 reads: first query 101 ms; subsequent median 85 ms, maximum 88 ms.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`: planning 2.060 ms; execution 0.413 ms.

Those are workstation-to-development-database measurements, not deployed HTTP
results. No deployed service, database configuration, or production data changed.

## Regression coverage and remaining acceptance

`services/catalog/test/public-location-snapshot.postgres.test.ts` checks the
single-query read, existing-readiness parity, authoritative configuration/payment
projection, public HTTP schema, cross-brand isolation, missing identifiers,
immediate progress revocation, menu visibility, identity/payment/release/live-state
and fulfillment gates. It also samples 20 successful local Fastify handler calls;
these are not mobile/network timings.

After an explicitly authorized development deployment, measure repeated cold and
warm **HTTP** requests through Gateway. Report sample size, p50, p95, maximum,
connection/TLS time, and concurrent-startup behavior. The 200 ms deployed target is
not accepted until those measurements demonstrate it. Investigate regional transit,
pool wait, and gateway overhead if the optimized SQL is fast but HTTP remains slow;
do not weaken launchability checks or hide failures to meet a timing target.
