import * as React from "react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FooterPill, FooterQuantityPill } from "../src/menu/MenuCustomizeFooter";

const runtime = vi.hoisted(() => ({ glass: true }));
vi.stubGlobal("React", React);
vi.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", Platform: { OS: "ios" }, StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("expo-glass-effect", () => ({ GlassView: "GlassView" }));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/glass", () => ({ canUseLiquidGlass: () => runtime.glass }));
vi.mock("../src/ui/system", () => ({ uiPalette: { surfaceStrong: "system-surface", border: "system-separator", text: "system-label", textMuted: "system-muted-label" } }));

function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}

describe("item customization material", () => {
  beforeEach(() => { runtime.glass = true; });
  it("lets native Liquid Glass follow the system appearance", () => {
    const glass = nodes(FooterPill({ children: "Add to cart" })).find((node) => node.type === "GlassView");
    expect(glass?.props).toMatchObject({ glassEffectStyle: "regular", colorScheme: "auto", isInteractive: true });
  });
  it("uses adaptive material and surface colors on clients without Liquid Glass", () => {
    runtime.glass = false;
    const all = nodes(FooterPill({ children: "Add to cart" }));
    const blur = all.find((node) => node.type === "BlurView");
    expect(blur?.props.tint).toBe("systemMaterial");
    expect(all.some((node) => Array.isArray(node.props.style) && node.props.style.some((style: { backgroundColor?: string }) => style?.backgroundColor === "system-surface"))).toBe(true);
  });
  it("preserves quantity limits and native plus/minus controls", () => {
    const decrease = vi.fn();
    const increase = vi.fn();
    const all = nodes(FooterQuantityPill({ quantity: 1, canDecrease: false, canIncrease: true, onDecrease: decrease, onIncrease: increase }));
    const minus = all.find((node) => node.props.accessibilityLabel === "Decrease quantity");
    const plus = all.find((node) => node.props.accessibilityLabel === "Increase quantity");
    expect(minus?.props.disabled).toBe(true);
    expect(plus?.props.disabled).toBe(false);
    (plus?.props.onPress as () => void)();
    expect(increase).toHaveBeenCalledOnce();
    expect(all.filter((node) => node.type === "Symbol").map((node) => node.props.name)).toEqual([{ ios: "minus", android: "remove" }, { ios: "plus", android: "add" }]);
  });
  it("uses one shared native sheet surface and native corners without a grabber", () => {
    const route = readFileSync(new URL("../app/menu-customize.tsx", import.meta.url), "utf8");
    expect(route).toContain("<NativeSheetSurface><SafeAreaProvider><MenuCustomizeHeader /><MenuCustomizeContent /></SafeAreaProvider></NativeSheetSurface>");
    expect(route).not.toContain("borderTopLeftRadius");
    expect(route).not.toContain("styles.handleWrap");
    const root = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
    const options = root.slice(root.indexOf('name="menu-customize"'), root.indexOf('name="checkout-success"'));
    expect(options).toContain('presentation: "formSheet"');
    expect(options).toContain("...menuCustomizeHeaderOptions");
    expect(options).toContain("sheetGrabberVisible: false");
    expect(options).not.toContain("sheetCornerRadius");
  });
});
