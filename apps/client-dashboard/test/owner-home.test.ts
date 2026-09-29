import { afterEach, describe, expect, it } from "vitest";
import type { OperatorSession } from "../src/api";
import { state } from "../src/state";
import { renderDashboard } from "../src/views/layout";
import {
  getChartBarHeight,
  getOwnerReportingLocationIds,
  getReportingDateRange
} from "../src/features/home/owner-home-domain";

const ownerSession: OperatorSession = {
  accessToken: "token",
  refreshToken: "refresh",
  apiBaseUrl: "https://api.example.test/v1",
  expiresAt: "2099-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "loc_a",
    locationIds: ["loc_a", "loc_b"],
    active: true,
    capabilities: ["orders:read", "orders:write", "store:read"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

afterEach(() => {
  state.initializing = true;
  state.loading = false;
  state.dashboardLoaded = false;
  state.section = "overview";
  state.session = null;
  state.selectedLocationId = null;
  state.availableLocations = [];
  state.appConfig = null;
  state.authApiBaseUrl = "";
  state.errorMessage = null;
});

describe("React Owner Home domain and legacy boundary", () => {
  it("builds local-time reporting ranges and maps all-location scope", () => {
    expect(getReportingDateRange("today", "America/Detroit", new Date("2026-09-09T04:00:00.000Z"))).toEqual({
      start: "2026-09-09", end: "2026-09-10", granularity: "hour"
    });
    expect(getReportingDateRange("7d", "America/Detroit", new Date("2026-09-09T16:00:00.000Z"))).toEqual({
      start: "2026-09-03", end: "2026-09-10", granularity: "day"
    });
    expect(getReportingDateRange("30d", "America/Detroit", new Date("2026-09-09T16:00:00.000Z"))).toEqual({
      start: "2026-08-11", end: "2026-09-10", granularity: "day"
    });

    const locations = [{ locationId: "loc_a" }, { locationId: "loc_b" }];
    expect(getOwnerReportingLocationIds("all", locations)).toEqual(["loc_a", "loc_b"]);
    expect(getOwnerReportingLocationIds("loc_a", locations)).toEqual(["loc_a"]);
    expect(getOwnerReportingLocationIds(null, locations)).toEqual([]);
  });

  it("calculates chart heights without inventing activity", () => {
    expect(getChartBarHeight(50, 100)).toBe(52);
    expect(getChartBarHeight(0, 100)).toBe(0);
    expect(getChartBarHeight(0, 0)).toBe(0);
  });

  it("does not render Owner Home through the legacy dashboard layout", () => {
    state.session = ownerSession;
    state.section = "overview";
    state.initializing = false;
    expect(renderDashboard()).toContain('class="dash-shell"');
    expect(renderDashboard()).not.toContain('aria-label="Owner home"');
  });
});
