import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseEvidence } from "./verify-heroku-release-provenance.mjs";

const sha = "a".repeat(40);
const valid = {
  release: { id: "release-id", version: 42, current: true, status: "succeeded", description: "Deploy aaaaaaaa" },
  slug: { commit: sha },
  expectedSha: sha,
  expectedEnvironment: "dev",
  output: '[backend-runtime] release provenance {"phase":"migration","environment":"dev","migrations":{"latestApplied":"0047_backfill_refund_allocations","appliedCount":48,"pendingCount":0}}',
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
    output: valid.output.replace('"pendingCount":0', '"pendingCount":1'),
  }));
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
