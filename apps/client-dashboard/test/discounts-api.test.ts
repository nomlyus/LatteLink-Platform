import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";
import {
  createOperatorDiscountCode,
  fetchOperatorDiscountCodes,
  updateOperatorDiscountCode
} from "../src/features/discounts/discounts-api";

const session: OperatorSession = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "loc-a",
    locationIds: ["loc-a"],
    active: true,
    capabilities: ["menu:read", "menu:write"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

const discountCode = {
  discountCodeId: "22222222-2222-4222-8222-222222222222",
  locationId: "loc-a",
  code: "LAUNCH10",
  name: "Launch offer",
  type: "percent",
  value: 10,
  maxDiscountCents: 500,
  minSubtotalCents: 1000,
  eligibility: "everyone",
  oncePerCustomer: false,
  maxTotalRedemptions: 20,
  active: true,
  redeemedCount: 0,
  reservedCount: 0,
  startsAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-31T23:59:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

describe("Discounts API adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads discount codes with the selected location and abort signal", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ discountCodes: [discountCode] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new AbortController();

    const result = await fetchOperatorDiscountCodes(session, "loc-a", controller.signal);

    expect(result).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-dev.nomly.us/v1/admin/discount-codes?locationId=loc-a",
      expect.objectContaining({ signal: controller.signal, headers: { authorization: "Bearer access-token" } })
    );
  });

  it("creates a normalized code using only the selected location", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(discountCode), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await createOperatorDiscountCode(session, "loc-a", {
      code: " launch10 ",
      name: "Launch offer",
      type: "percent",
      value: 10,
      maxDiscountCents: 500,
      minSubtotalCents: 1000,
      eligibility: "everyone",
      oncePerCustomer: false,
      maxTotalRedemptions: 20,
      active: true,
      startsAt: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-31T23:59:00.000Z"
    });

    const [url, request] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-dev.nomly.us/v1/admin/discount-codes?locationId=loc-a");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({ locationId: "loc-a", code: "LAUNCH10" });
  });

  it("updates optional schedule and limit fields through the existing PATCH contract", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...discountCode, startsAt: undefined, expiresAt: undefined, maxTotalRedemptions: undefined }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateOperatorDiscountCode(session, "loc-a", "id/with slash", {
      name: "Launch offer",
      type: "percent",
      value: 10,
      maxDiscountCents: null,
      minSubtotalCents: 1000,
      eligibility: "everyone",
      oncePerCustomer: false,
      maxTotalRedemptions: null,
      active: false,
      startsAt: null,
      expiresAt: null
    });

    const [url, request] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-dev.nomly.us/v1/admin/discount-codes/id%2Fwith%20slash?locationId=loc-a");
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toMatchObject({
      locationId: "loc-a",
      active: false,
      maxDiscountCents: null,
      maxTotalRedemptions: null,
      startsAt: null,
      expiresAt: null
    });
  });

  it("rejects All Locations before sending a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchOperatorDiscountCodes(session, "all")).rejects.toThrow("Choose one location");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
