import { z } from "zod";

export const moneySchema = z.object({
  currency: z.literal("USD"),
  amountCents: z.number().int().nonnegative()
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().min(1).optional()
});

export const sessionTokenSchema = z.string().min(1).max(512);

export const authSessionSchema = z.object({
  accessToken: sessionTokenSchema,
  refreshToken: sessionTokenSchema,
  expiresAt: z.string().datetime(),
  userId: z.string().uuid()
});

export type Money = z.infer<typeof moneySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
