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

export function findLatestOrderTime(order: OrderHistoryEntry) {
  return order.timeline[order.timeline.length - 1]?.occurredAt ?? "";
}

export function findRefundEntriesForOrder(orderId: string, loyaltyLedger: LoyaltyLedgerEntry[]) {
  return loyaltyLedger.filter((entry) => entry.type === "REFUND" && entry.orderId === orderId);
}

export function hasRefundActivity(order: OrderHistoryEntry, loyaltyLedger: LoyaltyLedgerEntry[]) {
  return order.status === "CANCELED" || findRefundEntriesForOrder(order.id, loyaltyLedger).length > 0;
}
