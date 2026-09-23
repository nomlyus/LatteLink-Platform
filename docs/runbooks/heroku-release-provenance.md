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
`started` means the loop was launched; it does not prove continuing worker
health or successful processing of every subsequent job.
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
evidence explicitly labels the method. It then reads that same release's
release-phase output and requires a complete migration record for the expected
environment. The verifier reads recent authorized web logs and requires a
worker-startup record with the exact `HEROKU_BUILD_COMMIT`, current
`HEROKU_RELEASE_VERSION`, expected environment, and worker states matching the
current Heroku configuration. It confirms a web dyno belongs to that release
and rechecks that the release is still current. Missing or mismatched evidence
fails closed. The workflow prints only non-sensitive release ID/version, SHA,
environment, migration summary, and worker states; signed log/output URLs,
configuration values, and raw logs are never printed.

The worker verification requires Heroku's `runtime-dyno-metadata` and
`runtime-dyno-build-metadata` Labs features to provide the two metadata fields.
Without them the record contains `null`, which is **not** a verified match.
Enable them on dev before the controlled dev deployment and verify their
availability. Do not enable or change them on production under this task.
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
2. Confirm the two Dyno Metadata Labs features are enabled on the **dev** app.
   Confirm the Heroku Git ref equals the exact selected SHA. Confirm `Verify
   release migration provenance` passes and records a current, succeeded
   release with either an exact slug-commit match or a unique Heroku-generated
   description prefix, plus `pendingCount=0` and worker states bound to its
   exact build SHA and release version. Record which method was used.
3. In Heroku's authorized release output, confirm the applied migration name
   and count agree with the workflow summary. No credentials or URLs should be
   present in the provenance record.
4. Confirm the verifier found a startup record for the current release showing
   the notification dispatcher and actual enabled/disabled payment
   reconciliation and menu-sync states. Confirm public `/ready` does not expose
   that worker record. This is startup-state evidence, not a liveness guarantee.
5. If the container-stack release has no slug metadata, a missing/ambiguous
   description prefix, or no retrievable release output, leave #471 open.
   Establish another exact-commit evidence chain before relaxing the verifier;
   do not accept a config-var target SHA as proof of the running build.

Production remains unverified until a future user-authorized production
release. Its deploy workflow will require equivalent metadata when it is next
used; enabling that metadata on production is a separate approved release
preparation, not an action authorized here. This runbook does not authorize
production access, configuration changes, or deployment.
