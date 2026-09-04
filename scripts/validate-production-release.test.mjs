import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateProductionRelease } from "./validate-production-release.mjs";

const mainSha = "1111111111111111111111111111111111111111";

function validRelease(overrides = {}) {
  return {
    releaseTag: "v1.0.5",
    releaseBody: "Release notes for production.",
    releaseDraft: false,
    releasePrerelease: false,
    targetSha: mainSha,
    mainSha,
    previousReleaseTag: "v1.0.4",
    ...overrides,
  };
}

test("accepts a stable published release with notes targeting current main", () => {
  const result = validateProductionRelease(validRelease());

  assert.equal(result.candidate.tag, "v1.0.5");
  assert.equal(result.latest.tag, "v1.0.4");
});

test("requires release notes", () => {
  assert.throws(
    () => validateProductionRelease(validRelease({ releaseBody: "  \n\t" })),
    /non-empty GitHub Release notes/,
  );
});

test("rejects draft and prerelease objects", () => {
  assert.throws(
    () => validateProductionRelease(validRelease({ releaseDraft: true })),
    /draft release/,
  );
  assert.throws(
    () => validateProductionRelease(validRelease({ releasePrerelease: true })),
    /prerelease/,
  );
});

test("requires the release target to match current main", () => {
  assert.throws(
    () =>
      validateProductionRelease(
        validRelease({ targetSha: "2222222222222222222222222222222222222222" }),
      ),
    /must match current origin\/main/,
  );
});

test("requires the release tag to advance", () => {
  assert.throws(
    () => validateProductionRelease(validRelease({ releaseTag: "v1.0.4" })),
    /must be greater/,
  );
});

test("production workflow passes GitHub release metadata to the validator", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-prod.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /RELEASE_BODY: \$\{\{ github\.event\.release\.body \}\}/,
  );
  assert.match(
    workflow,
    /RELEASE_DRAFT: \$\{\{ github\.event\.release\.draft \}\}/,
  );
  assert.match(
    workflow,
    /RELEASE_PRERELEASE: \$\{\{ github\.event\.release\.prerelease \}\}/,
  );
});
