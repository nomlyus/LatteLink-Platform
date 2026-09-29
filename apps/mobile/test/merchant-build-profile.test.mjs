import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareMerchantBuild } from "../scripts/prepare-merchant-build.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const EAS_CONFIG_PATH = new URL("../eas.json", import.meta.url);

describe("merchant mobile build preparation", () => {
  it("marks EAS beta and production builds as releases and does not pin another merchant's ASC app", async () => {
    const config = JSON.parse(await readFile(EAS_CONFIG_PATH, "utf8"));

    expect(config.build.beta.env).toMatchObject({ APP_VARIANT: "beta", EXPO_PUBLIC_APP_VARIANT: "beta" });
    expect(config.build.production.env).toMatchObject({ APP_VARIANT: "production", EXPO_PUBLIC_APP_VARIANT: "production" });
    expect(config.submit.beta.ios.ascAppId).toBeUndefined();
    expect(config.submit.production.ios.ascAppId).toBeUndefined();
  });

  it("writes a repeatable env bundle and manifest without executing EAS", async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "nomly-merchant-build-"));
    try {
      const inputPath = resolve(workspace, "merchant.json");
      await writeFile(
        inputPath,
        JSON.stringify({
          brandId: "rawaqcoffee",
          locationId: "rawaqcoffee01",
          appName: "Rawaq",
          displayName: "Rawaq",
          iconPath: "./assets/icon.png",
          splashPath: "./assets/splash.png",
          expoSlug: "rawaqcoffee",
          scheme: "rawaq",
          easProjectId: "a3e51f78-120f-4d9a-a001-81b040a3d600",
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
      expect(env).toContain("EXPO_PUBLIC_APP_DISPLAY_NAME='Rawaq Beta'");
      expect(env).toContain("IOS_BUNDLE_IDENTIFIER='com.lattelink.rawaq.beta'");
      expect(env).toContain("EXPO_PUBLIC_BRAND_ID='rawaqcoffee'");
      expect(env).not.toContain("EXPO_PUBLIC_LOCATION_ID");
      expect(env).toContain("EXPO_SLUG='rawaqcoffee'");
      expect(env).toContain("EXPO_SCHEME='rawaq'");
      expect(env).toContain("EAS_PROJECT_ID='a3e51f78-120f-4d9a-a001-81b040a3d600'");
      expect(manifest).toMatchObject({
        brandId: "rawaqcoffee",
        locationId: "rawaqcoffee01",
        profile: "beta",
        sourceCommitSha: SOURCE_COMMIT,
        bundleIdentifier: "com.lattelink.rawaq.beta",
        expoSlug: "rawaqcoffee",
        scheme: "rawaq",
        easProjectId: "a3e51f78-120f-4d9a-a001-81b040a3d600",
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

  it("prepares a second brand identity from the same build source without merchant-specific edits", async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "nomly-second-brand-build-"));
    try {
      const inputPath = resolve(workspace, "brand-b.json");
      await writeFile(inputPath, JSON.stringify({
        brandId: "harbor-coffee",
        locationId: "harbor-downtown",
        appName: "Harbor Coffee",
        displayName: "Harbor Coffee",
        iconPath: "./test/fixtures/brand-b-icon.png",
        splashPath: "./test/fixtures/brand-b-splash.png",
        expoSlug: "harbor-coffee",
        scheme: "harborcoffee",
        easProjectId: "c9c4ea4f-84af-4e07-bb68-4b6cc9737427",
        bundleIdentifier: "com.harborcoffee.mobile.beta",
        applePayMerchantId: "merchant.com.harborcoffee.mobile.beta",
        apiBaseUrl: "https://api-dev.nomly.us/v1",
        appVersion: "1.0.0",
        sentryDsn: "https://public@example.ingest.sentry.io/123",
        sentryOrg: "nomly",
        sentryProject: "mobile"
      }), "utf8");

      const result = await prepareMerchantBuild([
        "--input", inputPath,
        "--profile", "beta",
        "--source-commit", SOURCE_COMMIT,
        "--output-dir", resolve(workspace, "out")
      ]);
      const env = await readFile(result.paths.envFile, "utf8");
      expect(env).toContain("EXPO_PUBLIC_BRAND_ID='harbor-coffee'");
      expect(env).toContain("IOS_BUNDLE_IDENTIFIER='com.harborcoffee.mobile.beta'");
      expect(env).toContain("EXPO_PUBLIC_APP_DISPLAY_NAME='Harbor Coffee Beta'");
      expect(env).toContain("EXPO_PUBLIC_APP_ICON_PATH='./test/fixtures/brand-b-icon.png'");
      expect(env).toContain("EXPO_PUBLIC_APP_SPLASH_PATH='./test/fixtures/brand-b-splash.png'");
      expect(env).toContain("EXPO_SLUG='harbor-coffee'");
      expect(env).toContain("EXPO_SCHEME='harborcoffee'");
      expect(env).not.toMatch(/rawaq|lattelink/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
