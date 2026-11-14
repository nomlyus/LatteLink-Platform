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

describe("SDK 58 upgrade boundaries", () => {
  it("includes the SDK-matched development client and physical-device Metro discovery", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.dependencies["expo-dev-client"]).toBe("~58.0.14");
    expect(manifest.scripts["dev:client"]).toBe("expo start --dev-client");
    const info = read("ios/LatteLinkBeta/Info.plist");
    expect(info).toContain("NSLocalNetworkUsageDescription");
    expect(info).toContain("<string>_expo._tcp</string>");
    expect(info).toContain("<string>$(EXPO_SCHEME)</string>");
  });

  it("uses the fixed SDK / React Native engine combination without compatibility exclusions", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(manifest.dependencies.expo).toBe("~58.0.16");
    expect(manifest.dependencies["react-native"]).toBe("0.88.0");
    expect(manifest.dependencies.react).toBe("19.3.1");
    expect(manifest.dependencies["react-native-worklets"]).toBe("0.13.0");
    expect(manifest.dependencies["react-native-reanimated"]).toBe("4.7.1");
    expect(manifest.dependencies["react-native-screens"]).toBe("~4.30.0");
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
    expect(defaults.version).toBe("1.4.0");
    expect(defaults.ios?.runtimeVersion).toBe("1.4.0");
    expect(read("ios/LatteLinkBeta/Supporting/Expo.plist")).toContain("<string>1.4.0</string>");
    vi.stubEnv("APP_RUNTIME_VERSION", "merchant-sdk58-runtime");
    vi.resetModules();
    const { default: configured } = await import("../app.config");
    expect(configured.ios?.runtimeVersion).toBe("merchant-sdk58-runtime");
  });

  it("aligns native deployment/framework settings while retaining Apple Pay and production configuration", () => {
    const properties = JSON.parse(read("ios/Podfile.properties.json"));
    expect(properties["ios.deploymentTarget"]).toBe("16.4");
    expect(properties["ios.useFrameworks"]).toBe("dynamic");
    expect(properties.EXPO_USE_PRECOMPILED_MODULES).toBe("false");
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

  it("keeps native and config-plugin module linkage compatible with Stripe SwiftPM", async () => {
    const { default: config } = await import("../app.config");
    expect(config.plugins).toContainEqual([
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.4",
          useFrameworks: "dynamic",
          usePrecompiledModules: false
        }
      }
    ]);
  });

  it("retains the resolved SDK 58 native graph and Stripe framework embedding", () => {
    const project = read("ios/LatteLinkBeta.xcodeproj/project.pbxproj");
    expect(project).toContain("[stripe-react-native] Embed SPM Frameworks");
    expect(project).toContain("Pods-LatteLinkBeta.releaseproduction.xcconfig");
    expect(project).not.toContain("react-native@0.81.");
    const pods = read("ios/Podfile.lock");
    expect(pods).toContain("React-Core (0.88.0)");
    expect(pods).toContain("RNReanimated (4.7.1)");
    expect(pods).toContain("RNWorklets (0.13.0)");
    expect(pods).toContain("stripe-react-native/Core (0.82.0)");
    const resolved = JSON.parse(read("ios/LatteLinkBeta.xcworkspace/xcshareddata/swiftpm/Package.resolved"));
    expect(resolved.pins).toContainEqual(
      expect.objectContaining({
        identity: "stripe-ios-spm",
        state: expect.objectContaining({ version: "26.14.0" })
      })
    );
  });

  it("starts React Native once through the scene lifecycle and retains native URL forwarding", () => {
    const delegate = read("ios/LatteLinkBeta/AppDelegate.swift");
    expect(delegate).toContain("ExpoReactNativeFactoryProvider");
    expect(delegate).toContain("class SceneDelegate: ExpoAppSceneDelegate");
    expect(delegate).not.toContain("factory.startReactNative(");
    expect(delegate).not.toContain("RCTLinkingManager.application(");
    const info = read("ios/LatteLinkBeta/Info.plist");
    expect(info).toContain("UIApplicationSceneManifest");
    expect(info).toContain("$(PRODUCT_MODULE_NAME).SceneDelegate");
  });

  it("builds a new development runtime on the supported SDK 58 image", () => {
    const eas = JSON.parse(read("eas.json"));
    expect(eas.build.base.ios.image).toBe("macos-tahoe-26.6-xcode-27.0");
    expect(eas.build.development.env.APP_RUNTIME_VERSION).toBe("1.4.0");
    expect(eas.build.development.env.APP_VERSION).toBe("1.4.0");
    expect(eas.build.development.env.APP_VARIANT).toBe("beta");
    expect(eas.build.production.ios.buildConfiguration).toBe("ReleaseProduction");
  });
});
