import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeCustomizationGroups } from "@lattelink/contracts-catalog";
import { NativeMenuCustomizeContent, type NativeMenuCustomizeContentProps } from "../src/menu/NativeMenuCustomizeContent";
import { normalizeCustomization } from "../src/cart/model";

vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...await original<typeof React>(),
  useState: () => [runtime.contentWidth, (width: number) => { runtime.contentWidth = width; }]
}));
vi.mock("@expo/ui/swift-ui", () => Object.fromEntries(["Button", "Host", "LabeledContent", "Picker", "Section", "Stepper", "Text", "TextField", "Toggle", "VStack"].map((name) => [name, name])));
vi.mock("@expo/ui/swift-ui/modifiers", () => Object.fromEntries(["accessibilityLabel", "buttonStyle", "controlSize", "disabled", "dynamicTypeSize", "font", "foregroundStyle", "lineLimit", "padding", "pickerStyle", "tag", "textFieldStyle"].map((name) => [name, (value: unknown) => ({ name, value })])));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" } }));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", View: "View", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }));
vi.mock("../src/ui/system", () => ({ uiPalette: { primary: "forest" } }));
vi.mock("../src/menu/catalog", () => ({ formatUsd: (value: number) => `$${(value / 100).toFixed(2)}` }));
vi.mock("../src/menu/MenuCustomizeStates", () => ({ ProductImage: "ProductImage" }));
vi.mock("../src/menu/MenuItemArtwork", () => ({ MenuItemArtwork: "MenuItemArtwork" }));
vi.mock("../src/menu/CustomizationGroupSection", () => ({ CustomizationGroupSection: "CustomizationCard" }));
vi.mock("../src/menu/MenuItemNotes", () => ({ MenuItemNotes: "UIKitNotes" }));
const runtime = vi.hoisted(() => ({ toolbar: true, contentWidth: 393 }));
vi.mock("../src/menu/MenuCustomizeToolbar", () => ({ MenuCustomizeToolbar: "NativeToolbar", get menuCustomizeToolbarAvailable() { return runtime.toolbar; } }));

const groups = normalizeCustomizationGroups([{ id: "milk", label: "Milk", selectionType: "single", required: true, minSelections: 1, maxSelections: 1, sortOrder: 0,
  options: [{ id: "dairy", label: "Dairy", default: true, priceDeltaCents: 0, sortOrder: 0, available: true }, { id: "oat", label: "Oat", priceDeltaCents: 50, sortOrder: 1, available: true }] },
{ id: "extras", label: "Extras", selectionType: "multiple", required: false, minSelections: 0, maxSelections: 2, sortOrder: 1,
  options: ["a", "b", "c"].map((id, sortOrder) => ({ id, label: id, priceDeltaCents: 0, sortOrder, available: true })) }]);

function props(): NativeMenuCustomizeContentProps {
  return { item: { id: "latte", name: "Latte", description: "Coffee", priceCents: 500, available: true, visible: true, featured: false, badgeCodes: [], customizationGroups: groups },
    customization: normalizeCustomization({ selectedOptions: [{ groupId: "milk", optionId: "dairy" }] }),
    quantity: 1, maxQuantity: 20, unitPriceCents: 500, customizationDeltaCents: 0, totalCents: 500,
    issues: [], cartLocationError: null, canAddToCart: true, onSelectOption: vi.fn(), onNotesChange: vi.fn(), onQuantityChange: vi.fn(), onAddToCart: vi.fn(), onImageReady: vi.fn() };
}

type ElementProps = Record<string, unknown> & { children?: React.ReactNode };
function nodes(node: React.ReactNode): React.ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<ElementProps>(node)) return [];
  if (typeof node.type === "function") {
    const render = node.type as (props: ElementProps) => React.ReactNode;
    return nodes(render(node.props));
  }
  return [node, ...nodes(node.props.children)];
}

describe("native item form", () => {
  beforeEach(() => { runtime.toolbar = true; runtime.contentWidth = 393; });
  it("waits for the actual sheet measurement before mounting the native toolbar", () => {
    runtime.contentWidth = 0;
    const page = NativeMenuCustomizeContent(props());
    expect(nodes(page).some((node) => node.type === "NativeToolbar")).toBe(false);
    page.props.children[2].props.onLayout({ nativeEvent: { layout: { width: 377 } } });
    const toolbar = nodes(NativeMenuCustomizeContent(props())).find((node) => node.type === "NativeToolbar");
    expect(toolbar?.props.contentWidth).toBe(377);
  });
  it("keeps native inline actions available on clients without the toolbar module", () => {
    runtime.toolbar = false;
    const all = nodes(NativeMenuCustomizeContent(props()));
    expect(all.some((node) => node.type === "NativeToolbar")).toBe(false);
    expect(all.some((node) => node.type === "Stepper")).toBe(true);
    expect(all.some((node) => node.type === "Button")).toBe(true);
  });
  it("places artwork directly in the main scroll view beneath the transparent UIKit header", () => {
    const page = NativeMenuCustomizeContent(props());
    const scroll = page.props.children[2];
    expect(scroll.type).toBe("ScrollView");
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe("never");
    expect(scroll.props.children[0].type).toBe("MenuItemArtwork");
    expect(scroll.props.children[0].props.item.name).toBe("Latte");
    expect(scroll.props.children[0].props.unitPriceCents).toBe(500);
    expect(scroll.props.children[1].type).toBe("View");
    expect(page.props.children[0].props.options.title).toBe("");
  });
  it("uses SwiftUI controls and fixed Dynamic Type without forcing a color scheme", () => {
    const all = nodes(NativeMenuCustomizeContent(props()));
    const host = all.find((node) => node.type === "Host");
    expect(host?.props.modifiers).toContainEqual({ name: "dynamicTypeSize", value: "large" });
    expect(host?.props.colorScheme).toBeUndefined();
    expect(all.some((node) => node.type === "Form")).toBe(false);
    expect(all.some((node) => node.type === "Picker")).toBe(false);
    expect(all.some((node) => node.type === "Toggle")).toBe(false);
    expect(all.filter((node) => node.type === "CustomizationCard")).toHaveLength(groups.length);
    expect(all.some((node) => node.type === "Stepper")).toBe(false);
    expect(all.some((node) => node.type === "NativeToolbar")).toBe(true);
  });
  it("routes glass-card selections, notes and quantity changes into existing React state", () => {
    const input = props();
    const all = nodes(NativeMenuCustomizeContent(input));
    const card = all.find((node) => node.type === "CustomizationCard");
    (card?.props.onSelectOption as (option: typeof groups[0]["options"][number]) => void)(groups[0].options[1]);
    expect(input.onSelectOption).toHaveBeenCalledWith(groups[0], groups[0].options[1]);
    (all.find((node) => node.type === "UIKitNotes")?.props.onChangeText as (notes: string) => void)("Less ice");
    expect(input.onNotesChange).toHaveBeenCalledWith("Less ice");
    const toolbar = all.find((node) => node.type === "NativeToolbar");
    expect(toolbar?.props).toMatchObject({ maxQuantity: 20, quantity: 1 });
    (toolbar?.props.onQuantityChange as (value: number) => void)(2);
    expect(input.onQuantityChange).toHaveBeenCalledWith(2);
  });
  it("makes optional notes a visible multiline native field with a clear accessible label", () => {
    const all = nodes(NativeMenuCustomizeContent(props()));
    const field = all.find((node) => node.type === "UIKitNotes");
    expect(field?.props.value).toBe("");
    expect(all.some((node) => node.type === "TextField")).toBe(false);
  });
  it("disables adding while scope is unavailable and preserves authoritative totals", () => {
    const input = { ...props(), canAddToCart: false, totalCents: 1350 };
    const toolbar = nodes(NativeMenuCustomizeContent(input)).find((node) => node.type === "NativeToolbar");
    expect(toolbar?.props.totalCents).toBe(1350);
    expect(toolbar?.props.canAddToCart).toBe(false);
    (toolbar?.props.onAddToCart as () => void)();
    expect(input.onAddToCart).toHaveBeenCalledOnce();
  });
  it("passes existing multiple-choice state to the original glass card", () => {
    const input = props();
    input.customization = normalizeCustomization({ selectedOptions: [{ groupId: "extras", optionId: "a" }, { groupId: "extras", optionId: "b" }] });
    const cards = nodes(NativeMenuCustomizeContent(input)).filter((node) => node.type === "CustomizationCard");
    expect(cards[1].props.customization).toBe(input.customization);
    expect(cards[1].props.group).toBe(groups[1]);
    (cards[1].props.onSelectOption as (option: typeof groups[1]["options"][number]) => void)(groups[1].options[0]);
    expect(input.onSelectOption).toHaveBeenCalledWith(groups[1], groups[1].options[0]);
  });
});
