import { afterEach, describe, expect, it } from "vitest";
import type { OperatorSession } from "../src/api";
import { state } from "../src/state";
import {
  getOwnerReportingLocationIds,
  getChartBarHeight,
  getReportingDateRange,
  getRightNowCounts,
  renderOwnerHome,
  shouldRenderOwnerHome
} from "../src/views/owner-home";

const session = (role: "owner" | "manager" | "store"): OperatorSession => ({
  accessToken: "token",
  refreshToken: "refresh",
  apiBaseUrl: "https://api.example.test/v1",
  expiresAt: "2099-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Owner",
    email: "owner@example.com",
    role,
    locationId: "loc_a",
    locationIds: ["loc_a", "loc_b"],
    active: true,
    capabilities: role === "store" ? ["orders:read", "orders:write"] : ["orders:read", "orders:write", "store:read"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
});

afterEach(() => {
  state.session = null;
  state.selectedLocationId = null;
  state.availableLocations = [];
  state.orders = [];
  state.menuCategories = [];
  state.onboardingSummary = null;
  state.appConfig = null;
  state.ownerHome = { period: "today", chartMetric: "netSales", loading: false, report: null, error: null, ordersError: null };
});

describe("Owner Home policy and reporting periods", () => {
  it("routes only owners to V3 Owner Home", () => {
    expect(shouldRenderOwnerHome(session("owner").operator)).toBe(true);
    expect(shouldRenderOwnerHome(session("manager").operator)).toBe(false);
    expect(shouldRenderOwnerHome(session("store").operator)).toBe(false);
  });

  it("builds Today as an hourly local-date request", () => {
    expect(getReportingDateRange("today", "America/Detroit", new Date("2026-09-09T04:00:00.000Z"))).toEqual({
      start: "2026-09-09",
      end: "2026-09-10",
      granularity: "hour"
    });
  });

  it("builds 7D as six preceding local days plus an exclusive end", () => {
    expect(getReportingDateRange("7d", "America/Detroit", new Date("2026-09-09T16:00:00.000Z"))).toEqual({
      start: "2026-09-03",
      end: "2026-09-10",
      granularity: "day"
    });
  });

  it("builds 30D as twenty-nine preceding local days", () => {
    expect(getReportingDateRange("30d", "America/Detroit", new Date("2026-09-09T16:00:00.000Z"))).toEqual({
      start: "2026-08-11",
      end: "2026-09-10",
      granularity: "day"
    });
  });

  it("uses all authorized locations only in All locations context", () => {
    state.session = session("owner");
    state.availableLocations = [
      { locationId: "loc_a", locationName: "A", marketLabel: "Detroit", timezone: "America/Detroit", appConfig: {} as never },
      { locationId: "loc_b", locationName: "B", marketLabel: "Chicago", timezone: "America/Chicago", appConfig: {} as never }
    ];
    state.selectedLocationId = "all";
    expect(getOwnerReportingLocationIds()).toEqual(["loc_a", "loc_b"]);
    state.selectedLocationId = "loc_a";
    expect(getOwnerReportingLocationIds()).toEqual(["loc_a"]);
  });
});

describe("Owner Home operational and state rendering", () => {
  it("counts PAID, IN_PREP, and READY as active and excludes pending payment", () => {
    expect(getRightNowCounts([
      { status: "PAID" },
      { status: "PAID" },
      { status: "IN_PREP" },
      { status: "READY" },
      { status: "PENDING_PAYMENT" },
      { status: "COMPLETED" }
    ])).toEqual({ needsAction: 2, inPrep: 1, ready: 1, active: 4 });
  });

  it("uses canonical series values and preserves zero buckets", () => {
    expect(getChartBarHeight(50, 100)).toBe(52);
    expect(getChartBarHeight(0, 100)).toBe(0);
    expect(getChartBarHeight(0, 0)).toBe(0);
  });

  it("renders nothing for non-owner sessions", () => {
    state.session = session("manager");
    expect(renderOwnerHome()).toBe("");
  });

  it("renders the loading skeleton without replacing the shell", () => {
    state.session = session("owner");
    state.ownerHome.loading = true;
    expect(renderOwnerHome()).toContain("owner-home-kpi--skeleton");
    expect(renderOwnerHome()).toContain("owner-home-chart__loading");
  });

  it("renders a reporting error state without hiding Right Now", () => {
    state.session = session("owner");
    state.ownerHome.error = "Reporting unavailable";
    const html = renderOwnerHome();
    expect(html).toContain("Reporting is unavailable");
    expect(html).toContain("owner-home-chart--error");
    expect(html).toContain("owner-home-kpis--unavailable");
    expect(html).toContain("Right now");
  });

  it("renders an explicit mixed-timezone state", () => {
    state.session = session("owner");
    state.availableLocations = [
      { locationId: "loc_a", locationName: "A", marketLabel: "Detroit", timezone: "America/Detroit", appConfig: {} as never },
      { locationId: "loc_b", locationName: "B", marketLabel: "Los Angeles", timezone: "America/Los_Angeles", appConfig: {} as never }
    ];
    state.selectedLocationId = "all";
    expect(renderOwnerHome()).toContain("Choose a location to view performance");
  });

  it("renders unavailable metrics as unavailable rather than zero", () => {
    state.session = session("owner");
    state.selectedLocationId = "loc_a";
    state.ownerHome.report = {
      query: { locationIds: ["loc_a"], start: "2026-09-09T04:00:00.000Z", end: "2026-09-10T04:00:00.000Z", previousStart: "2026-09-08T04:00:00.000Z", previousEnd: "2026-09-09T04:00:00.000Z", timezone: "America/Detroit", granularity: "hour" },
      summary: { netSales: null, averageOrderValue: null, paidOrders: 2, grossSales: null, discounts: null, tax: null, collected: null, refunds: null, netCollected: null, dataQuality: { missingQuotePaidOrders: 0, unallocatableRefunds: 1, merchandiseMetricsComplete: false } },
      previous: { netSales: null, averageOrderValue: null, paidOrders: 0, grossSales: null, discounts: null, tax: null, collected: null, refunds: null, netCollected: null, dataQuality: { missingQuotePaidOrders: 0, unallocatableRefunds: 1, merchandiseMetricsComplete: false } },
      comparison: { netSales: { current: null, previous: null, percentChange: null }, averageOrderValue: { current: null, previous: null, percentChange: null }, paidOrders: { current: 2, previous: 0, percentChange: null }, grossSales: { current: null, previous: null, percentChange: null }, discounts: { current: null, previous: null, percentChange: null }, tax: { current: null, previous: null, percentChange: null }, collected: { current: null, previous: null, percentChange: null }, refunds: { current: null, previous: null, percentChange: null }, netCollected: { current: null, previous: null, percentChange: null } },
      series: [], locations: []
    };
    const html = renderOwnerHome();
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).toContain("The refund total is recorded, but we will not guess its merchandise split");

    const report = state.ownerHome.report;
    report.series = [{ ...report.summary, start: "2026-09-09T04:00:00.000Z", end: "2026-09-09T05:00:00.000Z" }];
    expect(renderOwnerHome()).toContain("Net sales are unavailable for this period");
    expect(renderOwnerHome()).not.toContain("No paid order activity in this period");

    state.ownerHome.chartMetric = "orders";
    expect(renderOwnerHome()).toContain("Orders: 2");

    report.summary.paidOrders = 0;
    report.comparison.paidOrders = { current: 0, previous: 2, percentChange: -100 };
    report.series = [];
    const noOrdersHtml = renderOwnerHome();
    expect(noOrdersHtml).toContain("-100.0%");
    expect(noOrdersHtml).toContain("The refund total is recorded, but we will not guess its merchandise split");
  });
});
