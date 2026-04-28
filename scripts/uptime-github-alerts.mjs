#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token || !repository) {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
}

const [owner, repo] = repository.split("/");
const apiBaseUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
const issueMarkerPrefix = "<!-- uptime-monitor-key:";

async function github(method, path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

async function ensureLabel(name, color, description) {
  const encoded = encodeURIComponent(name);
  const response = await fetch(`${apiBaseUrl}/repos/${owner}/${repo}/labels/${encoded}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28"
    }
  });

  if (response.status === 404) {
    await github("POST", `/repos/${owner}/${repo}/labels`, { name, color, description });
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub label lookup failed: ${response.status} ${text}`);
  }
}

function markerFor(key) {
  return `${issueMarkerPrefix} ${key} -->`;
}

function renderFailureBody(result) {
  return [
    markerFor(result.key),
    "",
    "External uptime monitoring detected a failing target.",
    "",
    `- Target: ${result.name}`,
    `- URL: ${result.url}`,
    `- Critical: ${result.critical ? "yes" : "no"}`,
    `- Checked at: ${result.checkedAt}`,
    `- HTTP status: ${result.status ?? "n/a"}`,
    `- Response time: ${result.responseTimeMs}ms`,
    `- Error: ${result.error ?? "unknown"}`,
    "",
    "Runbook: docs/runbooks/pilot-uptime-monitoring.md",
    "Incident playbook: docs/runbooks/pilot-incident-response.md"
  ].join("\n");
}

function renderFailureComment(result) {
  return [
    "Target is still failing.",
    "",
    `- Checked at: ${result.checkedAt}`,
    `- HTTP status: ${result.status ?? "n/a"}`,
    `- Response time: ${result.responseTimeMs}ms`,
    `- Error: ${result.error ?? "unknown"}`
  ].join("\n");
}

function renderRecoveryComment(result) {
  return [
    "Target recovered.",
    "",
    `- Checked at: ${result.checkedAt}`,
    `- HTTP status: ${result.status ?? "n/a"}`,
    `- Response time: ${result.responseTimeMs}ms`
  ].join("\n");
}

async function sendWebhook(payload) {
  const url = process.env.UPTIME_WEBHOOK_URL?.trim();
  if (!url) {
    return;
  }

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

await ensureLabel("uptime", "b60205", "External uptime monitor alert");
await ensureLabel("status:degraded", "d93f0b", "Currently failing external uptime monitor");

const raw = await readFile("uptime-results.json", "utf8");
const report = JSON.parse(raw);
const results = Array.isArray(report.results) ? report.results : [];
const openIssues = await github(
  "GET",
  `/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent("uptime")}&per_page=100`
);

const issueByKey = new Map();
for (const issue of openIssues) {
  if (issue.pull_request) {
    continue;
  }

  const markerLine = String(issue.body ?? "")
    .split("\n")
    .find((line) => line.startsWith(issueMarkerPrefix));
  const key = markerLine?.replace(issueMarkerPrefix, "").replace("-->", "").trim();
  if (key) {
    issueByKey.set(key, issue);
  }
}

const failures = results.filter((result) => !result.ok);
const recoveries = results.filter((result) => result.ok && issueByKey.has(result.key));

for (const result of failures) {
  const existing = issueByKey.get(result.key);
  if (existing) {
    await github("POST", `/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
      body: renderFailureComment(result)
    });
    continue;
  }

  await github("POST", `/repos/${owner}/${repo}/issues`, {
    title: `[Uptime] ${result.name} is failing`,
    body: renderFailureBody(result),
    labels: ["uptime", "status:degraded", "p1", "gate:1", "area:infra"]
  });
}

for (const result of recoveries) {
  const issue = issueByKey.get(result.key);
  await github("POST", `/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
    body: renderRecoveryComment(result)
  });
  await github("PATCH", `/repos/${owner}/${repo}/issues/${issue.number}`, {
    state: "closed",
    state_reason: "completed"
  });
}

await sendWebhook({
  checkedAt: report.checkedAt,
  failures,
  recoveries
});

console.log(`[uptime-alerts] failures=${failures.length} recoveries=${recoveries.length}`);
