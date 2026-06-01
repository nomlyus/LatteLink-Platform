#!/usr/bin/env node

const releaseTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseReleaseTag(tag) {
  const normalized = typeof tag === "string" ? tag.trim() : "";
  const match = releaseTagPattern.exec(normalized);

  if (!match) {
    throw new Error("Release tag must match vMAJOR.MINOR.PATCH, for example v1.0.5.");
  }

  const [, major, minor, patch] = match;

  return {
    tag: normalized,
    version: `${major}.${minor}.${patch}`,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch)
  };
}

export function compareReleaseVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] > right[key]) {
      return 1;
    }

    if (left[key] < right[key]) {
      return -1;
    }
  }

  return 0;
}

export function validateReleaseTagAdvance(candidateTag, latestTag) {
  const candidate = parseReleaseTag(candidateTag);
  const latest = latestTag?.trim() ? parseReleaseTag(latestTag) : null;

  if (latest && compareReleaseVersions(candidate, latest) <= 0) {
    throw new Error(`Release tag ${candidate.tag} must be greater than latest release tag ${latest.tag}.`);
  }

  return { candidate, latest };
}

function main(argv) {
  const [candidateTag, latestTag = ""] = argv;

  try {
    const { candidate, latest } = validateReleaseTagAdvance(candidateTag, latestTag);
    const baseline = latest ? latest.tag : "no existing release tag";
    console.log(`Release tag ${candidate.tag} advances from ${baseline}.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("validate-release-tag.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
