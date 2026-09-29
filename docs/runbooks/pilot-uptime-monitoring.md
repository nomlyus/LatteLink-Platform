# Pilot Uptime Monitoring Runbook

Last verified: `2026-09-23` (#417; live-dev scope)

## Scope

This runbook documents external uptime monitoring and current signal coverage.

External checks detect DNS, TLS, Heroku, gateway, dependency-readiness, and web-surface outages. Application events are sent to Sentry when `SENTRY_DSN` is configured. The live development API runs on a sleeping Heroku Eco dyno, so its health checks need a bounded cold-wake allowance.

## Provider

Primary external monitor (current live state):

- Provider: Sentry Uptime Monitoring
- Check interval: 60 seconds
- Failure threshold: 3 consecutive failed checks
- Recovery threshold: 1 successful check
- Intended timeout: 45 seconds for dev API checks; 10 seconds for always-on targets
- Alert routing: Sentry high-priority email workflows for the owning project
- Current dev API state: monitors `7151837` (`/ready`) and `7151838` (`/health`) are **disabled**. They remain disabled because Sentry rejected updates with `You don't have enough pay-as-you-go available to create a new seat`. Do not describe Sentry as an active dev destination until the account permits these monitors to be enabled.

Backup external monitor:

- GitHub Actions workflow: `.github/workflows/uptime-monitor.yml`
- Schedule: every 5 minutes
- Runner location: GitHub-hosted runner, outside Heroku
- Alert record: GitHub issues labeled `uptime` and `status:degraded`
- Optional immediate channel: `UPTIME_WEBHOOK_URL` repository secret

GitHub Actions is currently the active dev uptime alert path. Its scheduled workflow checks every 5 minutes and opens/updates a GitHub issue on failure; repository watchers receive notifications. `UPTIME_WEBHOOK_URL` is unset in the observed workflow, so no Slack/phone webhook is currently configured. The issue body contains the target, check time, HTTP status, request ID when returned, and a sanitized URL; it must not contain customer data.

## Monitored Targets

Sentry uptime monitors:

| Environment | Monitor ID | Project | Target | URL | Critical |
| --- | --- | --- | --- | --- | --- |
| production | `7151828` | `lattelink-backend` | API readiness | `https://api.nomly.us/ready` | yes |
| production | `7151833` | `lattelink-backend` | API health | `https://api.nomly.us/health` | yes |
| production | `7151834` | `lattelink-operator-web` | operator dashboard | `https://app.nomly.us` | yes |
| production | `7151835` | `lattelink-admin-console` | admin console | `https://admin.nomly.us` | yes |
| production | `7151836` | `lattelink-web` | marketing site | `https://nomly.us` | no |
| dev | `7151837` | `lattelink-backend` | API readiness | `https://api-dev.nomly.us/ready` | no |
| dev | `7151838` | `lattelink-backend` | API health | `https://api-dev.nomly.us/health` | no |
| dev | `7151839` | `lattelink-operator-web` | operator dashboard | `https://app-dev.nomly.us` | no |
| dev | `7151840` | `lattelink-admin-console` | admin console | `https://admin-dev.nomly.us` | no |

The two dev API monitors have a configured timeout of 10 seconds and a
three-failure/one-recovery threshold, but are disabled. Do not rely on them for
live-dev alerts until Sentry plan capacity allows activation with a 45-second
timeout. The existing GH backup runs from the default branch; changes to its
schedule take effect after Release integrates the reviewed workflow change.

Backup targets checked by `scripts/uptime-check.mjs`:

| Environment | Target | URL | Critical |
| --- | --- | --- | --- |
| production | API health | `https://api.nomly.us/health` | yes |
| production | API readiness | `https://api.nomly.us/ready` | yes |
| production | operator dashboard | `https://app.nomly.us` | yes |
| production | admin console | `https://admin.nomly.us` | yes |
| production | marketing site | `https://nomly.us` | no |
| dev | API health | `https://api-dev.nomly.us/health` | no |
| dev | API readiness | `https://api-dev.nomly.us/ready` | no |
| dev | operator dashboard | `https://app-dev.nomly.us` | no |
| dev | admin console | `https://admin-dev.nomly.us` | no |

`https://dev.nomly.us` is intentionally absent from both unauthenticated
monitor lists. The development marketing branch domain is Vercel sign-in
protected; an anonymous request redirects to Vercel SSO (`302`) by policy.
Treat that redirect as an access-control pass, not a marketing-site outage.
Release verifies the actual page and `develop` deployment alias with an
authorized session using
[the marketing deployment smoke check](./lattelink-vercel-deployment.md#dev-smoke-check-authorized-releaseproduct-tester).
The public production marketing site remains monitored at `https://nomly.us`.

If a URL changes, update both the Sentry uptime monitor and the backup GitHub Actions target. For the backup workflow, either update `scripts/uptime-check.mjs` or define repository variable `UPTIME_TARGETS_JSON`.

Example override:

```json
[
  { "key": "prod-api-health", "name": "Production API /health", "url": "https://api.nomly.us/health", "critical": true },
  { "key": "prod-api-ready", "name": "Production API /ready", "url": "https://api.nomly.us/ready", "critical": true }
]
```

## Alert Routing

Sentry alert path (when enabled):

1. Sentry Uptime marks the endpoint as failed after 3 consecutive failures.
2. Sentry creates an outage issue on the project that owns the monitor.
3. The monitor is attached to the high-priority email workflow for that project.
4. The issue resolves after 1 successful recovery check.

GitHub Actions alert path (active dev destination):

1. A failing target creates or updates a GitHub issue with labels `uptime`, `status:degraded`, `p1`, `gate:1`, and `area:infra`.
2. GitHub sends notifications to repository watchers and subscribed operators.
3. The workflow run fails while any target is down.
4. A recovered target receives a recovery comment and the issue is closed.

Optional webhook:

- Add repository secret `UPTIME_WEBHOOK_URL`.
- The workflow posts JSON with `failures` and `recoveries`.
- Use this for Slack, Discord, Better Stack incoming webhook, or another alert relay.

## Gate 1 signal policy (live dev)

| Signal | Threshold | Destination and owner | Runbook / present coverage |
| --- | --- | --- | --- |
| API health and readiness | Three consecutive failed 60-second Sentry checks, one successful check to recover; GH backup every 5 minutes, with a 45-second timeout for `api-dev.nomly.us` to allow Eco wake-up | Sentry high-priority email when enabled; currently GitHub `uptime` issue and repo watchers. Platform owns response; Release owns monitor/deploy configuration. | This runbook and [incident response](./pilot-incident-response.md). Dev Sentry monitors are disabled for account-plan capacity; GH backup is active. |
| Checkout and payment finalization | Any failed stage in the deployed dev checkout synthetic; run on every dev deploy and during the acceptance exercise | Failed `deploy-dev` Actions run; Platform owns triage, Release owns deployment | [Checkout E2E](../../scripts/dev-checkout-e2e.mjs) and [payment recovery](./payment-retry-failure-recovery.md). Current script verifies quote, checkout draft, and PaymentIntent creation; it does **not** confirm a test payment or call finalization. Finalization remains a coverage gap. |
| Paid payment reconciliation | Any stale pending Stripe payment older than the configured 10-minute stale threshold that fails a reconciliation candidate; the worker runs every 5 minutes | Sentry issue for `payment-reconciler` when DSN/routing is configured; Platform owns response | [Incident response](./pilot-incident-response.md#scenario-6-stripe-webhook-or-reconciliation-alert-fires). Candidate failures emit Sentry events with order, payment-intent, and location identifiers, but no current backlog gauge pages on old pending records. |
| Refund reconciliation and allocation uncertainty | Any Stripe-successful refund missing an order-side allocation, any cents mismatch, or any partial refund without item-level allocation | Platform owns payment integrity; route to the linked #411 follow-up and Security & QA for verification | #411 remains open; draft #505 is blocked on partial/multi-refund and webhook convergence. The required schema/metrics are not present on this base. Do not claim automatic alert coverage; keep the case in manual support reconciliation until #411 supplies a durable signal. Record refund/order IDs and amounts only, never customer details. |
| Operator order stream | Three `503 STREAM_CAPACITY_EXCEEDED` responses in 5 minutes, or repeated stream 5xx; also investigate a growing reconnect loop | Heroku application logs and Sentry for captured exceptions; Platform owns backend response, Frontend owns dashboard client behavior | [Incident response](./pilot-incident-response.md#scenario-order-stream-capacity-exceeded). The 503 is not currently a dedicated Sentry alert/metric, so this threshold is a triage rule, not an automated page. |
| Notification outbox and receipts | Any terminal `FAILED` outbox entry, or oldest due `PENDING` entry older than 10 minutes; also flag any receipt failure | Heroku logs; Platform owns worker/outbox response | [Notification runbook](./notifications-order-state.md). Dispatcher logs aggregate `failed`/`retried`; it does not currently emit a Sentry alert or public backlog gauge. No customer payload or push token belongs in an alert. |
| Migration drift | Any pending migration or migration provenance mismatch at dev deploy | `deploy-dev` GitHub Actions failure; Release owns release correction, Platform owns schema/runbook diagnosis | [Heroku release provenance](./heroku-release-provenance.md). The deployment verifier already fails closed unless the current dev release has exact provenance and zero pending migrations. |
| Worker inactivity | No successful cycle evidence for more than two configured intervals after startup: 10 seconds for the 5-second notification dispatcher; 10 minutes for the 5-minute payment reconciler | Heroku logs/Sentry if configured; Platform owns worker recovery, Release owns Heroku runtime | [Heroku release provenance](./heroku-release-provenance.md). Startup logs prove launch only; there is no durable heartbeat metric or automated missed-cycle alert yet. |
| API error rate and latency | Investigate 5xx >=5% over 5 minutes with at least 20 requests, or p95 >2 seconds for 5 minutes | Sentry events/performance and GitHub issue if an incident is confirmed; Platform owns gateway, Release owns routing | `/metrics` currently exposes in-memory cumulative counts, not latency histograms or durable windows. These thresholds are defined for triage but automatic rate/latency alerting is not implemented; instrument before claiming coverage. |
| Synthetic dependency path | Any failure in readiness, app config, menu, quote, checkout, or payment-session setup; target only `api-dev.nomly.us` and dev test data | `deploy-dev` Actions run; Platform owns API test, Release owns deployment | The deployed check runs after each dev deploy. It does not create a production order/payment, but the current script also stops before confirming/finalizing a dev test payment. Extend the synthetic when #411 convergence coverage is ready. |

The targets with gaps above have explicit thresholds and responders for
triage, but are not automated alerts. Do not count them as live alert coverage
until a durable signal and destination are implemented and exercised. Never
send production synthetic orders, payments, or deployments as part of #417.

Minimum pilot recipient:

- At least one operator must receive Sentry high-priority issue emails.
- At least one operator must watch the repository and receive GitHub issue emails.
- For production launch, configure Slack/phone escalation in Sentry or `UPTIME_WEBHOOK_URL` if email is not immediate enough.

## Manual Test

Do not intentionally take down production.

Test non-production alerting with workflow dispatch:

```bash
gh workflow run uptime-monitor.yml \
  --repo nomlyus/LatteLink-Platform \
  --ref develop \
  -f targets_json='[{"key":"dev-test-invalid","name":"Dev test invalid URL","url":"https://invalid-dev-check.nomly.us/health","critical":false}]'
```

Watch it:

```bash
run_id="$(gh run list --repo nomlyus/LatteLink-Platform --workflow uptime-monitor.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --repo nomlyus/LatteLink-Platform --exit-status
```

Expected result:

- workflow fails
- one GitHub issue is created
- configured recipient receives notification

Then dispatch the same key with a healthy URL to test recovery:

```bash
gh workflow run uptime-monitor.yml \
  --repo nomlyus/LatteLink-Platform \
  --ref develop \
  -f targets_json='[{"key":"dev-test-invalid","name":"Dev test invalid URL","url":"https://api-dev.nomly.us/health","critical":false}]'
```

Expected result:

- workflow passes
- the previous uptime issue receives a recovery comment and closes

## Pausing Dev Alerts

Preferred:

1. Use workflow dispatch with a reduced `targets_json` during planned maintenance.
2. Leave production targets active.

If dev maintenance will be noisy:

- Temporarily remove dev targets from `UPTIME_TARGETS_JSON`.
- Restore them immediately after maintenance.
- Do not remove production targets during business hours.

Production alerts should not be muted unless there is an active incident owner.

## `/health` vs `/ready`

`/health` means the process is alive.

`/ready` means the process and dependencies are ready for traffic.

If `/health` fails:

- suspect DNS, TLS, Caddy, host, container, or gateway process outage.
- check DigitalOcean droplet status and compose services first.

If `/health` passes but `/ready` fails:

- suspect dependency readiness.
- check Supabase, Redis/Valkey, downstream service URLs, Stripe/Clover config, and service logs.
- do not launch or resume ordering until `/ready` is green.

Response path: [pilot-incident-response.md](./pilot-incident-response.md).

## Dev Host and Dependency Signals

The live dev API is hosted by Heroku and uses an external Supabase database.
There are no DigitalOcean droplets in the current live-dev topology. Use the
Heroku app logs and the dev Supabase project dashboard for host/dependency
triage. Recommended thresholds:

- dyno restart/crash: any unexpected restart; inspect Heroku app logs and current release.
- database readiness: any `/ready` failure; confirm dev Supabase status and pool saturation.
- pool contention: sustained `waiting > 0` or max acquire wait above 1 second for 5 minutes; inspect readiness responses and [live-dev pool runbook](./live-dev-database-pooling.md).

## Supabase Alerts

For the dev Supabase project:

- Confirm project health is visible in the Supabase dashboard.
- Enable available email alerts for database/project issues.
- Verify Heroku dev uses only the dev database URL.

If Supabase alerts are unavailable on the active plan, rely on `/ready`, Heroku
logs, and pool signals; do not infer that `/ready` detects all query-level
latency or data-integrity problems.

## Incident Handling

When an uptime issue opens:

1. Assign an incident owner.
2. Check whether `/health` or `/ready` failed.
3. Follow [pilot-incident-response.md](./pilot-incident-response.md).
4. Comment on the GitHub uptime issue with actions taken.
5. Keep the issue open until recovery is confirmed.

For a dev uptime issue:

1. Check whether maintenance or deploy is in progress.
2. If planned, comment with the maintenance reason.
3. If unplanned, treat it as a release blocker before promotion to production.

### Live-dev alert and recovery exercise

Run this on the reviewed branch before integration. It intentionally creates a
single GitHub alert issue using the reserved `.invalid` domain, then resolves
that same issue against the live dev API. It sends no order or payment and does
not touch production.

```bash
gh workflow run uptime-monitor.yml --repo nomlyus/LatteLink-Platform --ref codex/g1-417 \
  -f targets_json='[{"key":"g1-417-alert-test","name":"G1-417 dev alert exercise","url":"https://g1-417.invalid/health","critical":false}]'
```

Wait for the run to complete; confirm it fails on the synthetic target and
opens one issue labeled `uptime` and `status:degraded`. Then dispatch the same
key with the healthy dev target:

```bash
gh workflow run uptime-monitor.yml --repo nomlyus/LatteLink-Platform --ref codex/g1-417 \
  -f targets_json='[{"key":"g1-417-alert-test","name":"G1-417 dev alert exercise","url":"https://api-dev.nomly.us/health","critical":false}]'
```

Confirm the second run succeeds, comments recovery on the same issue, and
closes it. Record both run URLs and the alert issue number on #417. The scheduled
workflow uses the repository default branch, so its changed timeout becomes
active only after normal integration; manual dispatch may use the reviewed
branch for this test.
