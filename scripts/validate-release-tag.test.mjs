import assert from "node:assert/strict";
import test from "node:test";

import {
  compareReleaseVersions,
  nextPatchReleaseTag,
  parseReleaseTag,
  validateReleaseTagAdvance
} from "./validate-release-tag.mjs";

test("parses a semantic release tag", () => {
  assert.deepEqual(parseReleaseTag("v1.2.3"), {
    tag: "v1.2.3",
    version: "1.2.3",
    major: 1,
    minor: 2,
    patch: 3
  });
});

test("rejects non-release tag shapes", () => {
  assert.throws(() => parseReleaseTag("1.2.3"), /vMAJOR\.MINOR\.PATCH/);
  assert.throws(() => parseReleaseTag("v1.2"), /vMAJOR\.MINOR\.PATCH/);
  assert.throws(() => parseReleaseTag("v1.2.3-beta.1"), /vMAJOR\.MINOR\.PATCH/);
});

test("compares major, minor, and patch versions", () => {
  assert.equal(compareReleaseVersions(parseReleaseTag("v2.0.0"), parseReleaseTag("v1.9.9")), 1);
  assert.equal(compareReleaseVersions(parseReleaseTag("v1.3.0"), parseReleaseTag("v1.2.9")), 1);
  assert.equal(compareReleaseVersions(parseReleaseTag("v1.2.4"), parseReleaseTag("v1.2.3")), 1);
  assert.equal(compareReleaseVersions(parseReleaseTag("v1.2.3"), parseReleaseTag("v1.2.3")), 0);
  assert.equal(compareReleaseVersions(parseReleaseTag("v1.2.2"), parseReleaseTag("v1.2.3")), -1);
});

test("requires a candidate tag to advance beyond the latest tag", () => {
  assert.equal(validateReleaseTagAdvance("v1.0.5", "v1.0.4").candidate.version, "1.0.5");
  assert.equal(validateReleaseTagAdvance("v2.0.0", "v1.9.9").candidate.version, "2.0.0");
  assert.equal(validateReleaseTagAdvance("v0.1.0", "").candidate.version, "0.1.0");

  assert.throws(() => validateReleaseTagAdvance("v1.0.4", "v1.0.4"), /must be greater/);
  assert.throws(() => validateReleaseTagAdvance("v1.0.3", "v1.0.4"), /must be greater/);
});

test("calculates the next patch release tag", () => {
  assert.equal(nextPatchReleaseTag("v1.0.4"), "v1.0.5");
  assert.equal(nextPatchReleaseTag("v1.2.9"), "v1.2.10");
  assert.equal(nextPatchReleaseTag(""), "v0.1.0");
});
