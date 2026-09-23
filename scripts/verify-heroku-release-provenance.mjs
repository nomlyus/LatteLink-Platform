#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export function validateReleaseEvidence(input) {
  const { release, slug, output, expectedSha, expectedEnvironment, resolvedDescriptionCommit } = input;
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("Expected source SHA must contain 40 lowercase hex characters");
  }
  if (release?.current !== true || release?.status !== "succeeded") {
    throw new Error("Heroku release is not current and succeeded");
  }
  let commitEvidence;
  if (slug?.commit) {
    if (slug.commit !== expectedSha) {
      throw new Error("Heroku release slug commit does not match the exact deployment SHA");
    }
    commitEvidence = "slug-exact";
  } else {
    // Container-stack releases can omit slug metadata. Heroku's generated
    // description then supplies only a short commit prefix, not a full SHA.
    const prefix = /^Deploy ([0-9a-f]{8,40})$/.exec(release.description ?? "")?.[1];
    if (!prefix || resolvedDescriptionCommit !== expectedSha || !expectedSha.startsWith(prefix)) {
      throw new Error("Heroku release description does not uniquely identify the deployment SHA");
    }
    commitEvidence = "heroku-description-unique-prefix";
  }

  const marker = "[backend-runtime] release provenance ";
  const migrationLine = output.split("\n").find((line) => line.includes(marker));
  if (!migrationLine) {
    throw new Error("Heroku release output has no migration provenance record");
  }
  let provenance;
  try {
    provenance = JSON.parse(migrationLine.slice(migrationLine.indexOf(marker) + marker.length));
  } catch {
    throw new Error("Heroku migration provenance record is malformed");
  }
  if (
    provenance.phase !== "migration" ||
    provenance.environment !== expectedEnvironment ||
    typeof provenance.migrations?.latestApplied !== "string" ||
    !Number.isInteger(provenance.migrations.appliedCount) ||
    provenance.migrations.appliedCount < 1 ||
    provenance.migrations.pendingCount !== 0
  ) {
    throw new Error("Heroku migration provenance is incomplete or belongs to another environment");
  }
  return {
    releaseId: release.id,
    releaseVersion: release.version,
    sourceSha: expectedSha,
    commitEvidence,
    environment: expectedEnvironment,
    migrations: provenance.migrations,
  };
}

function expectedWorkerStates(config) {
  const enabled = config.PAYMENT_RECONCILER_ENABLED?.trim().toLowerCase();
  if (enabled && !["1", "true", "yes", "on", "0", "false", "no", "off"].includes(enabled)) {
    throw new Error("Payment reconciler configuration is invalid");
  }
  return {
    notificationsDispatch: "started",
    paymentReconciler: ["0", "false", "no", "off"].includes(enabled) ? "disabled" : "started",
    menuSync: config.WEBAPP_MENU_SOURCE_URL?.trim() ? "started" : "disabled",
  };
}

export function validateWorkerEvidence(input) {
  const { logText, expectedSha, releaseVersion, expectedEnvironment, workers } = input;
  const marker = "[backend-runtime] release provenance ";
  for (const line of logText.split("\n")) {
    const markerIndex = line.indexOf(marker);
    if (markerIndex === -1) continue;
    let record;
    try {
      record = JSON.parse(line.slice(markerIndex + marker.length));
    } catch {
      continue;
    }
    if (
      record.phase !== "worker-startup" ||
      record.environment !== expectedEnvironment ||
      record.buildCommit !== expectedSha ||
      record.releaseVersion !== `v${releaseVersion}`
    ) continue;
    if (
      record.workers?.notificationsDispatch !== workers.notificationsDispatch ||
      record.workers?.paymentReconciler !== workers.paymentReconciler ||
      record.workers?.menuSync !== workers.menuSync
    ) {
      throw new Error("Worker startup state disagrees with the current Heroku configuration");
    }
    return workers;
  }
  throw new Error("Current release worker startup evidence is unavailable or does not match build metadata");
}

async function herokuJson(path, appName, apiKey, input = {}) {
  const response = await fetch(`https://api.heroku.com/apps/${encodeURIComponent(appName)}${path}`, {
    method: input.method ?? "GET",
    body: input.body ? JSON.stringify(input.body) : undefined,
    headers: {
      accept: "application/vnd.heroku+json; version=3",
      authorization: `Bearer ${apiKey}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new Error(`Heroku provenance request failed (${response.status})`);
  return response.json();
}

async function readRecentWebLogs(appName, apiKey) {
  const session = await herokuJson("/log-sessions", appName, apiKey, {
    method: "POST",
    body: { type: "web", source: "app", lines: 1500, tail: false },
  });
  if (!session.logplex_url) throw new Error("Heroku log session is unavailable");
  const response = await fetch(session.logplex_url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`Heroku log session retrieval failed (${response.status})`);
  return response.text();
}

async function verifyCurrentWorkerEvidence(input) {
  const { appName, apiKey, release, expectedSha, expectedEnvironment } = input;
  const config = await herokuJson("/config-vars", appName, apiKey);
  if (config.DEPLOY_ENV !== expectedEnvironment) {
    throw new Error("Heroku runtime environment does not match deployment evidence");
  }
  const workers = expectedWorkerStates(config);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const logText = await readRecentWebLogs(appName, apiKey);
    try {
      return validateWorkerEvidence({
        logText,
        expectedSha,
        releaseVersion: release.version,
        expectedEnvironment,
        workers,
      });
    } catch (error) {
      if (error.message !== "Current release worker startup evidence is unavailable or does not match build metadata") {
        throw error;
      }
      if (attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error("Current release worker startup evidence is unavailable");
}

export async function verifyHerokuReleaseProvenance(env = process.env) {
  const appName = env.HEROKU_APP_NAME?.trim();
  const apiKey = env.HEROKU_API_KEY?.trim();
  const expectedSha = env.DEPLOY_SHA?.trim();
  const expectedEnvironment = env.DEPLOY_ENV?.trim();
  if (!appName || !apiKey || !expectedSha || !["dev", "production"].includes(expectedEnvironment)) {
    throw new Error("Heroku app, API key, deployment SHA, and environment are required");
  }

  const releases = await herokuJson("/releases", appName, apiKey);
  const release = releases.find((candidate) => candidate.current === true);
  if (!release?.id || !release.output_stream_url) {
    throw new Error("Current Heroku release lacks release-output provenance");
  }
  const slug = release.slug?.id
    ? await herokuJson(`/slugs/${encodeURIComponent(release.slug.id)}`, appName, apiKey)
    : null;
  const prefix = /^Deploy ([0-9a-f]{8,40})$/.exec(release.description ?? "")?.[1];
  let resolvedDescriptionCommit = null;
  if (!slug && prefix) {
    try {
      resolvedDescriptionCommit = execFileSync("git", ["rev-parse", "--verify", `${prefix}^{commit}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      throw new Error("Heroku release short commit cannot be resolved uniquely in this checkout");
    }
  }
  const outputResponse = await fetch(release.output_stream_url, { headers: { accept: "text/plain" } });
  if (!outputResponse.ok) throw new Error(`Heroku release output unavailable (${outputResponse.status})`);
  const evidence = validateReleaseEvidence({
    release,
    slug,
    output: await outputResponse.text(),
    expectedSha,
    expectedEnvironment,
    resolvedDescriptionCommit,
  });
  const workers = await verifyCurrentWorkerEvidence({
    appName,
    apiKey,
    release,
    expectedSha,
    expectedEnvironment,
  });
  const dynos = await herokuJson("/dynos", appName, apiKey);
  if (!dynos.some((dyno) => dyno.type === "web" && ["up", "idle"].includes(dyno.state) && dyno.release?.id === release.id)) {
    throw new Error("No current web dyno is associated with the verified Heroku release");
  }
  const latestReleases = await herokuJson("/releases", appName, apiKey);
  if (latestReleases.find((candidate) => candidate.current === true)?.id !== release.id) {
    throw new Error("Heroku current release changed during provenance verification");
  }
  const verified = { ...evidence, workers };
  console.info(`[release-provenance] ${JSON.stringify(verified)}`);
  return verified;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  verifyHerokuReleaseProvenance().catch((error) => {
    console.error(`[release-provenance] ${error.message}`);
    process.exitCode = 1;
  });
}
