import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";
import { resolveOrder, type OperatorOrder } from "../src/model";
import { state } from "../src/state";

const subscribeToAdminOrderStream = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  subscribeToAdminOrderStream
}));
vi.mock("../src/render", () => ({ render }));

const order = (id: string, locationId: string): OperatorOrder => resolveOrder({
  id,
  locationId,
  status: "PAID",
  items: [],
  total: { currency: "USD", amountCents: 1200 },
  pickupCode: "A1B2C3",
  timeline: [{ status: "PAID", occurredAt: "2026-09-22T12:00:00.000Z" }]
});

describe("operator order runtime", () => {
  afterEach(async () => {
    const { stopAutoRefresh } = await import("../src/orders-runtime");
    stopAutoRefresh();
    state.session = null;
    state.selectedLocationId = null;
    state.orders = [];
    state.selectedOrderId = null;
    state.loading = false;
    subscribeToAdminOrderStream.mockReset();
    render.mockReset();
    vi.unstubAllGlobals();
  });

  it("replaces stale orders from a reconnect snapshot and rejects another location's events", async () => {
    vi.stubGlobal("window", {});
    subscribeToAdminOrderStream.mockReturnValue(vi.fn());
    state.session = {
      operator: { operatorUserId: "operator-1", role: "owner", capabilities: ["orders:read"] }
    } as unknown as OperatorSession;
    state.selectedLocationId = "location-a";
    state.orders = [order("11111111-1111-4111-8111-111111111111", "location-a")];
    const { startAutoRefresh } = await import("../src/orders-runtime");
    startAutoRefresh(vi.fn());
    const callbacks = subscribeToAdminOrderStream.mock.calls[0]?.[0];
    const current = order("22222222-2222-4222-8222-222222222222", "location-a");
    callbacks.onEvent({ type: "snapshot", orders: [current, order("33333333-3333-4333-8333-333333333333", "location-b")] });
    expect(state.orders.map((item) => item.id)).toEqual([current.id]);
    callbacks.onEvent({ type: "order_update", order: order("44444444-4444-4444-8444-444444444444", "location-b") });
    expect(state.orders.map((item) => item.id)).toEqual([current.id]);
  });

  it("polls while disconnected and stops fallback polling after the stream recovers", async () => {
    vi.stubGlobal("window", {});
    subscribeToAdminOrderStream.mockReturnValue(vi.fn());
    state.session = {
      operator: { operatorUserId: "operator-1", role: "owner", capabilities: ["orders:read"] }
    } as unknown as OperatorSession;
    state.selectedLocationId = "location-a";
    const { startAutoRefresh } = await import("../src/orders-runtime");
    startAutoRefresh(vi.fn());
    const callbacks = subscribeToAdminOrderStream.mock.calls[0]?.[0];
    callbacks.onStateChange("reconnecting");
    expect(state.orderConnectionState).toBe("reconnecting");
    expect(state.autoRefreshHandle).not.toBeNull();
    callbacks.onStateChange("connected");
    expect(state.orderConnectionState).toBe("connected");
    expect(state.autoRefreshHandle).toBeNull();
  });
});
