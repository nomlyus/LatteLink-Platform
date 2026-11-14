import * as React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import SearchRoute from "../app/(tabs)/(navigation)/search/index";

const runtime = vi.hoisted(() => ({ nativeHeader: true }));
vi.stubGlobal("React", React);
vi.mock("../src/navigation/TabScreen", () => ({ TabScreen: "TabScreen" }));
vi.mock("../src/navigation/nativeAppleHeader", () => ({
  nativeAppleHeaderCapabilities: () => ({ available: runtime.nativeHeader })
}));
vi.mock("../src/search/nativeSearchCapability", () => ({ supportsNativeSearchScene: () => false }));
vi.mock("../src/search/NativeAppleSearchPreview", () => ({ NativeAppleSearchPreview: "NativeSearch" }));
vi.mock("../src/search/SearchScene", () => ({ SearchScene: "FallbackSearch" }));

describe("eager Search route", () => {
  it("renders the supported native screen directly, without an asynchronous placeholder", () => {
    runtime.nativeHeader = true;
    const route = SearchRoute();
    expect(route.type).toBe("TabScreen");
    expect(route.props.children.type).toBe("NativeSearch");
  });

  it("renders the unsupported-client fallback immediately", () => {
    runtime.nativeHeader = false;
    expect(SearchRoute().props.children.type).toBe("FallbackSearch");
  });

  it("has no async import or Suspense boundary and guards the native header capability", () => {
    const source = readFileSync(new URL("../app/(tabs)/(navigation)/search/index.tsx", import.meta.url), "utf8");
    const runtimeSource = source.replace(/typeof import\([^)]*\)/g, "");
    expect(runtimeSource).not.toMatch(/\blazy\s*\(|\bSuspense\b|\bimport\s*\(/);
    expect(source).toContain("if (nativeAppleHeaderCapabilities().available)");
  });
});
