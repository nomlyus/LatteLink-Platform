import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  mobileReleaseBuildJobClaimResponseSchema,
  mobileReleaseBuildJobSchema,
  onboardingSummarySchema,
  type MobileReleaseBuildJob,
  type MobileReleaseBuildJobUpdate,
  type OnboardingSummary
} from "@lattelink/contracts-catalog";
import { captureOperationalError, initializeSentry } from "@lattelink/observability";

type Logger = Pick<Console, "info" | "warn" | "error">;

export type MobileReleaseWorkerConfig = {
  enabled: boolean;
  catalogBaseUrl: string;
  gatewayToken: string;
  intervalMs: number;
  command: string;
  apiBaseUrl: string;
  appVersion: string;
  applePayMerchantId: string;
  sentryDsn: string;
  sentryOrg: string;
  sentryProject: string;
  logger: Logger;
};

export type MobileReleaseWorkerRuntime = {
  claimJob: () => Promise<MobileReleaseBuildJob | undefined>;
  getOnboarding: (locationId: string) => Promise<OnboardingSummary>;
  updateJob: (jobId: string, input: MobileReleaseBuildJobUpdate) => Promise<MobileReleaseBuildJob>;
  runCommand: (command: string, env: NodeJS.ProcessEnv) => Promise<string>;
  logger: Logger;
};

function trim(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function integerEnv(name: string, value: string | undefined, fallback: number, minimum: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return parsed;
}

function booleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function buildMobileReleaseWorkerConfig(env: NodeJS.ProcessEnv = process.env): MobileReleaseWorkerConfig {
  const enabled = booleanEnv(env.MOBILE_RELEASE_RUNNER_ENABLED, true);
  const catalogBaseUrl = trim(env.CATALOG_SERVICE_BASE_URL) ?? "http://127.0.0.1:3002";
  const gatewayToken = trim(env.GATEWAY_INTERNAL_API_TOKEN) ?? "";
  const command = trim(env.MOBILE_RELEASE_RUNNER_COMMAND) ?? "";
  const apiBaseUrl = trim(env.MOBILE_RELEASE_API_BASE_URL) ?? "";
  const appVersion = trim(env.MOBILE_RELEASE_APP_VERSION) ?? "1.0.0";
  const applePayMerchantId = trim(env.MOBILE_RELEASE_APPLE_PAY_MERCHANT_ID) ?? "";
  const sentryDsn = trim(env.MOBILE_RELEASE_SENTRY_DSN) ?? "";
  const sentryOrg = trim(env.MOBILE_RELEASE_SENTRY_ORG) ?? "";
  const sentryProject = trim(env.MOBILE_RELEASE_SENTRY_PROJECT) ?? "";
  new URL(catalogBaseUrl);

  if (enabled && !gatewayToken) {
    throw new Error("GATEWAY_INTERNAL_API_TOKEN must be set when the mobile release runner is enabled");
  }

  return {
    enabled,
    catalogBaseUrl: catalogBaseUrl.replace(/\/+$/, ""),
    gatewayToken,
    intervalMs: integerEnv("MOBILE_RELEASE_RUNNER_INTERVAL_MS", env.MOBILE_RELEASE_RUNNER_INTERVAL_MS, 10_000, 1_000),
    command,
    apiBaseUrl,
    appVersion,
    applePayMerchantId,
    sentryDsn,
    sentryOrg,
    sentryProject,
    logger: console
  };
}

function internalHeaders(config: MobileReleaseWorkerConfig) {
  return {
    "content-type": "application/json",
    "x-gateway-token": config.gatewayToken,
    "user-agent": "nomly-mobile-release-worker/1"
  };
}

async function readJson(response: Response) {
  const body = await response.text();
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

async function requestJson<T>(config: MobileReleaseWorkerConfig, path: string, init: RequestInit, parse: (value: unknown) => T) {
  const response = await fetch(`${config.catalogBaseUrl}${path}`, {
    ...init,
    headers: { ...internalHeaders(config), ...(init.headers ?? {}) }
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return parse(payload);
}

function createHttpRuntime(config: MobileReleaseWorkerConfig): MobileReleaseWorkerRuntime {
  return {
    async claimJob() {
      const response = await requestJson(
        config,
        "/v1/catalog/internal/mobile-release/build-jobs/claim",
        { method: "POST", body: JSON.stringify({}) },
        (value) => mobileReleaseBuildJobClaimResponseSchema.parse(value)
      );
      return response.job;
    },
    async getOnboarding(locationId) {
      return requestJson(
        config,
        `/v1/catalog/internal/locations/${encodeURIComponent(locationId)}/onboarding`,
        { method: "GET" },
        (value) => onboardingSummarySchema.parse(value)
      );
    },
    async updateJob(jobId, input) {
      return requestJson(
        config,
        `/v1/catalog/internal/mobile-release/build-jobs/${encodeURIComponent(jobId)}`,
        { method: "PATCH", body: JSON.stringify(input) },
        (value) => mobileReleaseBuildJobSchema.parse(value)
      );
    },
    runCommand: (command, env) => runShellCommand(command, env, config.logger),
    logger: config.logger
  };
}

function runShellCommand(command: string, env: NodeJS.ProcessEnv, logger: Logger) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      logger.info(`[mobile-release] ${chunk.toString().trimEnd()}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      logger.warn(`[mobile-release] ${chunk.toString().trimEnd()}`);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`Mobile release command exited with code ${code ?? "unknown"}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

function buildMerchantInput(config: MobileReleaseWorkerConfig, job: MobileReleaseBuildJob, onboarding: OnboardingSummary) {
  const identity = onboarding.appIdentity;
  if (!identity?.readiness.ready || !identity.appName || !identity.bundleIdentifier) {
    throw new Error(`App identity is not ready: ${identity?.readiness.missingRequiredFields.join(", ") || "profile missing"}`);
  }
  if (!config.apiBaseUrl || !config.applePayMerchantId || !config.sentryDsn || !config.sentryOrg || !config.sentryProject) {
    throw new Error("Mobile release runner environment is incomplete: API base URL, Apple Pay merchant ID, and Sentry settings are required");
  }

  return {
    locationId: job.locationId,
    appName: identity.appName,
    displayName: identity.displayName,
    bundleIdentifier: identity.bundleIdentifier,
    sku: identity.sku,
    primaryCategory: identity.primaryCategory,
    subtitle: identity.subtitle,
    description: identity.description,
    keywords: identity.keywords,
    supportUrl: identity.supportUrl,
    privacyPolicyUrl: identity.privacyPolicyUrl ?? "https://nomly.us/privacy-policy",
    marketingUrl: identity.marketingUrl,
    iconAssetUrl: identity.iconAssetUrl,
    splashAssetUrl: identity.splashAssetUrl,
    screenshotAssetUrls: identity.screenshotAssetUrls,
    targetLocationIds: identity.targetLocationIds,
    assetMode: identity.assetMode,
    applePayMerchantId: config.applePayMerchantId,
    apiBaseUrl: config.apiBaseUrl,
    appVersion: config.appVersion,
    sentryDsn: config.sentryDsn,
    sentryOrg: config.sentryOrg,
    sentryProject: config.sentryProject,
    releaseNotes: job.appStoreReviewNotes,
    appStoreReviewNotes: job.appStoreReviewNotes
  };
}

function parseProviderIds(output: string) {
  const candidates = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  for (const candidate of candidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const easBuildId = typeof parsed.buildId === "string" ? parsed.buildId : typeof parsed.id === "string" ? parsed.id : undefined;
      const easSubmissionId = typeof parsed.submissionId === "string" ? parsed.submissionId : undefined;
      if (easBuildId || easSubmissionId) return { easBuildId, easSubmissionId };
    } catch {
      // Provider output is best-effort metadata; the job result remains authoritative.
    }
  }
  return {};
}

export async function processMobileReleaseJob(config: MobileReleaseWorkerConfig, runtime: MobileReleaseWorkerRuntime, job: MobileReleaseBuildJob) {
  if (!config.command) {
    throw new Error("MOBILE_RELEASE_RUNNER_COMMAND is not configured; set it to the approved EAS runner command");
  }

  const onboarding = await runtime.getOnboarding(job.locationId);
  const merchantInput = buildMerchantInput(config, job, onboarding);
  const workspace = await mkdtemp(join(tmpdir(), "nomly-mobile-release-"));
  const inputPath = join(workspace, `${job.locationId}-${randomUUID()}.json`);
  try {
    await writeFile(inputPath, `${JSON.stringify(merchantInput, null, 2)}\n`, "utf8");
    const output = await runtime.runCommand(config.command, {
      MOBILE_RELEASE_JOB_JSON: inputPath,
      MOBILE_RELEASE_JOB_ID: job.jobId,
      MOBILE_RELEASE_LOCATION_ID: job.locationId,
      MOBILE_RELEASE_PROFILE: job.profile,
      MOBILE_RELEASE_BUILD_PROFILE: job.buildProfile,
      MOBILE_RELEASE_SOURCE_COMMIT_SHA: job.sourceCommitSha,
      MOBILE_RELEASE_CONFIG_HASH: job.configHash
    });
    return parseProviderIds(output);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function processNextMobileReleaseJob(config: MobileReleaseWorkerConfig, runtime: MobileReleaseWorkerRuntime) {
  const job = await runtime.claimJob();
  if (!job) return undefined;

  try {
    const providerIds = await processMobileReleaseJob(config, runtime, job);
    await runtime.updateJob(job.jobId, { status: "succeeded", ...providerIds });
    runtime.logger.info(`[mobile-release] completed ${job.jobId} (${job.locationId})`);
    return { jobId: job.jobId, status: "succeeded" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await runtime.updateJob(job.jobId, { status: "failed", errorMessage: message.slice(0, 1_000) });
    runtime.logger.error(`[mobile-release] failed ${job.jobId}: ${message}`);
    return { jobId: job.jobId, status: "failed" as const, errorMessage: message };
  }
}

export function startMobileReleaseWorker(config: MobileReleaseWorkerConfig, runtime: MobileReleaseWorkerRuntime) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cycle = async () => {
    if (stopped) return;
    try {
      await processNextMobileReleaseJob(config, runtime);
    } catch (error) {
      captureOperationalError({
        service: "mobile-release-worker",
        event: "worker.cycle_failed",
        error,
        fingerprint: ["mobile-release-worker", "cycle-failed"]
      });
      runtime.logger.error("[mobile-release] cycle failed", error);
    } finally {
      if (!stopped) timer = setTimeout(() => void cycle(), config.intervalMs);
    }
  };

  void cycle();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}

initializeSentry({ service: "mobile-release-worker" });

if (import.meta.url === `file://${process.argv[1]}`) {
  let worker: { stop: () => void } | undefined;
  try {
    const config = buildMobileReleaseWorkerConfig();
    if (!config.enabled) {
      console.info("[mobile-release] disabled by MOBILE_RELEASE_RUNNER_ENABLED=false");
    } else {
      worker = startMobileReleaseWorker(config, createHttpRuntime(config));
    }
    const shutdown = () => worker?.stop();
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    captureOperationalError({
      service: "mobile-release-worker",
      event: "worker.fatal",
      error,
      fingerprint: ["mobile-release-worker", "fatal"]
    });
    console.error("[mobile-release] fatal", error);
    process.exit(1);
  }
}
