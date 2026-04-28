#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const defaultTargets = [
  { key: "prod-api-health", name: "Production API /health", url: "https://api.nomly.us/health", critical: true },
  { key: "prod-api-ready", name: "Production API /ready", url: "https://api.nomly.us/ready", critical: true },
  { key: "prod-operator-dashboard", name: "Production operator dashboard", url: "https://app.nomly.us", critical: true },
  { key: "prod-admin-console", name: "Production admin console", url: "https://admin.nomly.us", critical: true },
  { key: "prod-marketing-site", name: "Production marketing site", url: "https://nomly.us", critical: false },
  { key: "dev-api-health", name: "Dev API /health", url: "https://api-dev.nomly.us/health", critical: false },
  { key: "dev-api-ready", name: "Dev API /ready", url: "https://api-dev.nomly.us/ready", critical: false },
  { key: "dev-operator-dashboard", name: "Dev operator dashboard", url: "https://app-dev.nomly.us", critical: false },
  { key: "dev-admin-console", name: "Dev admin console", url: "https://admin-dev.nomly.us", critical: false }
];

function parseTargets() {
  const raw = process.env.UPTIME_TARGETS_JSON?.trim();
  if (!raw) {
    return defaultTargets;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("UPTIME_TARGETS_JSON must be an array");
  }

  return parsed.map((target) => ({
    key: String(target.key),
    name: String(target.name),
    url: String(target.url),
    critical: Boolean(target.critical)
  }));
}

function output(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  return writeFile(outputPath, `${name}=${value}\n`, { flag: "a" });
}

async function checkTarget(target, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "LatteLink-UptimeMonitor/1.0"
      }
    });
    const responseTimeMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 400;

    return {
      ...target,
      ok,
      status: response.status,
      responseTimeMs,
      checkedAt: new Date().toISOString(),
      error: ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: null,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function appendSummary(results) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const lines = [
    "## Uptime Monitor",
    "",
    "| Target | Status | HTTP | Response |",
    "| --- | --- | --- | --- |",
    ...results.map((result) => {
      const status = result.ok ? "OK" : "FAILED";
      const httpStatus = result.status ?? "n/a";
      const response = result.ok ? `${result.responseTimeMs}ms` : `${result.error} (${result.responseTimeMs}ms)`;
      return `| ${result.name} | ${status} | ${httpStatus} | ${response} |`;
    }),
    ""
  ];

  await writeFile(summaryPath, `${lines.join("\n")}\n`, { flag: "a" });
}

const timeoutMs = Number.parseInt(process.env.UPTIME_TIMEOUT_MS ?? "10000", 10);
const targets = parseTargets();
const results = await Promise.all(targets.map((target) => checkTarget(target, timeoutMs)));
const failed = results.filter((result) => !result.ok);

await writeFile("uptime-results.json", JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
await appendSummary(results);
await output("failed", failed.length > 0 ? "true" : "false");
await output("failure_count", String(failed.length));

if (failed.length > 0) {
  console.error(`[uptime] ${failed.length} target(s) failed`);
  for (const result of failed) {
    console.error(`[uptime] ${result.name}: ${result.error}`);
  }
} else {
  console.log("[uptime] all targets healthy");
}
