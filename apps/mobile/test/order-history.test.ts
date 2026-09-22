import { describe, expect, it } from "vitest";
import type { LoyaltyLedgerEntry } from "../src/account/data";
import { isAbortedCheckoutOrder } from "../src/account/data";
import { findLoyaltyReversalEntriesForOrder, hasLoyaltyReversalActivity } from "../src/orders/history";

describe("order history visibility", () => {
  it("treats canceled unpaid orders as aborted checkout attempts", () => {
    expect(
      isAbortedCheckoutOrder({
        id: "123e4567-e89b-12d3-a456-426614174000",
        status: "CANCELED",
        pickupCode: "ABC123",
        items: [],
        total: {
          currency: "USD",
          amountCents: 650
        },
        timeline: [
          {
            status: "PENDING_PAYMENT",
            occurredAt: "2026-04-22T12:00:00.000Z",
            note: "Order created from quote"
          },
          {
            status: "CANCELED",
            occurredAt: "2026-04-22T12:01:00.000Z",
            note: "Customer abandoned checkout before payment confirmation"
          }
        ]
      })
    ).toBe(true);
  });

  it("keeps canceled paid orders visible", () => {
    expect(
      isAbortedCheckoutOrder({
        id: "123e4567-e89b-12d3-a456-426614174001",
        status: "CANCELED",
        pickupCode: "PAID01",
        items: [],
        total: {
          currency: "USD",
          amountCents: 650
        },
        timeline: [
          {
            status: "PENDING_PAYMENT",
            occurredAt: "2026-04-22T12:00:00.000Z",
            note: "Order created from quote"
          },
          {
            status: "PAID",
            occurredAt: "2026-04-22T12:01:00.000Z",
            note: "Payment confirmed."
          },
          {
            status: "CANCELED",
            occurredAt: "2026-04-22T12:02:00.000Z",
            note: "Order canceled."
          }
        ]
      })
    ).toBe(false);
  });

  it("identifies loyalty point reversals without implying a card refund", () => {
    const orderId = "123e4567-e89b-12d3-a456-426614174002";
    const loyaltyLedger: LoyaltyLedgerEntry[] = [
      {
        id: "123e4567-e89b-12d3-a456-426614174003",
        type: "REFUND",
        points: 25,
        orderId,
        locationId: "rawaq-ann-arbor",
        createdAt: "2026-04-22T12:03:00.000Z"
      },
      {
        id: "123e4567-e89b-12d3-a456-426614174004",
        type: "EARN",
        points: 5,
        orderId,
        locationId: "rawaq-ann-arbor",
        createdAt: "2026-04-22T12:00:00.000Z"
      }
    ];
    const order = {
      id: orderId,
      status: "CANCELED" as const,
      pickupCode: "PAID02",
      items: [],
      total: {
        currency: "USD" as const,
        amountCents: 650
      },
      timeline: [
        {
          status: "PAID" as const,
          occurredAt: "2026-04-22T12:01:00.000Z",
          note: "Payment confirmed."
        },
        {
          status: "CANCELED" as const,
          occurredAt: "2026-04-22T12:02:00.000Z",
          note: "Order canceled."
        }
      ]
    };

    expect(findLoyaltyReversalEntriesForOrder(orderId, loyaltyLedger)).toEqual([loyaltyLedger[0]]);
    expect(hasLoyaltyReversalActivity(order, loyaltyLedger)).toBe(true);
  });
});
