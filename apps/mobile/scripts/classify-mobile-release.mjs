#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const baseRef = process.argv[2] ?? "origin/main";
const headRef = process.argv[3] ?? "HEAD";

function git(args) {
  return execFileSync("git", args, {
    cwd: new URL("../../..", import.meta.url),
    encoding: "utf8"
  }).trim();
}

function listChangedFiles() {
  const output =
    headRef === "HEAD"
      ? git(["diff", "--name-only", baseRef])
      : git(["diff", "--name-only", baseRef, headRef]);
  return output ? output.split("\n").filter(Boolean) : [];
}

const binaryPatterns = [
  /^apps\/mobile\/ios\//,
  /^apps\/mobile\/android\//,
  /^apps\/mobile\/app\.config\.ts$/,
  /^apps\/mobile\/eas\.json$/,
  /^apps\/mobile\/package\.json$/,
  /^apps\/mobile\/assets\/(icon|splash)\.(png|jpg|jpeg|webp)$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^patches\//,
  /^packages\/.*\/package\.json$/
];

const otaCandidatePatterns = [
  /^apps\/mobile\/app\//,
  /^apps\/mobile\/src\//,
  /^apps\/mobile\/global\.css$/,
  /^apps\/mobile\/tailwind\.config\.js$/,
  /^apps\/mobile\/assets\//,
  /^packages\/contracts\//,
  /^packages\/design-tokens\//,
  /^packages\/sdk-mobile\//
];

const changedFiles = listChangedFiles();
const binaryFiles = changedFiles.filter((file) => binaryPatterns.some((pattern) => pattern.test(file)));
const otaFiles = changedFiles.filter((file) => otaCandidatePatterns.some((pattern) => pattern.test(file)));
const mobileRelevantFiles = changedFiles.filter(
  (file) => file.startsWith("apps/mobile/") || file.startsWith("packages/contracts/") || file.startsWith("packages/design-tokens/") || file.startsWith("packages/sdk-mobile/")
);

console.log(`[mobile release classify] ${baseRef} ${headRef}`);

if (changedFiles.length === 0) {
  console.log("- PASS: no changes detected.");
  process.exit(0);
}

if (binaryFiles.length > 0) {
  console.log("- RESULT: binary build required.");
  console.log("- Reason: native/config/dependency files changed:");
  for (const file of binaryFiles) {
    console.log(`  - ${file}`);
  }
  process.exit(2);
}

if (mobileRelevantFiles.length > 0 && otaFiles.length === mobileRelevantFiles.length) {
  console.log("- RESULT: OTA update candidate.");
  console.log("- Reason: changes are limited to mobile JS/CSS/assets or generated mobile-facing packages.");
  process.exit(0);
}

console.log("- RESULT: no mobile binary build required by this classifier.");
if (mobileRelevantFiles.length > 0) {
  console.log("- Review these mobile-relevant files before publishing OTA:");
  for (const file of mobileRelevantFiles) {
    console.log(`  - ${file}`);
  }
}
