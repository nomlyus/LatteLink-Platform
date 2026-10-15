import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mobileRoot = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(mobileRoot, path), "utf8");

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", "local");
  vi.stubEnv("EAS_BUILD_PROFILE", undefined);
  vi.stubEnv("APP_VERSION", undefined);
  vi.stubEnv("APP_RUNTIME_VERSION", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("SDK 57 upgrade boundaries", () => {
  it("uses the fixed SDK / React Native engine combination without compatibility exclusions", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.dependencies.expo).toBe("~57.0.29");
    expect(manifest.dependencies["react-native"]).toBe("0.86.3");
    expect(manifest.dependencies.react).toBe("19.2.3");
    expect(manifest.dependencies["react-native-worklets"]).toBe("0.10.1");
    expect(manifest.dependencies["react-native-reanimated"]).toBe("4.5.1");
    expect(manifest.expo?.install?.exclude).toBeUndefined();
    expect(read("babel.config.js")).toContain('"react-native-worklets/plugin"');
  });

  it("preserves splash appearance and keeps the compiler off", async () => {
    const { default: config } = await import("../app.config");
    expect(config.experiments?.reactCompiler).toBe(false);
    expect(config.plugins).toContainEqual([
      "expo-splash-screen",
      expect.objectContaining({
        resizeMode: "contain",
        backgroundColor: "#F7F4ED",
        enableFullScreenImage_legacy: true
      })
    ]);
  });

  it("starts a new default runtime while retaining explicit merchant runtime inputs", async () => {
    const { default: defaults } = await import("../app.config");
    expect(defaults.version).toBe("1.3.0");
    expect(defaults.ios?.runtimeVersion).toBe("1.3.0");
    expect(read("ios/LatteLinkBeta/Supporting/Expo.plist")).toContain("<string>1.3.0</string>");
    vi.stubEnv("APP_RUNTIME_VERSION", "merchant-sdk57-runtime");
    vi.resetModules();
    const { default: configured } = await import("../app.config");
    expect(configured.ios?.runtimeVersion).toBe("merchant-sdk57-runtime");
  });

  it("aligns native deployment/framework settings while retaining Apple Pay and production configuration", () => {
    const properties = JSON.parse(read("ios/Podfile.properties.json"));
    expect(properties["ios.deploymentTarget"]).toBe("16.4");
    expect(properties["ios.useFrameworks"]).toBe("dynamic");
    const project = read("ios/LatteLinkBeta.xcodeproj/project.pbxproj");
    const targets = project.match(/IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g);
    expect(targets).toHaveLength(6);
    expect(targets?.every((target) => target.endsWith("16.4;"))).toBe(true);
    expect(project).toContain("ReleaseProduction");
    expect(project).toContain("ApplePayModule.swift");
    expect(project).toContain("ApplePayModuleBridge.m");
    expect(read("ios/LatteLinkBeta/AppDelegate.swift")).not.toContain("bindReactNativeFactory");
    expect(properties["expo.useHermesV1"]).toBeUndefined();
    expect(properties.newArchEnabled).toBeUndefined();
  });
});
