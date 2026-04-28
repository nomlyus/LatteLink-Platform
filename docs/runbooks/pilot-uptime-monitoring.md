# Pilot Uptime Monitoring Runbook

Last verified: `2026-04-28`

## Scope

This runbook documents external uptime monitoring for the pilot environments.

Application errors are handled by Sentry. Uptime monitoring is separate: it detects DNS, TLS, Caddy, host, gateway, dependency readiness, and web-surface outages even when the app cannot report to Sentry.

## Provider

Primary external monitor:

- GitHub Actions workflow: `.github/workflows/uptime-monitor.yml`
- Schedule: every 5 minutes
- Runner location: GitHub-hosted runner, outside the DigitalOcean droplets
- Alert record: GitHub issues labeled `uptime` and `status:degraded`
- Optional immediate channel: `UPTIME_WEBHOOK_URL` repository secret

This is sufficient for pilot operations. If volume or SLA expectations increase, move the same target list to Better Stack, Checkly, UptimeRobot, or DigitalOcean Uptime and keep this workflow as a backup.

## Monitored Targets

Default targets checked by `scripts/uptime-check.mjs`:

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

If a URL changes, either update `scripts/uptime-check.mjs` or define repository variable `UPTIME_TARGETS_JSON`.

Example override:

```json
[
  { "key": "prod-api-health", "name": "Production API /health", "url": "https://api.nomly.us/health", "critical": true },
  { "key": "prod-api-ready", "name": "Production API /ready", "url": "https://api.nomly.us/ready", "critical": true }
]
```

## Alert Routing

Current alert path:

1. A failing target creates or updates a GitHub issue with labels `uptime`, `status:degraded`, `p1`, `gate:1`, and `area:infra`.
2. GitHub sends notifications to repository watchers and subscribed operators.
3. The workflow run fails while any target is down.
4. A recovered target receives a recovery comment and the issue is closed.

Optional webhook:

- Add repository secret `UPTIME_WEBHOOK_URL`.
- The workflow posts JSON with `failures` and `recoveries`.
- Use this for Slack, Discord, Better Stack incoming webhook, or another alert relay.

Minimum pilot recipient:

- At least one operator must watch the repository and receive GitHub issue emails.
- For production launch, configure `UPTIME_WEBHOOK_URL` or a dedicated external provider if email is not immediate enough.

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

## DigitalOcean Host Alerts

Enable these on both droplets in DigitalOcean Monitoring:

- CPU sustained high usage.
- RAM high usage.
- Disk usage above 80%.
- Droplet down or unreachable, if available.

Recommended pilot thresholds:

- CPU > 80% for 10 minutes.
- RAM > 85% for 10 minutes.
- Disk > 80%.

These are backup signals. They do not replace external HTTP checks.

## Supabase Alerts

For both Supabase projects:

- Confirm project health is visible in the Supabase dashboard.
- Enable any available email alerts for database/project issues.
- Confirm the production project and dev project are separate.
- Confirm production `DATABASE_URL` points only to production Supabase.
- Confirm dev `DATABASE_URL` points only to dev Supabase.

If Supabase alerts are not available on the active plan, rely on `/ready` failures plus Sentry database errors until plan changes justify built-in database alerting.

## Incident Handling

When a production uptime issue opens:

1. Assign an incident owner.
2. Check whether `/health` or `/ready` failed.
3. Follow [pilot-incident-response.md](./pilot-incident-response.md).
4. Comment on the GitHub uptime issue with actions taken.
5. Keep the issue open until recovery is confirmed.

When a dev uptime issue opens:

1. Check whether maintenance or deploy is in progress.
2. If planned, comment with the maintenance reason.
3. If unplanned, treat it as a release blocker before promotion to production.

