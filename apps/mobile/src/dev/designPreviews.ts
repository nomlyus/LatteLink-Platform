import type { CheckoutConfirmation, CheckoutFailure } from "../orders/flow";
import type { LoyaltyBalance, LoyaltyLedgerEntry, OrderHistoryEntry } from "../account/data";

export const designPreviewScenarios = [
  { id: "confirmation", label: "Order confirmed" },
  { id: "payment-pending", label: "Payment confirmation pending" },
  { id: "payment-failed", label: "Payment interrupted" },
  { id: "checkout-unavailable", label: "Checkout unavailable" },
  { id: "tracking-paid", label: "Order received" },
  { id: "tracking-preparing", label: "Order in preparation" },
  { id: "tracking-ready", label: "Ready for pickup" },
  { id: "receipt", label: "Completed receipt" },
  { id: "canceled", label: "Canceled order" },
  { id: "refund", label: "Refunded order" },
  { id: "loading", label: "Loading" },
  { id: "item-loading", label: "Item customization loading" },
  { id: "menu-loading", label: "Menu loading" },
  { id: "orders-loading", label: "History loading" },
  { id: "item-unavailable", label: "Item unavailable" },
  { id: "empty", label: "Empty state" },
  { id: "error", label: "Unavailable / retry" },
  { id: "signed-out", label: "Sign-in required" },
  { id: "rewards", label: "Rewards balance and activity" },
  { id: "rewards-loading", label: "Rewards loading" },
  { id: "rewards-error", label: "Rewards unavailable" },
  { id: "rewards-empty", label: "Rewards with no activity" },
  { id: "profile", label: "Profile setup" },
  { id: "account-delete", label: "Account deletion confirmation (safe preview)" }
] as const;
export type DesignPreviewScenario = typeof designPreviewScenarios[number]["id"];
export function isDesignPreviewScenario(value: unknown): value is DesignPreviewScenario {
  return designPreviewScenarios.some((scenario) => scenario.id === value);
}

// Isolated presentation fixtures: never inserted into queries, cart, auth, checkout, or storage.
export const previewConfirmation: CheckoutConfirmation = {
  orderId: "00000000-0000-4000-8000-000000000001", pickupCode: "DEMO",
  status: "PAID", total: { currency: "USD", amountCents: 950 },
  occurredAt: "2026-10-27T14:30:00.000Z",
  items: [{ itemId: "preview-coffee", itemName: "Cappuccino", quantity: 2, unitPriceCents: 475 }]
};
export const previewFailure: CheckoutFailure = {
  stage: "pay", occurredAt: previewConfirmation.occurredAt,
  message: "Payment was interrupted. Your items are still in your cart."
};
export const previewRewardsBalance: LoyaltyBalance = {
  brandId: "preview-brand", userId: previewConfirmation.orderId,
  availablePoints: 240, pendingPoints: 20, lifetimeEarned: 1200
};
export const previewRewardsEntries: LoyaltyLedgerEntry[] = [{
  id: previewConfirmation.orderId, brandId: "preview-brand", userId: previewConfirmation.orderId,
  locationId: "preview-location", type: "EARN", points: 20, createdAt: previewConfirmation.occurredAt
}];
export function previewOrder(scenario: DesignPreviewScenario): OrderHistoryEntry {
  const statuses: Partial<Record<DesignPreviewScenario, OrderHistoryEntry["status"]>> = {
    "tracking-paid": "PAID", "tracking-preparing": "IN_PREP", "tracking-ready": "READY",
    canceled: "CANCELED", refund: "REFUNDED"
  };
  const status = statuses[scenario] ?? "COMPLETED";
  return {
    id: previewConfirmation.orderId, pickupCode: "DEMO", status,
    total: previewConfirmation.total, items: previewConfirmation.items,
    timeline: [{ status, occurredAt: previewConfirmation.occurredAt }],
    ...(status === "REFUNDED" ? { refundSummary: {
      state: "FULL" as const, settledAmountCents: 950, remainingPaidAmountCents: 0,
      settledRefundCount: 1, allocationQuality: "COMPLETE" as const, unverifiedRefundCount: 0
    } } : {})
  };
}
