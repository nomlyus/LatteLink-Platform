import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareMerchantBuild } from "../scripts/prepare-merchant-build.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

describe("merchant mobile build preparation", () => {
  it("writes a repeatable env bundle and manifest without executing EAS", async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "nomly-merchant-build-"));
    try {
      const inputPath = resolve(workspace, "merchant.json");
      await writeFile(
        inputPath,
        JSON.stringify({
          locationId: "rawaqcoffee01",
          appName: "Rawaq",
          displayName: "Rawaq",
          bundleIdentifier: "com.lattelink.rawaq.beta",
          sku: "rawaq-ios-beta",
          applePayMerchantId: "merchant.com.lattelink.rawaq.beta",
          ascAppId: "6761780971",
          apiBaseUrl: "https://api-dev.nomly.us/v1",
          appVersion: "1.0.10",
          runtimeVersion: "1.0.10",
          sentryDsn: "https://public@example.ingest.sentry.io/123",
          sentryOrg: "nomly",
          sentryProject: "mobile",
          targetLocationIds: ["rawaqcoffee01"],
          releaseNotes: "Performance optimizations, security updates, and reliability improvements."
        }),
        "utf8"
      );

      const result = await prepareMerchantBuild([
        "--input",
        inputPath,
        "--profile",
        "beta",
        "--source-commit",
        SOURCE_COMMIT,
        "--output-dir",
        resolve(workspace, "out")
      ]);

      const env = await readFile(result.paths.envFile, "utf8");
      const manifest = JSON.parse(await readFile(result.paths.manifestFile, "utf8"));
      const commands = await readFile(result.paths.commandsFile, "utf8");

      expect(env).toContain("APP_VARIANT='beta'");
      expect(env).toContain("APP_DISPLAY_NAME='Rawaq Beta'");
      expect(env).toContain("IOS_BUNDLE_IDENTIFIER='com.lattelink.rawaq.beta'");
      expect(env).toContain("EXPO_PUBLIC_LOCATION_ID='rawaqcoffee01'");
      expect(manifest).toMatchObject({
        locationId: "rawaqcoffee01",
        profile: "beta",
        sourceCommitSha: SOURCE_COMMIT,
        bundleIdentifier: "com.lattelink.rawaq.beta",
        ascAppId: "6761780971",
        appVersion: "1.0.10",
        runtimeVersion: "1.0.10"
      });
      expect(manifest.configHash).toMatch(/^[a-f0-9]{64}$/);
      expect(commands).toContain("eas integrations:asc:connect");
      expect(commands).toContain("MOBILE_RELEASE_EXECUTE");
      expect(commands).toContain("eas build --platform ios --profile beta --non-interactive --json");
      expect(commands).toContain('eas submit --platform ios --profile beta --id "${MOBILE_RELEASE_EAS_BUILD_ID}"');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
