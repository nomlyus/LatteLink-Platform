#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { verifyHerokuReleaseProvenance } from "./verify-heroku-release-provenance.mjs";

export async function waitForHerokuReleaseProvenance({
  env = process.env,
  verify = verifyHerokuReleaseProvenance,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 40,
  intervalMs = 15_000,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verify(env);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.info(
        `[release-provenance] waiting for the requested release (${attempt}/${attempts}): ${error.message}`,
      );
      await sleep(intervalMs);
    }
  }
  throw new Error(
    `Timed out waiting for a verified current Heroku release: ${lastError?.message ?? "unknown error"}`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  waitForHerokuReleaseProvenance().catch((error) => {
    console.error(`[release-provenance] ${error.message}`);
    process.exitCode = 1;
  });
}
