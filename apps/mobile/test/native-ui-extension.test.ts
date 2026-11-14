import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("native UI integration source invariants (not native compilation)", () => {
  it("links the full maintained Expo UI module instead of a one-screen native shim", () => {
    expect(read("modules/nomly-glass/ios/NomlyGlass.podspec")).toContain("s.dependency 'ExpoUI'");
    const module = read("modules/nomly-glass/ios/NomlyGlassModule.swift");
    expect(module).toContain('ViewModifierRegistry.register("nomlySearchable")');
    expect(module).toContain('ViewModifierRegistry.unregister("nomlySearchable")');
    expect(module).toContain('Constant("nativeSearchSceneVersion")');
  });
  it("uses the existing native stack and input without a second results implementation", () => {
    const scene = read("src/search/NativeAppleSearchPreview.tsx");
    expect(scene).toContain("headerSearchBarOptions");
    expect(scene).toContain("useSearchFocus()");
    expect(scene).toContain("<CatalogSearchResults query={query} />");
    expect(scene).not.toContain("SearchContent");
    expect(scene).not.toContain("NavigationStack");
  });
  it("native input owns focus and guards deferred work after disposal", () => {
    const source = read("modules/nomly-glass/ios/SearchableModifier.swift");
    expect(source).toContain('@FocusState private var focused');
    expect(source).toContain('case .toggle: shouldFocus = !(focused || presented)');
    expect(source).toContain('guard !Task.isCancelled else { return }');
    expect(source).toContain('.onDisappear { focused = false; presented = false }');
    expect(source).toContain('.onChange(of: configuration.textRevision)');
  });
});
