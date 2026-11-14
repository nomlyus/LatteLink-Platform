import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "../app/dev/_layout";
import Preview from "../app/dev/[scenario]";

const runtime = vi.hoisted(() => ({ enabled: false, scenario: "confirmation", back: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ Redirect: "Redirect", Stack: Object.assign("Stack", { Screen: "Screen" }), useRouter: () => ({ back: runtime.back }), useLocalSearchParams: () => ({ scenario: runtime.scenario }) }));
vi.mock("../src/dev/previewEnabled", () => ({ get designPreviewsEnabled() { return runtime.enabled; } }));
vi.mock("react-native", () => ({ View: "View", Text: "Text", ScrollView: "ScrollView", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/ui/system", () => ({ uiPalette: {} }));
vi.mock("../src/orders/PaymentResultView", () => ({ PaymentResultView: "PaymentResult" }));
vi.mock("../src/orders/OrderReceipt", () => ({ renderOrderReceipt: () => "Receipt" }));
vi.mock("../src/account/RewardsOverview", () => ({ RewardsOverview: "Rewards" }));
vi.mock("../src/ui/ScreenState", () => ({ ScreenState: "State" }));
vi.mock("../src/dev/ProfileSetupPreview", () => ({ ProfileSetupPreview: "Profile" }));
vi.mock("../src/dev/DeleteAccountPreview", () => ({ DeleteAccountPreview: "DeletePreview" }));
vi.mock("../src/menu/CustomizeModalLoadingSheet", () => ({ CustomizeModalLoadingSheet: "ItemLoading" }));
vi.mock("../src/menu/MenuLoadingState", () => ({ LoadingMenuState: "MenuLoading" }));
vi.mock("../src/orders/OrdersLoadingState", () => ({ OrdersLoadingState: "OrdersLoading" }));
vi.mock("../src/menu/MenuCustomizeStates", () => ({ SimpleModalState: "ItemState" }));

describe("preview route boundary", () => {
  beforeEach(() => { runtime.enabled = false; runtime.scenario = "confirmation"; runtime.back.mockReset(); });
  it("rejects direct links even when a valid sample scenario is supplied", () => {
    expect(Layout()).toMatchObject({ type: "Redirect", props: { href: "/" } });
    expect(Preview()).toBeNull();
  });
  it("allows development previews but their payment actions only return to the gallery", () => {
    runtime.enabled = true;
    const screen = Preview();
    if (!screen) throw new Error("Missing preview");
    const payment = screen.props.children[2];
    expect(payment.type).toBe("PaymentResult");
    payment.props.onPrimary(); payment.props.onSecondary();
    expect(runtime.back).toHaveBeenCalledTimes(2);
  });
  it("rejects unknown scenarios without falling back to a fake successful payment", () => {
    runtime.enabled = true; runtime.scenario = "unknown";
    expect(Preview()).toMatchObject({ type: "State", props: { title: "Preview not found" } });
  });
});
