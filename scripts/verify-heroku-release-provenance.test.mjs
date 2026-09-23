import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseEvidence, validateWorkerEvidence } from "./verify-heroku-release-provenance.mjs";

const sha = "a".repeat(40);
const valid = {
  release: { id: "release-id", version: 42, current: true, status: "succeeded", description: "Deploy aaaaaaaa" },
  slug: { commit: sha },
  expectedSha: sha,
  expectedEnvironment: "dev",
  output: `[backend-runtime] release provenance ${JSON.stringify({
    phase: "migration",
    environment: "dev",
    buildCommit: sha,
    releaseVersion: "v42",
    migrations: { latestApplied: "0047_backfill_refund_allocations", appliedCount: 48, pendingCount: 0 },
  })}`,
};

test("validates exact release commit and actual migration record", () => {
  assert.deepEqual(validateReleaseEvidence(valid), {
    releaseId: "release-id",
    releaseVersion: 42,
    sourceSha: sha,
    commitEvidence: "slug-exact",
    environment: "dev",
    migrations: {
      latestApplied: "0047_backfill_refund_allocations",
      appliedCount: 48,
      pendingCount: 0,
    },
  });
});

test("rejects a failed release, wrong commit, or missing migration evidence", () => {
  assert.throws(() => validateReleaseEvidence({ ...valid, release: { ...valid.release, status: "failed" } }));
  assert.throws(() => validateReleaseEvidence({ ...valid, slug: { commit: "b".repeat(40) } }));
  assert.throws(() => validateReleaseEvidence({ ...valid, output: "" }));
  assert.throws(() => validateReleaseEvidence({ ...valid, expectedEnvironment: "production" }));
  assert.throws(() => validateReleaseEvidence({
    ...valid,
    output: valid.output.replace(`"buildCommit":"${sha}"`, '"buildCommit":null'),
  }));
  assert.throws(() => validateReleaseEvidence({
    ...valid,
    output: valid.output.replace('"releaseVersion":"v42"', '"releaseVersion":"v41"'),
  }));
  assert.throws(() => validateReleaseEvidence({
    ...valid,
    output: valid.output.replace('"pendingCount":0', '"pendingCount":1'),
  }));
});

test("ignores stale release log records and accepts only the current commit/version", () => {
  const stale = valid.output.replace(`"buildCommit":"${sha}"`, `"buildCommit":"${"b".repeat(40)}"`);
  assert.deepEqual(validateReleaseEvidence({ ...valid, output: `${stale}\n${valid.output}` }).migrations, {
    latestApplied: "0047_backfill_refund_allocations",
    appliedCount: 48,
    pendingCount: 0,
  });
  assert.throws(() => validateReleaseEvidence({ ...valid, output: stale }));
});

test("accepts container release description only when its prefix resolves uniquely to the exact SHA", () => {
  assert.equal(validateReleaseEvidence({
    ...valid,
    slug: null,
    resolvedDescriptionCommit: sha,
  }).commitEvidence, "heroku-description-unique-prefix");
  assert.throws(() => validateReleaseEvidence({ ...valid, slug: null, resolvedDescriptionCommit: "b".repeat(40) }));
  assert.throws(() => validateReleaseEvidence({
    ...valid,
    slug: null,
    release: { ...valid.release, description: "Deploy aaaaaaa" },
    resolvedDescriptionCommit: sha,
  }));
});

test("returns only allowlisted non-sensitive fields", () => {
  const evidence = validateReleaseEvidence({
    ...valid,
    release: {
      ...valid.release,
      output_stream_url: "https://signed.example/token=private",
      config: { DATABASE_URL: "postgres://private" },
    },
  });
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("DATABASE_URL"), false);
});

const workerRecord = {
  phase: "worker-startup",
  environment: "dev",
  buildCommit: sha,
  releaseVersion: "v42",
  workers: {
    notificationsDispatch: "started",
    paymentReconciler: "started",
    menuSync: "disabled",
  },
};

test("accepts only worker startup evidence bound to the exact release and build", () => {
  const input = {
    logText: `2026-09-22 app[web.1]: [backend-runtime] release provenance ${JSON.stringify(workerRecord)}`,
    expectedSha: sha,
    releaseVersion: 42,
    expectedEnvironment: "dev",
    workers: workerRecord.workers,
  };
  assert.deepEqual(validateWorkerEvidence(input), workerRecord.workers);
  assert.throws(() => validateWorkerEvidence({ ...input, releaseVersion: 43 }));
  assert.throws(() => validateWorkerEvidence({ ...input, expectedSha: "b".repeat(40) }));
  assert.throws(() => validateWorkerEvidence({ ...input, expectedEnvironment: "production" }));
  assert.throws(() => validateWorkerEvidence({
    ...input,
    workers: { ...workerRecord.workers, paymentReconciler: "disabled" },
  }), /disagrees/);
});

test("rejects worker lines without Heroku build metadata or with malformed content", () => {
  const input = {
    logText: `[backend-runtime] release provenance ${JSON.stringify({
      ...workerRecord,
      buildCommit: null,
      releaseVersion: null,
    })}`,
    expectedSha: sha,
    releaseVersion: 42,
    expectedEnvironment: "dev",
    workers: workerRecord.workers,
  };
  assert.throws(() => validateWorkerEvidence(input));
  assert.throws(() => validateWorkerEvidence({ ...input, logText: "[backend-runtime] release provenance {invalid" }));
});
