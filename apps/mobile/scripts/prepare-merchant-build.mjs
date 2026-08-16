#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { z } from "zod";

const MOBILE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(MOBILE_DIR, "../..");
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, ".nomly/mobile-builds");

const profileSchema = z.enum(["beta", "production"]);
const merchantBuildInputSchema = z.object({
  locationId: z.string().trim().min(1),
  appName: z.string().trim().min(2).max(30),
  displayName: z.string().trim().min(2).max(30).optional(),
  bundleIdentifier: z
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/),
  sku: z.string().trim().min(2).max(64).optional(),
  primaryCategory: z.string().trim().min(1).default("Food & Drink"),
  subtitle: z.string().trim().min(1).max(30).optional(),
  supportUrl: z.string().trim().url().optional(),
  privacyPolicyUrl: z.string().trim().url().default("https://nomly.us/privacy-policy"),
  marketingUrl: z.string().trim().url().optional(),
  iconAssetUrl: z.string().trim().url().optional(),
  splashAssetUrl: z.string().trim().url().optional(),
  screenshotAssetUrls: z.array(z.string().trim().url()).default([]),
  targetLocationIds: z.array(z.string().trim().min(1)).default([]),
  assetMode: z.enum(["placeholder", "provided"]).default("placeholder"),
  applePayMerchantId: z.string().trim().regex(/^merchant\.[A-Za-z0-9.-]+$/),
  ascAppId: z.string().trim().regex(/^\d+$/).optional(),
  apiBaseUrl: z.string().trim().url(),
  appVersion: z.string().trim().regex(/^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/),
  runtimeVersion: z.string().trim().min(1).optional(),
  sentryDsn: z.string().trim().url(),
  sentryOrg: z.string().trim().regex(/^[a-z0-9_-]+$/i),
  sentryProject: z.string().trim().regex(/^[a-z0-9_-]+$/i),
  associatedDomains: z.array(z.string().trim().min(1)).default([]),
  releaseNotes: z.string().trim().min(1).optional(),
  appStoreReviewNotes: z.string().trim().min(1).optional()
});

function parseArgs(argv) {
  const args = {
    execute: "none",
    outputDir: DEFAULT_OUTPUT_DIR,
    sourceCommit: "",
    profile: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--input" && next) {
      args.input = next;
      index += 1;
    } else if (arg === "--profile" && next) {
      args.profile = next;
      index += 1;
    } else if (arg === "--source-commit" && next) {
      args.sourceCommit = next;
      index += 1;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = resolve(next);
      index += 1;
    } else if (arg === "--execute" && next) {
      args.execute = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return `Usage: pnpm --filter @lattelink/mobile merchant-build:prepare -- --input merchant.json --profile beta --source-commit <40-char-sha>

Options:
  --input <path>          Merchant app identity/release JSON.
  --profile <name>       beta or production.
  --source-commit <sha>  Source commit to record in the generated build bundle.
  --output-dir <path>    Output root. Defaults to .nomly/mobile-builds.
  --execute <mode>       none, preflight, build, submit, or all. Defaults to none.`;
}

function normalizeUrl(value) {
  return new URL(value).toString().replace(/\/+$/, "");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function buildConfigHash(input) {
  const payload = {
    locationId: input.locationId,
    appName: input.appName,
    displayName: input.displayName,
    bundleIdentifier: input.bundleIdentifier,
    sku: input.sku,
    primaryCategory: input.primaryCategory,
    subtitle: input.subtitle,
    supportUrl: input.supportUrl,
    privacyPolicyUrl: input.privacyPolicyUrl,
    marketingUrl: input.marketingUrl,
    iconAssetUrl: input.iconAssetUrl,
    splashAssetUrl: input.splashAssetUrl,
    screenshotAssetUrls: input.screenshotAssetUrls,
    targetLocationIds: input.targetLocationIds,
    assetMode: input.assetMode
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildEnv(input, profile) {
  const baseName = input.displayName ?? input.appName;
  const displayName = profile === "beta" && !baseName.toLowerCase().endsWith(" beta") ? `${baseName} Beta` : baseName;
  const apiBaseUrl = normalizeUrl(input.apiBaseUrl);
  const slug = slugify(`${input.locationId}-${profile}`);
  const scheme = slugify(input.bundleIdentifier.replace(/\./g, "-"));
  const runtimeVersion = input.runtimeVersion ?? input.appVersion;

  return {
    APP_VARIANT: profile,
    EXPO_PUBLIC_APP_VARIANT: profile,
    APP_DISPLAY_NAME_BASE: baseName,
    APP_DISPLAY_NAME: displayName,
    APP_VERSION: input.appVersion,
    APP_RUNTIME_VERSION: runtimeVersion,
    EXPO_SLUG: slug,
    EXPO_SCHEME: scheme,
    IOS_BUNDLE_IDENTIFIER: input.bundleIdentifier,
    EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: input.bundleIdentifier,
    EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
    EXPO_PUBLIC_CATALOG_SERVICE_BASE_URL: apiBaseUrl,
    EXPO_PUBLIC_CATALOG_API_BASE_URL: apiBaseUrl,
    EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: input.applePayMerchantId,
    EXPO_PUBLIC_BRAND_NAME: input.appName,
    EXPO_PUBLIC_LOCATION_ID: input.locationId,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: input.privacyPolicyUrl,
    EXPO_PUBLIC_SENTRY_DSN: input.sentryDsn,
    SENTRY_ORG: input.sentryOrg,
    SENTRY_PROJECT: input.sentryProject,
    IOS_ASSOCIATED_DOMAINS: input.associatedDomains.join(",")
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function toEnvFile(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join("\n")}\n`;
}

function buildCommands(paths, profile, input) {
  const sourceEnv = `set -a; . ${shellQuote(paths.envFile)}; set +a`;
  const ascConnect = input.ascAppId
    ? `pnpm --filter @lattelink/mobile exec eas integrations:asc:connect --bundle-id ${shellQuote(input.bundleIdentifier)} --asc-app-id ${shellQuote(input.ascAppId)} --non-interactive`
    : "# Add ascAppId to the manifest, then run eas integrations:asc:connect before submission.";
  const whatToTest = input.releaseNotes ?? "Performance optimizations, security updates, and reliability improvements.";
  return {
    preflight: `${sourceEnv}; pnpm --filter @lattelink/mobile release:check -- ${profile}`,
    ascConnect,
    build: `${sourceEnv}; pnpm --filter @lattelink/mobile exec eas build --platform ios --profile ${profile} --non-interactive`,
    submit: `${sourceEnv}; pnpm --filter @lattelink/mobile exec eas submit --platform ios --profile ${profile} --latest --non-interactive --what-to-test ${shellQuote(whatToTest)}`
  };
}

function runCommand(command, env) {
  const result = spawnSync(command, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    shell: true,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command}`);
  }
}

export async function prepareMerchantBuild(rawArgs) {
  const args = parseArgs(rawArgs);
  if (args.help) {
    return { help: usage() };
  }
  if (!args.input) {
    throw new Error("--input is required.");
  }

  const profile = profileSchema.parse(args.profile);
  if (!/^[a-f0-9]{40}$/i.test(args.sourceCommit)) {
    throw new Error("--source-commit must be a 40-character git commit SHA.");
  }

  const input = merchantBuildInputSchema.parse(JSON.parse(await readFile(resolve(args.input), "utf8")));
  const env = buildEnv(input, profile);
  const configHash = buildConfigHash(input);
  const outputDir = resolve(args.outputDir, input.locationId, profile);
  const paths = {
    outputDir,
    envFile: resolve(outputDir, ".env.eas"),
    manifestFile: resolve(outputDir, "build-manifest.json"),
    commandsFile: resolve(outputDir, "commands.sh")
  };
  const commands = buildCommands(paths, profile, input);
  const manifest = {
    locationId: input.locationId,
    profile,
    sourceCommitSha: args.sourceCommit,
    configHash,
    bundleIdentifier: input.bundleIdentifier,
    ascAppId: input.ascAppId ?? null,
    appVersion: input.appVersion,
    runtimeVersion: input.runtimeVersion ?? input.appVersion,
    generatedAt: new Date().toISOString(),
    appStoreReviewNotes: input.appStoreReviewNotes ?? null,
    commands
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(paths.envFile, toEnvFile(env), "utf8");
  await writeFile(paths.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    paths.commandsFile,
    `#!/usr/bin/env bash\nset -euo pipefail\n\n${commands.preflight}\n${commands.ascConnect}\n${commands.build}\n${commands.submit}\n`,
    "utf8"
  );

  if (args.execute === "preflight") {
    runCommand(commands.preflight, env);
  } else if (args.execute === "build") {
    runCommand(commands.preflight, env);
    runCommand(commands.build, env);
  } else if (args.execute === "submit") {
    runCommand(commands.submit, env);
  } else if (args.execute === "all") {
    runCommand(commands.preflight, env);
    if (input.ascAppId) runCommand(commands.ascConnect, env);
    runCommand(commands.build, env);
    runCommand(commands.submit, env);
  } else if (args.execute !== "none") {
    throw new Error("--execute must be one of: none, preflight, build, submit, all.");
  }

  return { manifest, paths };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareMerchantBuild(process.argv.slice(2))
    .then((result) => {
      if ("help" in result) {
        console.log(result.help);
        return;
      }
      console.log(`[merchant build] prepared ${result.manifest.locationId} ${result.manifest.profile}`);
      console.log(`- env: ${result.paths.envFile}`);
      console.log(`- manifest: ${result.paths.manifestFile}`);
      console.log(`- commands: ${result.paths.commandsFile}`);
      console.log(`- config hash: ${result.manifest.configHash}`);
    })
    .catch((error) => {
      console.error(`[merchant build] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
