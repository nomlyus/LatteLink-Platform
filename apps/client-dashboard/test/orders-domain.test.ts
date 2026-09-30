import { describe, expect, it } from "vitest";
import { resolveOrder } from "../src/model";
import { filterOrders, filterStoreOrders, mergeUpdatedOrder, orderElapsedLabel, orderPaymentLabel, paginateOrders, resolveOrderMutationLocationId, sortStoreOrders } from "../src/features/orders/orders-domain";

function order(id: string, status: "PENDING_PAYMENT" | "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED" | "REFUNDED" | "PARTIALLY_REFUNDED", time: string, name = "Jordan Lee", email = "jordan@example.com") {
  return resolveOrder({
    id,
    locationId: "loc-a",
    status,
    items: [{ itemId: "latte", itemName: "Latte", quantity: 1, unitPriceCents: 650, customization: { selectedOptions: [{ groupId: "milk", groupLabel: "Milk", optionId: "oat", optionLabel: "Oat milk", priceDeltaCents: 75 }] } }],
    total: { currency: "USD", amountCents: 725 },
    pickupCode: id.slice(0, 6),
    timeline: [{ status, occurredAt: time }],
    customer: { name, email }
  });
}

const data = [
  order("11111111-1111-4111-8111-111111111111", "PAID", "2026-09-28T12:00:00.000Z"),
  order("22222222-2222-4222-8222-222222222222", "CANCELED", "2026-09-28T12:02:00.000Z", "Casey", "casey@example.com"),
  order("33333333-3333-4333-8333-333333333333", "REFUNDED", "2026-09-28T12:03:00.000Z"),
  order("44444444-4444-4444-8444-444444444444", "PARTIALLY_REFUNDED", "2026-09-28T12:04:00.000Z")
];

describe("React Orders domain helpers", () => {
  it("searches pickup code, customer name, email, item name and modifier label", () => {
    expect(filterOrders(data, "all", "111111")).toHaveLength(1);
    expect(filterOrders(data, "all", "casey")).toHaveLength(1);
    expect(filterOrders(data, "all", "jordan@example.com")).toHaveLength(3);
    expect(filterOrders(data, "all", "latte")).toHaveLength(4);
    expect(filterOrders(data, "all", "oat milk")).toHaveLength(4);
  });

  it("keeps active, completed/refunded and canceled views distinct", () => {
    expect(filterOrders(data, "active", "").map((item) => item.status)).toEqual(["PAID"]);
    expect(filterOrders(data, "completed", "").map((item) => item.status)).toEqual(["REFUNDED", "PARTIALLY_REFUNDED"]);
    expect(filterOrders(data, "canceled", "").map((item) => item.status)).toEqual(["CANCELED"]);
  });

  it("filters and prioritizes store tickets in the existing queue order", () => {
    expect(filterStoreOrders(data, "all").map((item) => item.status)).toEqual(["PAID"]);
    expect(filterStoreOrders(data, "closed")).toHaveLength(3);
    const inProgress = [data[2]!, data[0]!, order("55555555-5555-4555-8555-555555555555", "IN_PREP", "2026-09-28T11:00:00.000Z")];
    expect(sortStoreOrders(inProgress, "all").map((item) => item.status)).toEqual(["PAID", "IN_PREP", "REFUNDED"]);
  });

  it("paginates a stable page window and clamps stale page numbers after filtering", () => {
    const page = paginateOrders(Array.from({ length: 27 }, (_, index) => index), 2, 15);
    expect(page).toMatchObject({ page: 2, pageCount: 2, start: 15, end: 27, total: 27, items: Array.from({ length: 12 }, (_, index) => index + 15) });
    expect(paginateOrders(["a"], 8)).toMatchObject({ page: 1, pageCount: 1, start: 0, end: 1 });
  });

  it("uses the current order status as the payment/refund presentation source", () => {
    expect(orderPaymentLabel(data[0]!)).toBe("Paid");
    expect(orderPaymentLabel(data[1]!)).toBe("Canceled");
    expect(orderPaymentLabel(data[2]!)).toBe("Refunded");
    expect(orderPaymentLabel(data[3]!)).toBe("Partially refunded");
    expect(orderElapsedLabel(data[0]!, Date.parse("2026-09-28T12:14:00.000Z"))).toBe("14m ago");
  });

  it("reconciles server mutation results without losing existing customer details", () => {
    const updated = { ...data[0]!, status: "IN_PREP" as const, customer: undefined };
    expect(mergeUpdatedOrder([data[0]!], updated)[0]).toMatchObject({
      status: "IN_PREP",
      customer: { name: "Jordan Lee", email: "jordan@example.com" }
    });
    expect(mergeUpdatedOrder([], updated)).toEqual([updated]);
  });

  it("keeps owner and manager mutation scope distinct in All Locations", () => {
    expect(resolveOrderMutationLocationId("all", null, "owner", "loc-a")).toBeNull();
    expect(resolveOrderMutationLocationId("all", null, "manager", "loc-a")).toBe("loc-a");
    expect(resolveOrderMutationLocationId("loc-a", "loc-a", "manager", "loc-b")).toBe("loc-a");
  });
});
