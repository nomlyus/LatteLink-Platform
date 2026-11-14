import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchLayout from "../app/(tabs)/(navigation)/search/_layout";

vi.stubGlobal("React", React);
const runtime = vi.hoisted(() => ({ available: false, push: vi.fn(), options: vi.fn() }));
vi.mock("expo-router", () => ({ Stack: "NativeStack", useRouter: () => ({ push: runtime.push }) }));
vi.mock("../src/navigation/nativeAppleHeader", () => ({ nativeAppleHeaderCapabilities: () => ({ available: runtime.available, nativeBarMinimization: true }) }));
vi.mock("../src/search/nativeAppleSearchHeaderOptions", () => ({ nativeAppleSearchHeaderOptions: (open: () => void, minimization: boolean) => {
  runtime.options(open, minimization);
  return { headerShown: true, title: "Search", nativeInline: true };
} }));

describe("Search header initialization", () => {
  beforeEach(() => { runtime.available = false; vi.clearAllMocks(); });
  it("hides the outer header before lazy native content loads and never defaults to index", () => {
    const layout = SearchLayout();
    expect(layout.props.screenOptions).toEqual({ headerShown: false, title: "Search" });
  });
  it("initializes the single native inline header before capable clients render the page", () => {
    runtime.available = true;
    expect(SearchLayout().props.screenOptions).toEqual({ headerShown: true, title: "Search", nativeInline: true });
    expect(runtime.options).toHaveBeenCalledWith(expect.any(Function), true);
    runtime.options.mock.calls[0][0]();
    expect(runtime.push).toHaveBeenCalledWith("/(tabs)/account");
  });
});
