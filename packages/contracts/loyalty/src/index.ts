import { z } from "zod";

export const loyaltyBalanceSchema = z.object({
  userId: z.string().uuid(),
  locationId: z.string().min(1),
  availablePoints: z.number().int().nonnegative(),
  pendingPoints: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative()
});

export const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "REFUND", "ADJUSTMENT"]),
  points: z.number().int(),
  orderId: z.string().uuid().optional(),
  locationId: z.string().min(1),
  createdAt: z.string().datetime()
});

export const loyaltyContract = {
  basePath: "/loyalty",
  routes: {
    balance: {
      method: "GET",
      path: "/balance",
      request: z.undefined(),
      response: loyaltyBalanceSchema
    },
    ledger: {
      method: "GET",
      path: "/ledger",
      request: z.undefined(),
      response: z.array(loyaltyLedgerEntrySchema)
    }
  }
} as const;
