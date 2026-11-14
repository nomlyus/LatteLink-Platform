import type { OrderHistoryEntry } from "../account/data";

export type OrderMonth = { key: string; year: string; title: string; orders: OrderHistoryEntry[] };

export function orderStatusLabel(status: OrderHistoryEntry["status"]): string {
  switch (status) {
    case "COMPLETED": return "Picked up";
    case "PENDING_PAYMENT": return "Awaiting payment";
    case "PAID": return "Confirmed";
    case "IN_PREP": return "In preparation";
    case "READY": return "Ready for pickup";
    case "CANCELED": return "Canceled";
    case "REFUNDED": return "Refunded";
    case "PARTIALLY_REFUNDED": return "Partially refunded";
  }
}

/** The first known event owns the month; later status/refund updates must not move an order. */
export function groupOrdersByMonth(orders: OrderHistoryEntry[]): OrderMonth[] {
  const groups = new Map<string, OrderMonth>();
  for (const order of orders) {
    const timestamps = order.timeline.map((event) => Date.parse(event.occurredAt)).filter(Number.isFinite);
    const date = timestamps.length ? new Date(Math.min(...timestamps)) : null;
    const year = date ? String(date.getFullYear()) : "Other orders";
    const key = date ? `${year}-${String(date.getMonth() + 1).padStart(2, "0")}` : "undated";
    const group = groups.get(key) ?? { key, year, title: date ? date.toLocaleDateString(undefined, { month: "long" }) : "Date unavailable", orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key === "undated" ? 1 : b.key === "undated" ? -1 : b.key.localeCompare(a.key));
}

export function searchArchivedOrders(orders: OrderHistoryEntry[], query: string): OrderHistoryEntry[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return orders;
  return orders.filter((order) => {
    const text = [order.id, order.pickupCode, order.status.replaceAll("_", " "),
      (order.total.amountCents / 100).toFixed(2), ...order.items.map((item) => item.itemName ?? item.itemId),
      ...order.timeline.map((event) => {
        const date = new Date(event.occurredAt);
        return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
      })].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
