import { formatOrderStatus, type OperatorOrder } from "../../model";
import { formatDateTime, formatMoney } from "../../ui/format";

function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()
    .replace(/[_,$€£]/g, " ").replace(/\bcancelled\b/g, "canceled").trim();
}

function searchableAmount(amountCents: number) {
  return `${formatMoney(amountCents)} ${(amountCents / 100).toFixed(2)}`;
}

/** Search only the order snapshot and authorized location labels; never fetch customer data. */
export function matchesOrderSearch(order: OperatorOrder, query: string, locationName?: string) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0);
  const subtotal = order.items.reduce((total, item) => total + (item.lineTotalCents ?? item.unitPriceCents * item.quantity), 0);
  const refund = order.refundSummary;
  const fields = [
    order.id, order.pickupCode, order.locationId, locationName,
    order.customer?.name, order.customer?.email, order.customer?.phone,
    formatOrderStatus(order.status), order.status,
    order.status === "PENDING_PAYMENT" ? "Payment pending" : "Paid",
    "Pickup", order.total.currency, `Total ${searchableAmount(order.total.amountCents)}`,
    `Subtotal ${searchableAmount(subtotal)}`,
    `Tax ${searchableAmount(Math.max(order.total.amountCents - subtotal, 0))}`,
    `${itemCount} ${itemCount === 1 ? "item" : "items"}`,
    ...order.items.flatMap((item) => [
      item.itemId, item.itemName, `${item.quantity}×`, `quantity ${item.quantity}`,
      searchableAmount(item.unitPriceCents),
      searchableAmount(item.lineTotalCents ?? item.unitPriceCents * item.quantity),
      item.customization?.notes,
      ...(item.customization?.selectedOptions ?? []).flatMap((option) => [
        option.groupId, option.groupLabel, option.optionId, option.optionLabel,
        searchableAmount(option.priceDeltaCents)
      ])
    ]),
    ...order.timeline.flatMap((entry) => [
      formatOrderStatus(entry.status), entry.occurredAt, formatDateTime(entry.occurredAt), entry.note
    ]),
    ...(refund && (refund.state !== "NONE" || refund.settledRefundCount > 0 || refund.unverifiedRefundCount > 0) ? [
      `Refunded ${searchableAmount(refund.settledAmountCents)}`,
      `Remaining ${searchableAmount(refund.remainingPaidAmountCents)}`,
      `${refund.settledRefundCount} refunds`
    ] : [])
  ];
  const searchable = normalizeSearchText(fields.filter((field) => field !== undefined).join(" "));
  return terms.every((term) => searchable.includes(term));
}
