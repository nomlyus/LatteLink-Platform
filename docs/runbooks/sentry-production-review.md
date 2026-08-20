# Sentry Production Review

This runbook provides the repeatable incident-review path for Nomly backend, web, admin, and mobile projects.

## Required access

Set a Sentry auth token with project issue-read access. Do not commit it or paste it into issue comments.

```bash
export SENTRY_AUTH_TOKEN='...'
export SENTRY_ORG='nomly'
export SENTRY_PROJECTS='lattelink-gateway,lattelink-mobile,lattelink-operator-web,lattelink-admin-console,lattelink-web'
```

## Review unresolved issues

```bash
pnpm sentry:review
```

Use JSON output for automation:

```bash
pnpm sentry:review -- --json --limit 50
```

The default query is `is:unresolved`. A project-specific review can be run with `--project` and a time-bounded query such as `is:unresolved firstSeen:-24h`.

## Triage

1. Prioritize checkout, authentication, payment, webhook, and data-isolation failures.
2. Group duplicates by Sentry issue ID and fingerprint.
3. Create a GitHub issue for each actionable production defect with the Sentry permalink, affected project, first/last seen times, and customer impact.
4. Resolve the Sentry issue only after the fix is deployed and the error rate has returned to baseline.
