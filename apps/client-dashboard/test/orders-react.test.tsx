import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOrder, type OperatorOrder } from "../src/model";

const mockOrdersState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../src/features/orders/use-orders", () => ({ useOrders: () => mockOrdersState.value }));

import { OrdersManagementPage } from "../src/features/orders/components/OrdersManagementPage";
import { StoreOrdersPage } from "../src/features/orders/components/StoreOrdersPage";

const appConfig = {
  storeCapabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true }, loyalty: { visible: true } }
} as never;

function order(id: string, status: OperatorOrder["status"], customer = "Jordan Lee"): OperatorOrder {
  return resolveOrder({
    id,
    locationId: "loc-a",
    status,
    items: [{ itemId: "latte", itemName: "Latte", quantity: 1, unitPriceCents: 650, customization: { selectedOptions: [{ groupId: "milk", groupLabel: "Milk", optionId: "oat", optionLabel: "Oat milk", priceDeltaCents: 75 }] } }],
    total: { currency: "USD", amountCents: 725 },
    pickupCode: id.slice(0, 6),
    timeline: [{ status, occurredAt: "2026-09-28T12:00:00.000Z", note: "Order confirmed" }],
    customer: { name: customer, email: "jordan@example.com", phone: "555-0100" },
    refundSummary: status === "REFUNDED" ? { state: "FULL", settledAmountCents: 725, remainingPaidAmountCents: 0, settledRefundCount: 1, allocationQuality: "COMPLETE", unverifiedRefundCount: 0 } : undefined
  });
}

const baseSession = (role: "owner" | "manager" | "store", capabilities: string[]) => ({ operator: { operatorUserId: "op-1", role, capabilities } });
const noOp = () => undefined;

function viewState(overrides: Record<string, unknown> = {}) {
  const paidOrder = order("11111111-1111-4111-8111-111111111111", "PAID");
  return {
    status: "ready", orders: [paidOrder], error: null, refreshError: null, lastRefreshedAt: Date.now(), connectionState: "connected", filter: "active", storeFilter: "all", query: "", page: 1,
    selectedOrderId: null, detailsOpen: false, detailsOpening: false, detailsClosing: false, busyOrderId: null, cancelOrderId: null, refundOrderId: null, actionError: null, actionNotice: null, soundEnabled: false, online: true,
    sessionStatus: "authenticated", session: baseSession("manager", ["orders:read", "orders:write", "payments:refund"]), selectedLocationId: "loc-a", selectedLocation: { locationId: "loc-a", locationName: "Downtown" }, availableLocations: [{ locationId: "loc-a", locationName: "Downtown", appConfig }], locationStatus: "ready", appConfig, isStore: false, canReadOrders: true, selectedOrder: null, controlsAllowed: true,
    refresh: noOp, reloadLocations: noOp, setFilter: noOp, setQuery: noOp, setPage: noOp, setStoreFilter: noOp, beginCancel: noOp, beginRefund: noOp, dismissAction: noOp, openOrder: noOp, closeOrder: noOp, advanceOrder: noOp, cancelOrder: noOp, refundOrder: noOp, enableSound: noOp,
    ...overrides
  };
}

beforeEach(() => { mockOrdersState.value = viewState(); });

describe("React Orders presentation", () => {
  it("renders manager status controls and the full order table without a local search bar", () => {
    const html = renderToStaticMarkup(<OrdersManagementPage />);
    expect(html).not.toContain("Search pickup code, customer, email");
    expect(html).toContain('aria-label="Order status filter"');
    expect(html).toContain('aria-pressed="true" class="is-active">Active</button>');
    expect(html).toContain("Payment");
    expect(html).toContain("Live orders connected");
    expect(html).toContain("111111");
    expect(html).toContain("Jordan Lee");
    expect(html).not.toContain("jordan@example.com");
    expect(html).toContain("View order details for 111111");
  });

  it("shows every order status for owners without status tabs", () => {
    const orders = ["PAID", "COMPLETED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"].map((status, index) =>
      order(`${index + 1}23456aa-1111-4111-8111-111111111111`, status as OperatorOrder["status"])
    );
    mockOrdersState.value = viewState({
      session: baseSession("owner", ["orders:read"]), orders, filter: "active"
    });
    const html = renderToStaticMarkup(<OrdersManagementPage />);
    expect(html).not.toContain('aria-label="Order status filter"');
    expect(html).not.toContain("Live orders connected");
    for (const item of orders) expect(html).toContain(`View order details for ${item.pickupCode}`);

    mockOrdersState.value = viewState({
      session: baseSession("owner", ["orders:read"]), orders, filter: "active", query: "Canceled"
    });
    const searchedHtml = renderToStaticMarkup(<OrdersManagementPage />);
    expect(searchedHtml).toContain(`View order details for ${orders[2]!.pickupCode}`);
    expect(searchedHtml).not.toContain(`View order details for ${orders[0]!.pickupCode}`);

    mockOrdersState.value = viewState({ session: baseSession("owner", ["orders:read"]), orders: [] });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain("No orders yet.");
  });

  it("uses explicit empty and filtered-empty states rather than a blank table", () => {
    mockOrdersState.value = viewState({ orders: [], status: "ready" });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain("No active orders.");
    mockOrdersState.value = viewState({ query: "missing" });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain("No orders match this search.");
  });

  it("shows a distinct read-only All Locations state while preserving owner refund eligibility", () => {
    const completed = order("22222222-2222-4222-8222-222222222222", "COMPLETED");
    mockOrdersState.value = viewState({
      orders: [completed], selectedLocationId: "all", controlsAllowed: false,
      session: baseSession("owner", ["orders:read", "payments:refund"]),
      selectedOrder: completed, selectedOrderId: completed.id, detailsOpen: true,
      filter: "all", locationStatus: "ready"
    });
    const html = renderToStaticMarkup(<OrdersManagementPage />);
    expect(html).toContain("This all-locations Orders view is read-only");
    expect(html).toContain("<span>Location</span>");
    expect(html).toContain(">Refund</button>");
    expect(html).toContain("Payment</span>");
  });

  it("hides refund information when the backend summary records no refunds", () => {
    const completed = order("22222222-2222-4222-8222-222222222222", "COMPLETED");
    completed.refundSummary = {
      state: "NONE", settledAmountCents: 0, remainingPaidAmountCents: 725,
      settledRefundCount: 0, allocationQuality: "NONE", unverifiedRefundCount: 0
    };
    mockOrdersState.value = viewState({ selectedOrder: completed, detailsOpen: true });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).not.toContain('aria-label="Refund information"');

    const refunded = order("33333333-3333-4333-8333-333333333333", "REFUNDED");
    mockOrdersState.value = viewState({ selectedOrder: refunded, detailsOpen: true });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain('aria-label="Refund information"');
  });

  it("keeps manager refunds scoped to a selected location", () => {
    const completed = order("22222222-2222-4222-8222-222222222222", "COMPLETED");
    mockOrdersState.value = viewState({
      orders: [completed], selectedLocationId: "all", controlsAllowed: false,
      session: baseSession("manager", ["orders:read", "payments:refund"]),
      selectedOrder: completed, selectedOrderId: completed.id, detailsOpen: true,
      filter: "all", locationStatus: "ready"
    });
    const allLocationsHtml = renderToStaticMarkup(<OrdersManagementPage />);
    expect(allLocationsHtml).toContain("Choose a specific location to manage this order.");
    expect(allLocationsHtml).not.toContain(">Refund</button>");

    mockOrdersState.value = viewState({
      orders: [completed], selectedLocationId: "loc-a", controlsAllowed: true,
      session: baseSession("manager", ["orders:read", "payments:refund"]),
      selectedOrder: completed, selectedOrderId: completed.id, detailsOpen: true,
      filter: "all", locationStatus: "ready"
    });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain(">Refund</button>");
  });

  it("renders the store ticket queue and keeps controls capability-aware", () => {
    mockOrdersState.value = viewState({ isStore: true, session: baseSession("store", ["orders:read", "orders:write"]), selectedLocationId: "loc-a" });
    const html = renderToStaticMarkup(<StoreOrdersPage />);
    expect(html).toContain('aria-label="Store order queue"');
    expect(html).not.toContain("orders-react-table");
    expect(html).not.toContain('aria-label="Order status filter"');
    expect(html).toContain("Start prep");
    expect(html).toContain("Enable order sound");
  });

  it("shows an explicit permission state when the user lacks order-read capability", () => {
    mockOrdersState.value = viewState({ canReadOrders: false, session: baseSession("manager", ["menu:read"]) });
    expect(renderToStaticMarkup(<OrdersManagementPage />)).toContain("You don’t have permission to view orders");
  });

  it.each([
    ["management", OrdersManagementPage],
    ["store", StoreOrdersPage]
  ] as const)("keeps loading, scope errors, and permission gates on the %s screen", (_name, Screen) => {
    mockOrdersState.value = viewState({ status: "loading", orders: [] });
    expect(renderToStaticMarkup(<Screen />)).toContain('aria-label="Loading orders"');

    mockOrdersState.value = viewState({ locationStatus: "error" });
    expect(renderToStaticMarkup(<Screen />)).toContain("Unable to load authorized locations.");

    mockOrdersState.value = viewState({ status: "error", error: "Orders are unavailable" });
    const errorHtml = renderToStaticMarkup(<Screen />);
    expect(errorHtml).toContain("Orders are unavailable");
    expect(errorHtml).not.toContain("orders-react-table");
    expect(errorHtml).not.toContain('aria-label="Store order queue"');

    mockOrdersState.value = viewState({ canReadOrders: false });
    expect(renderToStaticMarkup(<Screen />)).toContain("You don’t have permission to view orders");

    mockOrdersState.value = viewState({ sessionStatus: "signed-out" });
    expect(renderToStaticMarkup(<Screen />)).toBe("");
  });
});
