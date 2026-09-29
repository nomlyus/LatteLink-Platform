import type { OperatorOrder, OperatorOrderStatus } from "../../model";

export type OrdersViewFilter = "all" | "active" | "completed" | "canceled";
export type StoreOrdersFilter = "all" | "needs_action" | "in_progress" | "ready" | "closed";

export function mergeUpdatedOrder(orders: readonly OperatorOrder[], updated: OperatorOrder): OperatorOrder[] {
  const existing = orders.find((order) => order.id === updated.id);
  const nextOrder = existing
    ? { ...existing, ...updated, customer: updated.customer ?? existing.customer }
    : updated;
  return existing
    ? orders.map((order) => order.id === updated.id ? nextOrder : order)
    : [nextOrder, ...orders];
}

export function resolveOrderMutationLocationId(
  selectedLocationId: string | "all" | null,
  scopedLocationId: string | null,
  operatorRole: string,
  orderLocationId: string
) {
  if (selectedLocationId !== "all") return scopedLocationId;
  return operatorRole === "owner" ? null : orderLocationId;
}

export function filterOrders(orders: readonly OperatorOrder[], filter: OrdersViewFilter, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return orders.filter((order) => {
    const matchesFilter = filter === "all"
      || (filter === "active" && !isTerminalStatus(order.status))
      || (filter === "canceled" && order.status === "CANCELED")
      || (filter === "completed" && ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status));
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      order.pickupCode,
      order.customer?.name,
      order.customer?.email,
      order.customer?.phone,
      ...order.items.flatMap((item) => [item.itemName, item.itemId, ...(item.customization?.selectedOptions ?? []).map((option) => option.optionLabel)])
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function isTerminalStatus(status: OperatorOrderStatus) {
  return status === "COMPLETED" || status === "CANCELED" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED";
}

export function filterStoreOrders(orders: readonly OperatorOrder[], filter: StoreOrdersFilter) {
  switch (filter) {
    case "needs_action": return orders.filter((order) => order.status === "PAID");
    case "in_progress": return orders.filter((order) => order.status === "IN_PREP");
    case "ready": return orders.filter((order) => order.status === "READY");
    case "closed": return orders.filter((order) => ["COMPLETED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status));
    case "all": return orders.filter((order) => ["PAID", "IN_PREP", "READY"].includes(order.status));
  }
}

export function sortStoreOrders(orders: readonly OperatorOrder[], filter: StoreOrdersFilter) {
  const priority: Record<string, number> = { PAID: 0, IN_PREP: 1, READY: 2, COMPLETED: 3, CANCELED: 4, REFUNDED: 4, PARTIALLY_REFUNDED: 4 };
  return [...orders].sort((left, right) => {
    if (filter !== "closed" && priority[left.status] !== priority[right.status]) {
      return (priority[left.status] ?? 5) - (priority[right.status] ?? 5);
    }
    const leftTime = Date.parse(left.timeline[0]?.occurredAt ?? "") || 0;
    const rightTime = Date.parse(right.timeline[0]?.occurredAt ?? "") || 0;
    return filter === "closed" ? rightTime - leftTime : leftTime - rightTime;
  });
}

export function paginateOrders<T>(items: readonly T[], requestedPage: number, pageSize = 15) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageCount, start, end: Math.min(start + pageSize, items.length), total: items.length };
}

export function orderItemCount(order: OperatorOrder) {
  return order.items.reduce((count, item) => count + item.quantity, 0);
}

export function orderSubtotalCents(order: OperatorOrder) {
  return order.items.reduce((total, item) => total + (item.lineTotalCents ?? item.unitPriceCents * item.quantity), 0);
}

export function orderTaxCents(order: OperatorOrder) {
  return Math.max(order.total.amountCents - orderSubtotalCents(order), 0);
}

export function orderElapsedLabel(order: OperatorOrder, now = Date.now()) {
  const firstEventAt = order.timeline[0]?.occurredAt;
  if (!firstEventAt) return "Just now";
  const deltaMinutes = Math.max(0, Math.floor((now - Date.parse(firstEventAt)) / 60_000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  if (deltaMinutes <= 12 * 60) return `${Math.floor(deltaMinutes / 60)}h ago`;
  return `${Math.max(1, Math.floor(deltaMinutes / (24 * 60)))}d ago`;
}

export function orderPaymentLabel(order: OperatorOrder) {
  if (order.status === "PENDING_PAYMENT") return "Payment pending";
  if (order.status === "REFUNDED") return "Refunded";
  if (order.status === "PARTIALLY_REFUNDED") return "Partially refunded";
  if (order.status === "CANCELED") return order.refundSummary?.state === "FULL" ? "Refunded · canceled" : "Canceled";
  return "Paid";
}
