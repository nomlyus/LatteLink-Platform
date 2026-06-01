#!/usr/bin/env node

import { validateReleaseTagAdvance } from "./validate-release-tag.mjs";

const shaPattern = /^[0-9a-f]{40}$/;

function isTrue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function hasReleaseNotes(body) {
  return typeof body === "string" && body.trim().length > 0;
}

export function validateProductionRelease({
  releaseTag,
  releaseBody,
  releaseDraft,
  releasePrerelease,
  targetSha,
  mainSha,
  previousReleaseTag = ""
}) {
  if (isTrue(releaseDraft)) {
    throw new Error("Production deploy requires a published GitHub Release, not a draft release.");
  }

  if (isTrue(releasePrerelease)) {
    throw new Error("Production deploy requires a stable GitHub Release, not a prerelease.");
  }

  if (!hasReleaseNotes(releaseBody)) {
    throw new Error("Production deploy requires non-empty GitHub Release notes.");
  }

  if (!shaPattern.test(targetSha || "")) {
    throw new Error("Production release target must resolve to a full 40-character git SHA.");
  }

  if (!shaPattern.test(mainSha || "")) {
    throw new Error("origin/main must resolve to a full 40-character git SHA.");
  }

  if (targetSha !== mainSha) {
    throw new Error(`Production release target ${targetSha} must match current origin/main ${mainSha}.`);
  }

  return validateReleaseTagAdvance(releaseTag, previousReleaseTag);
}

function main() {
  try {
    const { candidate, latest } = validateProductionRelease({
      releaseTag: process.env.RELEASE_TAG,
      releaseBody: process.env.RELEASE_BODY,
      releaseDraft: process.env.RELEASE_DRAFT,
      releasePrerelease: process.env.RELEASE_PRERELEASE,
      targetSha: process.env.TARGET_SHA,
      mainSha: process.env.MAIN_SHA,
      previousReleaseTag: process.env.PREVIOUS_RELEASE_TAG
    });

    const baseline = latest ? latest.tag : "no previous release tag";
    console.log(`Production release ${candidate.tag} is valid against ${baseline}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("validate-production-release.mjs")) {
  process.exitCode = main();
}
