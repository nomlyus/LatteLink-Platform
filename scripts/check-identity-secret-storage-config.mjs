#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  loadIdentitySecretStorageConfig,
  validateIdentitySecretStorageConfig,
} from "./identity-secret-storage-config.mjs";

export async function checkIdentitySecretStorageConfig(
  env = process.env,
  envFilePath = process.argv[2],
) {
  const config = await loadIdentitySecretStorageConfig(env, envFilePath);
  return validateIdentitySecretStorageConfig(config);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    const result = await checkIdentitySecretStorageConfig();
    const compatibility = result.legacyCompatibilityEnabled
      ? "enabled for dev cutover"
      : "disabled";
    process.stdout.write(
      `[identity-secret-storage-config] PASS: Apple keyring and active key ID are present and valid; legacy compatibility is ${compatibility}.\n`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "validation failed";
    process.stderr.write(
      `[identity-secret-storage-config] FAIL: ${reason}; no configuration values were displayed.\n`,
    );
    process.exitCode = 1;
  }
}
