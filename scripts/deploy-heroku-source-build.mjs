#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const HEROKU_API = "https://api.heroku.com";
const API_ACCEPT = "application/vnd.heroku+json; version=3";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function responseError(message, response) {
  return new Error(`${message} (HTTP ${response.status})`);
}

async function herokuJson(path, apiKey, options = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${HEROKU_API}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: API_ACCEPT,
        authorization: `Bearer ${apiKey}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error("Heroku API request failed before receiving a response");
  }

  if (!response.ok) throw responseError("Heroku API request failed", response);
  return response.json();
}

function sourceArchive(sourceSha, exec = execFileSync) {
  const headSha = exec("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (headSha !== sourceSha) {
    throw new Error(
      "Checked-out source does not match the requested deployment SHA",
    );
  }
  return exec("git", ["archive", "--format=tar.gz", sourceSha], {
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
  });
}

export function createBuildRequest(sourceSha, archive, sourceUrl) {
  if (!SHA_PATTERN.test(sourceSha))
    throw new Error("Deployment SHA is invalid");
  const safeSourceUrl = requireHttpsUrl(sourceUrl, "download");
  return {
    source_blob: {
      checksum: `SHA256:${createHash("sha256").update(archive).digest("hex")}`,
      url: safeSourceUrl,
      version: sourceSha,
      version_description: `Deploy ${sourceSha.slice(0, 8)}`,
    },
  };
}

function requireHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Heroku source ${label} URL is invalid`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Heroku source ${label} URL must use HTTPS`);
  }
  return parsed.toString();
}

async function uploadSource(archive, apiKey, fetchImpl) {
  const source = await herokuJson(
    "/sources",
    apiKey,
    { method: "POST" },
    fetchImpl,
  );
  const putUrl = requireHttpsUrl(source.source_blob?.put_url, "upload");
  const getUrl = requireHttpsUrl(source.source_blob?.get_url, "download");

  let response;
  try {
    response = await fetchImpl(putUrl, { method: "PUT", body: archive });
  } catch {
    throw new Error(
      "Heroku source archive upload failed before receiving a response",
    );
  }
  if (!response.ok)
    throw responseError("Heroku source archive upload failed", response);
  return getUrl;
}

export async function waitForBuild({
  appName,
  apiKey,
  buildId,
  sourceSha,
  fetchImpl = fetch,
  sleep = delay,
  timeoutMs = 20 * 60_000,
  intervalMs = 5_000,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs;
  while (now() <= deadline) {
    const build = await herokuJson(
      `/apps/${encodeURIComponent(appName)}/builds/${encodeURIComponent(buildId)}`,
      apiKey,
      {},
      fetchImpl,
    );
    if (build.source_blob?.version !== sourceSha) {
      throw new Error(
        "Heroku build source version does not match the requested deployment SHA",
      );
    }
    if (build.status === "failed")
      throw new Error(`Heroku source build failed (${build.id})`);
    if (build.status === "succeeded" || build.status === "successful") {
      if (!build.release?.id)
        throw new Error("Successful Heroku build did not produce a release");
      return build;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for Heroku source build (${buildId})`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function deployHerokuSourceBuild(
  env = process.env,
  dependencies = {},
) {
  const appName = env.HEROKU_APP_NAME?.trim();
  const apiKey = env.HEROKU_API_KEY?.trim();
  const sourceSha = env.DEPLOY_SHA?.trim();
  if (!appName || !apiKey || !sourceSha || !SHA_PATTERN.test(sourceSha)) {
    throw new Error(
      "Heroku app, API key, and full deployment SHA are required",
    );
  }

  const fetchImpl = dependencies.fetch ?? fetch;
  const archive = (dependencies.archive ?? sourceArchive)(sourceSha);
  const getUrl = await uploadSource(archive, apiKey, fetchImpl);
  const request = createBuildRequest(sourceSha, archive, getUrl);
  const created = await herokuJson(
    `/apps/${encodeURIComponent(appName)}/builds`,
    apiKey,
    { method: "POST", body: request },
    fetchImpl,
  );
  if (!created.id || created.source_blob?.version !== sourceSha) {
    throw new Error(
      "Heroku did not accept a build for the requested deployment SHA",
    );
  }

  const completed = await waitForBuild({
    appName,
    apiKey,
    buildId: created.id,
    sourceSha,
    fetchImpl,
    sleep: dependencies.sleep,
    timeoutMs: dependencies.timeoutMs,
    intervalMs: dependencies.intervalMs,
    now: dependencies.now,
  });
  const result = {
    buildId: completed.id,
    releaseId: completed.release.id,
    sourceSha,
  };
  console.info(`[heroku-source-build] ${JSON.stringify(result)}`);
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  deployHerokuSourceBuild().catch((error) => {
    console.error(`[heroku-source-build] ${error.message}`);
    process.exitCode = 1;
  });
}
