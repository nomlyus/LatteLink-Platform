import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG_FULFILLMENT } from "@lattelink/contracts-catalog";
import { orderSchema } from "@lattelink/contracts-orders";
import { reconcileOrderFulfillmentState } from "../src/fulfillment.js";
import { advanceOrderLifecycleToStatus, OrderTransitionError, transitionOrderStatus } from "../src/lifecycle.js";

const paidAt = "2026-03-10T00:00:00.000Z";

function buildOrder(status: "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED") {
  const timeline = [
    {
      status: "PENDING_PAYMENT",
      occurredAt: "2026-03-09T23:59:00.000Z",
      note: "Order created from quote"
    },
    {
      status: "PAID",
      occurredAt: paidAt,
      note: "Earned 795 loyalty points."
    }
  ];

  if (status === "IN_PREP" || status === "READY" || status === "COMPLETED") {
    timeline.push({
      status: "IN_PREP",
      occurredAt: "2026-03-10T00:05:00.000Z",
      note: "Order moved into preparation."
    });
  }

  if (status === "READY" || status === "COMPLETED") {
    timeline.push({
      status: "READY",
      occurredAt: "2026-03-10T00:10:00.000Z",
      note: "Order is ready for pickup."
    });
  }

  if (status === "COMPLETED") {
    timeline.push({
      status: "COMPLETED",
      occurredAt: "2026-03-10T00:15:00.000Z",
      note: "Order completed."
    });
  }

  if (status === "CANCELED") {
    timeline.push({
      status: "CANCELED",
      occurredAt: "2026-03-10T00:06:00.000Z",
      note: "Canceled by staff"
    });
  }

  return orderSchema.parse({
    id: "123e4567-e89b-12d3-a456-426614174500",
    locationId: "flagship-01",
    status,
    items: [
      {
        itemId: "latte",
        itemName: "Honey Oat Latte",
        quantity: 1,
        unitPriceCents: 675,
        lineTotalCents: 675
      }
    ],
    total: {
      currency: "USD",
      amountCents: 795
    },
    pickupCode: "ABC123",
    timeline
  });
}

describe("configured fulfillment reconciliation", () => {
  it("applies a single lifecycle transition with source attribution", () => {
    const order = buildOrder("PAID");

    const result = transitionOrderStatus(order, "IN_PREP", {
      source: "staff"
    });

    expect(result.changed).toBe(true);
    expect(result.order.status).toBe("IN_PREP");
    expect(result.appliedTransitions).toHaveLength(1);
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "IN_PREP",
      source: "staff"
    });
  });

  it("advances sequentially when asked to reach a later lifecycle target", () => {
    const order = buildOrder("PAID");

    const result = advanceOrderLifecycleToStatus(order, "READY", {
      resolveStepMetadata: ({ nextStatus }) => ({
        source: "system",
        occurredAt:
          nextStatus === "IN_PREP"
            ? "2026-03-10T00:05:00.000Z"
            : "2026-03-10T00:10:00.000Z"
      })
    });

    expect(result.changed).toBe(true);
    expect(result.order.status).toBe("READY");
    expect(result.appliedTransitions.map((transition) => transition.toStatus)).toEqual(["IN_PREP", "READY"]);
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "READY",
      source: "system"
    });
  });

  it("rejects invalid regressions and keeps same-status calls idempotent", () => {
    const order = buildOrder("READY");

    expect(() => transitionOrderStatus(order, "PAID")).toThrow(OrderTransitionError);

    const sameStatus = transitionOrderStatus(order, "READY", {
      source: "staff"
    });

    expect(sameStatus.changed).toBe(false);
    expect(sameStatus.order.timeline).toHaveLength(order.timeline.length);
  });

  it("keeps PAID orders as PAID before five minutes", () => {
    const order = buildOrder("PAID");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:04:59.000Z")
    });

    expect(result.changed).toBe(false);
    expect(result.order.status).toBe("PAID");
    expect(result.order.timeline).toHaveLength(order.timeline.length);
  });

  it("advances PAID orders to IN_PREP at five minutes", () => {
    const order = buildOrder("PAID");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:05:00.000Z")
    });

    expect(result.changed).toBe(true);
    expect(result.order.status).toBe("IN_PREP");
    expect(result.appendedStatuses).toEqual(["IN_PREP"]);
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "IN_PREP",
      occurredAt: "2026-03-10T00:05:00.000Z"
    });
  });

  it("advances IN_PREP orders to READY at ten minutes from PAID", () => {
    const order = buildOrder("IN_PREP");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:10:00.000Z")
    });

    expect(result.changed).toBe(true);
    expect(result.order.status).toBe("READY");
    expect(result.appendedStatuses).toEqual(["READY"]);
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "READY",
      occurredAt: "2026-03-10T00:10:00.000Z"
    });
  });

  it("advances READY orders to COMPLETED at fifteen minutes from PAID", () => {
    const order = buildOrder("READY");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:15:00.000Z")
    });

    expect(result.changed).toBe(true);
    expect(result.order.status).toBe("COMPLETED");
    expect(result.appendedStatuses).toEqual(["COMPLETED"]);
    expect(result.order.timeline.at(-1)).toMatchObject({
      status: "COMPLETED",
      occurredAt: "2026-03-10T00:15:00.000Z"
    });
  });

  it("does not advance canceled orders", () => {
    const order = buildOrder("CANCELED");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:30:00.000Z")
    });

    expect(result.changed).toBe(false);
    expect(result.order.status).toBe("CANCELED");
    expect(result.order.timeline).toHaveLength(order.timeline.length);
  });

  it("does not advance completed orders", () => {
    const order = buildOrder("COMPLETED");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:30:00.000Z")
    });

    expect(result.changed).toBe(false);
    expect(result.order.status).toBe("COMPLETED");
    expect(result.order.timeline).toHaveLength(order.timeline.length);
  });

  it("is idempotent across duplicate reconciliation calls", () => {
    const order = buildOrder("PAID");

    const firstResult = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:10:00.000Z")
    });
    const secondResult = reconcileOrderFulfillmentState(firstResult.order, {
      now: new Date("2026-03-10T00:10:00.000Z")
    });

    expect(firstResult.order.status).toBe("READY");
    expect(firstResult.order.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY"
    ]);
    expect(secondResult.changed).toBe(false);
    expect(secondResult.order.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP",
      "READY"
    ]);
  });

  it("never regresses an order that is already further along the lifecycle", () => {
    const order = buildOrder("IN_PREP");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:04:00.000Z")
    });

    expect(result.changed).toBe(false);
    expect(result.order.status).toBe("IN_PREP");
    expect(result.order.timeline.map((entry) => entry.status)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "IN_PREP"
    ]);
  });

  it("does not auto-advance reads when fulfillment mode is staff", () => {
    const order = buildOrder("PAID");

    const result = reconcileOrderFulfillmentState(order, {
      now: new Date("2026-03-10T00:30:00.000Z"),
      fulfillment: {
        ...DEFAULT_APP_CONFIG_FULFILLMENT,
        mode: "staff"
      }
    });

    expect(result.changed).toBe(false);
    expect(result.order.status).toBe("PAID");
    expect(result.order.timeline).toHaveLength(order.timeline.length);
  });
});
