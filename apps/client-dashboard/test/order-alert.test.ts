import { describe, expect, it } from "vitest";
import { NewOrderTracker } from "../src/order-alert";
import { resolveOrder, type OperatorOrder } from "../src/model";

const orderOneId = "11111111-1111-4111-8111-111111111111";
const orderTwoId = "22222222-2222-4222-8222-222222222222";

function order(id: string, status: OperatorOrder["status"]) {
  return resolveOrder({
    id,
    locationId: "flagship-01",
    status,
    items: [],
    total: { currency: "USD", amountCents: 1200 },
    pickupCode: id.slice(0, 6),
    timeline: [{ status, occurredAt: "2026-06-10T12:00:00.000Z" }]
  });
}

describe("new order tracker", () => {
  it("uses the first snapshot as a silent baseline", () => {
    const tracker = new NewOrderTracker();

    expect(tracker.observe("operator:location", [order(orderOneId, "PAID")])).toEqual([]);
    expect(tracker.observe("operator:location", [order(orderOneId, "PAID"), order(orderTwoId, "PAID")])).toEqual([
      expect.objectContaining({ id: orderTwoId })
    ]);
  });

  it("alerts when a pending order first becomes actionable", () => {
    const tracker = new NewOrderTracker();

    tracker.observe("operator:location", [order(orderOneId, "PENDING_PAYMENT")]);
    expect(tracker.observe("operator:location", [order(orderOneId, "PAID")])).toEqual([
      expect.objectContaining({ id: orderOneId })
    ]);
    expect(tracker.observe("operator:location", [order(orderOneId, "IN_PREP")])).toEqual([]);
  });

  it("does not alert when the dashboard location changes", () => {
    const tracker = new NewOrderTracker();

    tracker.observe("operator:location-1", []);
    expect(tracker.observe("operator:location-2", [order(orderTwoId, "READY")])).toEqual([]);
  });
});
