import { describe, expect, it } from "vitest";
import type { OrderHistoryEntry } from "../src/account/data";
import { groupOrdersByMonth, orderStatusLabel, searchArchivedOrders } from "../src/orders/archive";

function order(id: string, date?: string): OrderHistoryEntry {
  return { id, status: "COMPLETED", pickupCode: "AB123", items: [{ itemId: "latte", itemName: "Oat latte", quantity: 1, unitPriceCents: 650 }],
    total: { currency: "USD", amountCents: 650 }, timeline: date ? [{ status: "COMPLETED", occurredAt: date }] : [] };
}

describe("order archive", () => {
  it.each([
    ["COMPLETED", "Picked up"], ["CANCELED", "Canceled"], ["REFUNDED", "Refunded"],
    ["PARTIALLY_REFUNDED", "Partially refunded"], ["PAID", "Confirmed"],
    ["PENDING_PAYMENT", "Awaiting payment"], ["IN_PREP", "In preparation"], ["READY", "Ready for pickup"]
  ] as const)("preserves %s status semantics", (status, label) => {
    expect(orderStatusLabel(status)).toBe(label);
  });
  it("groups real orders by descending year/month and counts them", () => {
    const result = groupOrdersByMonth([order("a", "2025-06-15T12:00:00Z"), order("b", "2026-10-15T12:00:00Z"), order("c", "2026-10-16T12:00:00Z")]);
    expect(result.map((month) => [month.key, month.orders.length])).toEqual([["2026-10", 2], ["2025-06", 1]]);
  });
  it("keeps an order in its original month after later events", () => {
    const entry = order("a", "2026-09-15T12:00:00Z");
    entry.timeline.push({ status: "COMPLETED", occurredAt: "2026-10-15T12:00:00Z" });
    expect(groupOrdersByMonth([entry])[0].key).toBe("2026-09");
  });
  it("retains undated orders after dated groups, including malformed historical dates", () => {
    expect(groupOrdersByMonth([order("a"), order("b", "invalid"), order("c", "2026-10-15T12:00:00Z")]).map((month) => [month.key, month.orders.length])).toEqual([["2026-10", 1], ["undated", 2]]);
    expect(groupOrdersByMonth([])).toEqual([]);
  });
  it("searches real identifiers, products and prices without changing original orders", () => {
    const entries = [order("one", "2026-10-15T12:00:00Z")];
    expect(searchArchivedOrders(entries, "OAT 6.50")).toEqual(entries);
    expect(searchArchivedOrders(entries, "AB123")).toEqual(entries);
    expect(searchArchivedOrders(entries, "one")).toEqual(entries);
    expect(searchArchivedOrders(entries, "missing")).toEqual([]);
    expect(searchArchivedOrders(entries, "  ")).toBe(entries);
  });
});
