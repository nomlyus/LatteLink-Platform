import { z } from "zod";

export const loyaltyBalanceSchema = z.object({
  brandId: z.string().trim().min(1),
  userId: z.string().uuid(),
  availablePoints: z.number().int().nonnegative(),
  pendingPoints: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative()
});

export const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().trim().min(1),
  userId: z.string().uuid(),
  type: z.enum(["EARN", "REDEEM", "REFUND", "ADJUSTMENT"]),
  points: z.number().int(),
  orderId: z.string().uuid().optional(),
  locationId: z.string().min(1),
  createdAt: z.string().datetime()
});

export const loyaltyProgramSchema = z.object({
  brandId: z.string().trim().min(1),
  enabled: z.boolean(),
  participatingLocationIds: z.array(z.string().trim().min(1)),
  pointsPerDollar: z.number().int().nonnegative(),
  redemptionCentsPerPoint: z.number().int().positive(),
  minimumRedemptionPoints: z.number().int().positive(),
  maximumRedemptionPercent: z.number().int().min(1).max(100),
  excludedItemIds: z.array(z.string().trim().min(1)),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime()
});

export const loyaltyProgramUpdateSchema = loyaltyProgramSchema.omit({
  version: true,
  updatedAt: true
}).superRefine((program, context) => {
  if (program.enabled && program.participatingLocationIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "enabled programs require a participating location" });
  }
  if (new Set(program.participatingLocationIds).size !== program.participatingLocationIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "participating locations must be unique" });
  }
});

export const loyaltyProgramContextSchema = z.object({
  brandId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  enabled: z.boolean(),
  participating: z.boolean(),
  pointsPerDollar: z.number().int().nonnegative(),
  redemptionCentsPerPoint: z.number().int().positive(),
  minimumRedemptionPoints: z.number().int().positive(),
  maximumRedemptionPercent: z.number().int().min(1).max(100),
  excludedItemIds: z.array(z.string().trim().min(1)),
  balance: loyaltyBalanceSchema.optional()
});

export const loyaltyLocationRequestSchema = z.object({
  brandId: z.string().trim().min(1).max(160),
  locationId: z.string().trim().min(1).max(160)
});

export const loyaltyContract = {
  basePath: "/loyalty",
  routes: {
    balance: {
      method: "GET",
      path: "/balance",
      request: loyaltyLocationRequestSchema,
      response: loyaltyBalanceSchema
    },
    ledger: {
      method: "GET",
      path: "/ledger",
      request: loyaltyLocationRequestSchema,
      response: z.array(loyaltyLedgerEntrySchema)
    }
  }
} as const;
