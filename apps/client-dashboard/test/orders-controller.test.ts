import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";
import { resolveOrder } from "../src/model";
import { state } from "../src/state";

const updateOrderStatus = vi.hoisted(() => vi.fn());
const cancelAndRefund = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());

vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  updateOperatorOrderStatus: updateOrderStatus,
  cancelAndRefundOperatorOrder: cancelAndRefund
}));
vi.mock("../src/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/model")>()),
  canAdvanceOrderStatus: () => true,
  canCancelOrder: () => true
}));
vi.mock("../src/render", () => ({ render }));
vi.mock("../src/lifecycle", () => ({ handleOperatorActionError: vi.fn() }));

const orderId = "123e4567-e89b-42d3-a456-426614174000";
const paidOrder = resolveOrder({
  id: orderId,
  locationId: "flagship-01",
  status: "PAID",
  items: [],
  total: { currency: "USD", amountCents: 1200 },
  pickupCode: "A1B2C3",
  timeline: [{ status: "PAID", occurredAt: "2026-09-22T12:00:00.000Z" }],
  customer: { name: "Test Customer" }
});

describe("order action refresh", () => {
  afterEach(() => {
    state.session = null;
    state.orders = [];
    state.selectedOrderId = null;
    state.selectedLocationId = null;
    state.busyOrderId = null;
    state.loading = false;
    state.lastRefreshedAt = null;
    state.pendingCancelOrderId = null;
    updateOrderStatus.mockReset();
    cancelAndRefund.mockReset();
    render.mockReset();
  });

  function prepareOrder() {
    state.session = { operator: { capabilities: ["orders:write"] } } as unknown as OperatorSession;
    state.selectedLocationId = "flagship-01";
    state.orders = [paidOrder];
    state.selectedOrderId = orderId;
    state.loading = false;
  }

  it("applies an advanced order without entering dashboard-wide loading", async () => {
    prepareOrder();
    updateOrderStatus.mockResolvedValue({
      ...paidOrder,
      customer: undefined,
      status: "IN_PREP",
      timeline: [...paidOrder.timeline, { status: "IN_PREP", occurredAt: "2026-09-22T12:01:00.000Z" }]
    });

    const { handleOrderAdvance } = await import("../src/controllers/orders");
    await handleOrderAdvance(orderId, "IN_PREP");

    expect(state.loading).toBe(false);
    expect(state.orders[0]).toMatchObject({ status: "IN_PREP", customer: { name: "Test Customer" } });
    expect(state.selectedOrderId).toBe(orderId);
    expect(state.busyOrderId).toBeNull();
    expect(render).toHaveBeenCalled();
  });

  it("applies a refund result without entering dashboard-wide loading", async () => {
    prepareOrder();
    cancelAndRefund.mockResolvedValue({
      ...paidOrder,
      customer: undefined,
      status: "CANCELED",
      timeline: [...paidOrder.timeline, { status: "CANCELED", occurredAt: "2026-09-22T12:02:00.000Z" }]
    });

    const { handleOrderCancel } = await import("../src/controllers/orders");
    await handleOrderCancel(orderId, "Item unavailable");

    expect(state.loading).toBe(false);
    expect(state.orders[0]).toMatchObject({ status: "CANCELED", customer: { name: "Test Customer" } });
    expect(state.selectedOrderId).toBe(orderId);
    expect(state.busyOrderId).toBeNull();
    expect(render).toHaveBeenCalled();
  });
});
