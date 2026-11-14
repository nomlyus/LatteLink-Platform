import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { PaymentResultView } from "../src/orders/PaymentResultView";
import { previewConfirmation, previewFailure } from "../src/dev/designPreviews";

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({ View: "View", Text: "Text", ScrollView: "Scroll", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
vi.mock("expo-symbols", () => ({ SymbolView: "Symbol" }));
vi.mock("../src/ui/system", () => ({ Button: "Button", uiPalette: {} }));
vi.mock("../src/ui/NativeCornerView", () => ({ NativeCornerView: "NativeCorners" }));
vi.mock("../src/menu/catalog", () => ({ formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}` }));

function nodes(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}
describe("shared live and preview payment layout", () => {
  it("shows the real confirmed code and total without inventing loyalty from the price", () => {
    const screen = PaymentResultView({ kind: "confirmation", confirmation: previewConfirmation, onPrimary: vi.fn(), onSecondary: vi.fn() });
    const all = nodes(screen);
    expect(all.find((node) => node.props.label === "Pickup code")?.props.value).toBe("DEMO");
    expect(all.find((node) => node.props.label === "Total")?.props.value).toBe("$9.50");
    expect(all.some((node) => node.props.label === "Points Earned")).toBe(false);
    expect(all.find((node) => node.type === "Scroll")?.props.contentContainerStyle).not.toHaveProperty("flex", 1);
  });
  it("hides pickup instructions until confirmation and retains deliberate next actions", () => {
    const primary = vi.fn(); const secondary = vi.fn();
    const screen = PaymentResultView({ kind: "confirmation", pending: true, onPrimary: primary, onSecondary: secondary });
    const all = nodes(screen);
    expect(all.some((node) => node.props.label === "Pickup code")).toBe(false);
    const action = all.find((node) => node.props.label === "View orders");
    (action?.props.onPress as () => void)();
    expect(primary).toHaveBeenCalledOnce();
  });
  it("offers cart recovery for an interrupted payment", () => {
    const recover = vi.fn();
    const screen = PaymentResultView({ kind: "failure", failure: previewFailure, onPrimary: recover, onSecondary: vi.fn() });
    const action = nodes(screen).find((node) => node.props.label === "Return to cart");
    (action?.props.onPress as () => void)();
    expect(recover).toHaveBeenCalledOnce();
  });
});
