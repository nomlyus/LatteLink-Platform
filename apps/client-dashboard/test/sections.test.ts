import { afterEach, describe, expect, it } from "vitest";
import type { OperatorSession } from "../src/api";
import { getAvailableDashboardSections } from "../src/sections";
import { state } from "../src/state";

const ownerSession: OperatorSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  apiBaseUrl: "https://api.nomly.us/v1",
  expiresAt: "2026-05-06T13:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Pilot Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "northside-01",
    locationIds: ["northside-01"],
    active: true,
    capabilities: ["store:read", "store:write"],
    createdAt: "2026-05-06T12:00:00.000Z",
    updatedAt: "2026-05-06T12:00:00.000Z"
  }
};

const onboardingSummary = {
  tenantId: "tenant-northside",
  brandId: "northside-coffee",
  brandName: "Northside Coffee",
  locationId: "northside-01",
  locationName: "Northside Flagship",
  marketLabel: "Detroit, MI",
  status: "in_progress" as const,
  readyForReview: false,
  checklist: [],
  updatedAt: "2026-05-06T12:00:00.000Z"
};

describe("dashboard sections", () => {
  afterEach(() => {
    state.session = null;
    state.onboardingSummary = null;
    state.availableLocations = [];
    state.appConfig = null;
  });

  it("shows setup only to owners with incomplete onboarding", () => {
    state.session = ownerSession;
    state.onboardingSummary = onboardingSummary;

    expect(getAvailableDashboardSections()).toContain("onboarding");

    state.session = {
      ...ownerSession,
      operator: {
        ...ownerSession.operator,
        role: "manager"
      }
    };
    expect(getAvailableDashboardSections()).not.toContain("onboarding");

    state.session = ownerSession;
    state.onboardingSummary = {
      ...onboardingSummary,
      status: "live"
    };
    expect(getAvailableDashboardSections()).not.toContain("onboarding");
  });
});
