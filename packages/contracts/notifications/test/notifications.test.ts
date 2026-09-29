import { describe, expect, it } from "vitest";
import { orderStateNotificationSchema, pushTokenUpsertSchema } from "../src";

describe("contracts-notifications", () => {
  it("validates expo token envelope", () => {
    const parsed = pushTokenUpsertSchema.parse({
      brandId: "brand-1",
      deviceId: "device-1",
      platform: "ios",
      expoPushToken: "ExponentPushToken[abc]"
    });

    expect(parsed.platform).toBe("ios");
  });

  it("requires a public brand selector for push-token registration", () => {
    expect(pushTokenUpsertSchema.safeParse({
      deviceId: "device-1",
      platform: "ios",
      expoPushToken: "ExponentPushToken[abc]"
    }).success).toBe(false);
  });

  it("validates internal order-state notification payload", () => {
    const parsed = orderStateNotificationSchema.parse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      orderId: "123e4567-e89b-12d3-a456-426614174001",
      status: "PAID",
      pickupCode: "ABC123",
      locationId: "flagship-01",
      occurredAt: "2026-03-10T17:30:00.000Z"
    });

    expect(parsed.status).toBe("PAID");
  });
});
