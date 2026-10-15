import type { LoyaltyLedgerEntry, OrderHistoryEntry } from "../account/data";
import type { MenuItem } from "../menu/catalog";

export function sumReturnedPoints(entries: LoyaltyLedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

export function countOrderUnits(order: OrderHistoryEntry) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function buildOrderItemsSummary(order: OrderHistoryEntry, menuItemsById: Map<string, MenuItem>) {
  const names = order.items
    .map((item) => item.itemName?.trim() || menuItemsById.get(item.itemId)?.name || "Item")
    .filter(Boolean);

  if (names.length === 0) return "Order details unavailable";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}

export function formatOrderItemDescription(item: OrderHistoryEntry["items"][number], menuItem?: MenuItem) {
  const selectedOptions =
    item.customization?.selectedOptions?.map((selection) => selection.optionLabel).filter(Boolean) ?? [];
  const notes = item.customization?.notes?.trim();
  const details = [...selectedOptions, ...(notes ? [notes] : [])];
  const suffix = details.length > 0 ? details.join(" • ") : (menuItem?.description?.trim() ?? "");
  return suffix.length > 0 ? `${item.quantity}x • ${suffix}` : `${item.quantity}x`;
}
