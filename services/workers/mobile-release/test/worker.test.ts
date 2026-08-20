import { describe, expect, it, vi } from "vitest";
import {
  buildMobileReleaseWorkerConfig,
  processMobileReleaseJob,
  processNextMobileReleaseJob,
  type MobileReleaseWorkerConfig,
  type MobileReleaseWorkerRuntime
} from "../src/index.js";

const job = {
  jobId: "11111111-1111-4111-8111-111111111111",
  locationId: "loc_demo",
  status: "running" as const,
  profile: "beta" as const,
  buildProfile: "beta",
  sourceCommitSha: "0123456789abcdef0123456789abcdef01234567",
  configHash: "config-hash-123",
  appStoreReviewNotes: "Performance and reliability updates.",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  startedAt: "2026-08-20T00:00:00.000Z"
};

const onboarding = {
  tenantId: "ten_demo",
  brandId: "brand_demo",
  brandName: "Demo Coffee",
  locationId: "loc_demo",
  locationName: "Flagship",
  marketLabel: "Detroit, MI",
  status: "in_progress" as const,
  readyForReview: true,
  checklist: [],
  appIdentity: {
    locationId: "loc_demo",
    appName: "Demo Coffee",
    displayName: "Demo Coffee",
    bundleIdentifier: "com.nomly.demo",
    primaryCategory: "Food & Drink",
    subtitle: "Order ahead",
    description: "A demo coffee app.",
    keywords: ["coffee"],
    privacyPolicyUrl: "https://nomly.us/privacy-policy",
    screenshotAssetUrls: [],
    targetLocationIds: ["loc_demo"],
    assetMode: "placeholder" as const,
    adminOverrideReady: false,
    readiness: { ready: true, missingRequiredFields: [] }
  },
  mobileRelease: {
    locationId: "loc_demo",
    status: "build_configuring" as const
  },
  paymentReadiness: {
    ready: true,
    onboardingState: "completed" as const,
    missingRequiredFields: []
  }
};

function config(overrides: Partial<MobileReleaseWorkerConfig> = {}): MobileReleaseWorkerConfig {
  return {
    enabled: true,
    catalogBaseUrl: "http://catalog:3002",
    gatewayToken: "gateway-token",
    intervalMs: 10_000,
    command: "echo runner",
    apiBaseUrl: "https://api-dev.nomly.us/v1",
    appVersion: "1.0.10",
    applePayMerchantId: "merchant.com.nomly.demo",
    sentryDsn: "https://example@sentry.io/1",
    sentryOrg: "nomly",
    sentryProject: "mobile",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  };
}

function runtime(overrides: Partial<MobileReleaseWorkerRuntime> = {}): MobileReleaseWorkerRuntime {
  return {
    claimJob: vi.fn(async () => job),
    getOnboarding: vi.fn(async () => onboarding),
    updateJob: vi.fn(async (_jobId, input) => ({ ...job, ...input, updatedAt: "2026-08-20T00:01:00.000Z" })),
    runCommand: vi.fn(async (_command, env) => {
      expect(env.MOBILE_RELEASE_JOB_JSON).toBeTruthy();
      expect(env.MOBILE_RELEASE_SOURCE_COMMIT_SHA).toBe(job.sourceCommitSha);
      return '{"buildId":"eas-build-1","submissionId":"eas-submission-1"}';
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  };
}

describe("mobile release worker", () => {
  it("requires the gateway token when enabled", () => {
    expect(() => buildMobileReleaseWorkerConfig({ MOBILE_RELEASE_RUNNER_ENABLED: "true" })).toThrow(
      "GATEWAY_INTERNAL_API_TOKEN"
    );
  });

  it("passes a validated merchant build manifest to the provider command", async () => {
    const result = await processMobileReleaseJob(config(), runtime(), job);
    expect(result).toEqual({ easBuildId: "eas-build-1", easSubmissionId: "eas-submission-1" });
  });

  it("marks provider failures as terminal job failures", async () => {
    const updateJob = vi.fn(async (_jobId, input) => ({ ...job, ...input, updatedAt: "2026-08-20T00:01:00.000Z" }));
    const result = await processNextMobileReleaseJob(
      config(),
      runtime({
        runCommand: vi.fn(async () => {
          throw new Error("EAS token rejected");
        }),
        updateJob
      })
    );

    expect(result).toMatchObject({ status: "failed" });
    expect(updateJob).toHaveBeenCalledWith(job.jobId, {
      status: "failed",
      errorMessage: "EAS token rejected"
    });
  });
});
