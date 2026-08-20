#!/usr/bin/env node

const DEFAULT_PROJECTS = [
  "lattelink-gateway",
  "lattelink-mobile",
  "lattelink-operator-web",
  "lattelink-admin-console",
  "lattelink-web"
];

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function readProjects(env, argv) {
  const requested = readOption(argv, "--project", "") || env.SENTRY_PROJECTS || env.SENTRY_PROJECT || "";
  return (requested ? requested.split(",") : DEFAULT_PROJECTS).map((value) => value.trim()).filter(Boolean);
}

function buildIssuesUrl(baseUrl, org, project, query, limit) {
  const url = new URL(`/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`, baseUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "freq");
  return url;
}

export async function reviewSentryIssues({
  token,
  org,
  projects,
  query = "is:unresolved",
  limit = 25,
  baseUrl = "https://sentry.io/",
  fetchImpl = fetch
}) {
  if (!token?.trim()) throw new Error("SENTRY_AUTH_TOKEN is required.");
  if (!org?.trim()) throw new Error("SENTRY_ORG is required.");
  if (!Array.isArray(projects) || projects.length === 0) throw new Error("At least one Sentry project is required.");

  const results = [];
  for (const project of projects) {
    const response = await fetchImpl(buildIssuesUrl(baseUrl, org, project, query, limit), {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${response.status}`;
      throw new Error(`Sentry project ${project} request failed: ${detail}`);
    }
    results.push({ project, issues: Array.isArray(body) ? body : [] });
  }
  return results;
}

function printText(results) {
  let total = 0;
  for (const result of results) {
    console.log(`${result.project}: ${result.issues.length} unresolved issue(s)`);
    for (const issue of result.issues) {
      total += 1;
      console.log(`- ${issue.shortId ?? issue.id ?? "unknown"}: ${issue.title ?? "Untitled"}`);
      if (issue.permalink) console.log(`  ${issue.permalink}`);
      if (issue.lastSeen) console.log(`  last seen: ${issue.lastSeen}`);
    }
  }
  console.log(`Total unresolved issues: ${total}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const org = process.env.SENTRY_ORG ?? "";
  const projects = readProjects(process.env, argv);
  const query = readOption(argv, "--query", "is:unresolved");
  const limit = Number(readOption(argv, "--limit", "25"));
  const json = argv.includes("--json");

  reviewSentryIssues({
    token: process.env.SENTRY_AUTH_TOKEN,
    org,
    projects,
    query,
    limit
  })
    .then((results) => {
      if (json) console.log(JSON.stringify(results, null, 2));
      else printText(results);
    })
    .catch((error) => {
      console.error(`[sentry review] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
