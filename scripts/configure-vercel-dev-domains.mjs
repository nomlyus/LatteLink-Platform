#!/usr/bin/env node

const branch = process.env.DEV_BRANCH?.trim() || "develop";

const configs = [
  {
    id: "client-dashboard",
    label: "client dashboard",
    token: process.env.CLIENT_DASHBOARD_VERCEL_TOKEN,
    orgId: process.env.CLIENT_DASHBOARD_VERCEL_ORG_ID,
    projectId: process.env.CLIENT_DASHBOARD_VERCEL_PROJECT_ID,
    domain: process.env.CLIENT_DASHBOARD_DEV_DOMAIN || "app-dev.nomly.us"
  },
  {
    id: "admin-console",
    label: "admin console",
    token: process.env.ADMIN_CONSOLE_VERCEL_TOKEN,
    orgId: process.env.ADMIN_CONSOLE_VERCEL_ORG_ID,
    projectId: process.env.ADMIN_CONSOLE_VERCEL_PROJECT_ID,
    domain: process.env.ADMIN_CONSOLE_DEV_DOMAIN || "admin-dev.nomly.us"
  },
  {
    id: "public-web",
    label: "public web",
    token: process.env.LATTELINK_WEB_VERCEL_TOKEN,
    orgId: process.env.LATTELINK_WEB_VERCEL_ORG_ID,
    projectId: process.env.LATTELINK_WEB_VERCEL_PROJECT_ID,
    domain: process.env.LATTELINK_WEB_DEV_DOMAIN || "dev.nomly.us"
  }
];

const targets = new Set(
  (process.env.DEV_DOMAIN_TARGETS?.trim() || "all")
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean)
);
const selectedConfigs = targets.has("all") ? configs : configs.filter((config) => targets.has(config.id));

if (selectedConfigs.length === 0) {
  throw new Error(`No matching dev-domain targets for: ${Array.from(targets).join(", ")}`);
}

function requireConfig(config, key) {
  const value = config[key]?.trim();
  if (!value) {
    throw new Error(`${config.label} is missing ${key}`);
  }
  return value;
}

async function vercel(config, method, path, body) {
  const orgId = requireConfig(config, "orgId");
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", orgId);

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${requireConfig(config, "token")}`,
      "content-type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const code = payload?.error?.code ?? payload?.code;
    const alreadyExists = response.status === 409 || String(code).includes("already");
    if (method === "POST" && alreadyExists) {
      return payload;
    }

    throw new Error(`${config.label} ${method} ${path} failed ${response.status}: ${text}`);
  }

  return payload;
}

for (const config of selectedConfigs) {
  const domain = requireConfig(config, "domain");
  const projectId = requireConfig(config, "projectId");

  console.log(`Configuring ${domain} for ${config.label} branch ${branch}`);
  await vercel(config, "POST", `/v10/projects/${encodeURIComponent(projectId)}/domains`, {
    name: domain,
    gitBranch: branch
  });

  const domainConfig = await vercel(
    config,
    "GET",
    `/v10/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`
  );

  console.log(
    JSON.stringify(
      {
        label: config.label,
        domain,
        configuredBy: domainConfig?.configuredBy,
        gitBranch: domainConfig?.gitBranch,
        verified: domainConfig?.verified
      },
      null,
      2
    )
  );
}
