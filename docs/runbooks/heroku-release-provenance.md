# Heroku release provenance (#471)

Status: implementation candidate, 2026-09-22. Dev deployment verification is
required before closing #471; production must not be exercised until its
separately authorized release.

## Evidence chain

Nomly's Heroku release phase runs the checked-in Kysely migrations against the
configured Supabase **session-pooler** URL. After `migrateToLatest` succeeds,
it reads Kysely's migration history and emits one release-output record:
`phase=migration`, environment, latest applied migration name, applied count,
and pending count. A nonzero pending count fails the release. It does not log
the database URL, project reference, SQL, credentials, or customer data.

The backend runtime emits one `phase=worker-startup` record only after the
public gateway and embedded workers start successfully. It records the
notification dispatcher as `started` and the payment reconciler/menu sync as
`started` or `disabled` according to the workers actually started. If worker
startup fails, the process fails and no successful worker record is emitted.
The record is in Heroku application logs, not public `/health` or `/ready`.
Heroku access controls are therefore the operator boundary for this evidence.

The deploy workflow checks the Heroku Git ref against the full selected SHA
immediately after push, while its temporary credential helper is available.
It then checks the *current succeeded* Heroku release. If slug metadata is
available, it requires the slug's full commit to match. On the Heroku container
stack, `slug` can be null; the verifier instead requires Heroku's generated
`Deploy <short SHA>` description to be an eight-or-more-character prefix that
resolves uniquely to the selected full commit in the checked-out repository.
This is a weaker release-to-commit correlation than a full slug commit, so the
evidence explicitly labels the method. It then reads that same release's release-phase output and
requires a complete migration record for the expected environment. The
workflow prints only app-independent, non-sensitive release ID/version, SHA,
environment, and migration summary. Release logs should be reviewed for the
worker-startup record after the successful deployment, alongside the workflow
evidence and Heroku release ID/version. The runtime's optional
`HEROKU_BUILD_COMMIT`/`HEROKU_RELEASE_VERSION` fields remain `null` unless
Heroku Dyno Metadata is enabled; a null value is **not** a verified match.
Read-only inspection of the dev app's existing v30 release on 2026-09-22 found
`slug: null` and a generated `Deploy 872de7d1` description. The two Heroku
Dyno Metadata Labs features were disabled. These observations are why the
container description fallback and explicit null metadata behavior exist.

Do not substitute a mutable `DEPLOY_SOURCE_SHA` config var for a build commit.
Heroku config changes restart the currently deployed slug before the next code
push and can produce a false association if that push fails. A failed release
or rollback must be re-checked against the then-current release; previous
workflow evidence must never be treated as current deployment state.

## Dev verification checklist

1. Deploy the exact reviewed `develop` SHA through `deploy-dev`; do not use the
   workflow run's own SHA for a `workflow_run` event.
2. Confirm the Heroku Git ref equals the exact selected SHA. Confirm `Verify
   release migration provenance` passes and records a current, succeeded
   release with either an exact slug-commit match or a unique Heroku-generated
   description prefix, plus `pendingCount=0`. Record which method was used.
3. In Heroku's authorized release output, confirm the applied migration name
   and count agree with the workflow summary. No credentials or URLs should be
   present in the provenance record.
4. In authorized app logs after that release, confirm one startup record shows
   the notification dispatcher and the actual enabled/disabled payment
   reconciliation and menu-sync states. Confirm public `/ready` does not expose
   that worker record.
5. If the container-stack release has no slug metadata, a missing/ambiguous
   description prefix, or no retrievable release output, leave #471 open.
   Establish another exact-commit evidence chain before relaxing the verifier;
   do not accept a config-var target SHA as proof of the running build.

Production remains unverified until a future user-authorized production
release. This runbook does not authorize production access, configuration
changes, deployment, or enabling Heroku Labs features.
