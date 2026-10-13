import assert from "node:assert/strict";
import test from "node:test";
import { waitForHerokuReleaseProvenance } from "./wait-for-heroku-release-provenance.mjs";

test("release wait retries until exact provenance is available", async () => {
  let calls = 0;
  let waits = 0;
  const result = await waitForHerokuReleaseProvenance({
    verify: async () => {
      calls += 1;
      if (calls < 3) throw new Error("current release is still old");
      return { releaseVersion: 58 };
    },
    sleep: async () => {
      waits += 1;
    },
    attempts: 3,
    intervalMs: 1,
  });
  assert.deepEqual(result, { releaseVersion: 58 });
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});

test("release wait fails closed after its bounded attempts", async () => {
  await assert.rejects(
    waitForHerokuReleaseProvenance({
      verify: async () => {
        throw new Error("migration evidence missing");
      },
      sleep: async () => {},
      attempts: 2,
      intervalMs: 1,
    }),
    /Timed out waiting.*migration evidence missing/,
  );
});
