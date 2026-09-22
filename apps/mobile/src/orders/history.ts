import type { LoyaltyLedgerEntry, OrderHistoryEntry } from "../account/data";

export function formatOrderDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatOrderStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function formatOrderReference(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

export function formatOrderTimelineNote(note: string) {
  const normalized = note
    .replace(/^Clover payment accepted;\s*/i, "")
    .replace(/^Payment confirmed;\s*/i, "")
    .replace(/^Payment reconciled from Clover[^;]*;\s*/i, "")
    .replace(/^Clover accepted the charge;\s*/i, "")
    .replace(/^earned\b/i, "Earned")
    .replace(/;\s*earned\b/g, "; Earned")
    .trim();

  return normalized.length > 0 ? normalized : note;
}

export function getLatestOrderTimelineNote(order: OrderHistoryEntry) {
  const latestNote = order.timeline[order.timeline.length - 1]?.note;
  if (latestNote) {
    return formatOrderTimelineNote(latestNote);
  }

  switch (order.status) {
    case "PENDING_PAYMENT":
      return "Payment still needs to be completed for this order.";
    case "PAID":
      return "Your order was confirmed successfully.";
    case "IN_PREP":
      return "Your order is being prepared.";
    case "READY":
      return "Your order was ready for pickup.";
    case "COMPLETED":
      return "Picked up successfully.";
    case "CANCELED":
      return "This order was canceled.";
    default:
      return formatOrderStatus(order.status);
  }
}

export function findLatestOrderTime(order: OrderHistoryEntry) {
  return order.timeline[order.timeline.length - 1]?.occurredAt ?? "";
}

export function findLoyaltyReversalEntriesForOrder(orderId: string, loyaltyLedger: LoyaltyLedgerEntry[]) {
  return loyaltyLedger.filter((entry) => entry.type === "REFUND" && entry.orderId === orderId);
}

export function hasLoyaltyReversalActivity(order: OrderHistoryEntry, loyaltyLedger: LoyaltyLedgerEntry[]) {
  return findLoyaltyReversalEntriesForOrder(order.id, loyaltyLedger).length > 0;
}
