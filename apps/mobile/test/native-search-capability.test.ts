import { beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ platform: "ios", version: 1, expoUI: true }));
vi.mock("react-native", () => ({ Platform: { get OS() { return runtime.platform; } } }));
vi.mock("expo", () => ({ requireOptionalNativeModule: (name: string) => name === "NomlyGlass" ? { nativeSearchSceneVersion: runtime.version } : runtime.expoUI ? {} : null }));
import { supportsNativeSearchScene } from "../src/search/nativeSearchCapability";

describe("native Search compatibility gate", () => {
  beforeEach(() => Object.assign(runtime, { platform: "ios", version: 1, expoUI: true }));
  it("requires both the versioned extension and Expo UI", () => {
    expect(supportsNativeSearchScene()).toBe(true);
    runtime.version = 0;
    expect(supportsNativeSearchScene()).toBe(false);
    runtime.version = 1;
    runtime.expoUI = false;
    expect(supportsNativeSearchScene()).toBe(false);
  });
  it.each(["android", "web"])("preserves the existing %s scene", (platform) => {
    runtime.platform = platform;
    expect(supportsNativeSearchScene()).toBe(false);
  });
});
