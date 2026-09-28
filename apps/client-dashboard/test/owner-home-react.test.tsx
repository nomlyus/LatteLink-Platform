import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReportingResponse } from "@lattelink/contracts-reporting";
import type { DashboardLocation, OperatorSession } from "../src/api";
import { OwnerHomeMetrics } from "../src/features/home/components/OwnerHomeMetrics";
import { OwnerHomePerformanceChart } from "../src/features/home/components/OwnerHomePerformanceChart";
import { getReportingDateRange } from "../src/features/home/owner-home-domain";
import { createOwnerReportRequestEpoch, requestOwnerReport } from "../src/features/home/owner-home-report";
import { resolveOperatorOverviewState } from "../src/features/home/components/OperatorOverviewPage";

const session = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "test-access",
  refreshToken: "test-refresh",
  expiresAt: "2099-01-01T00:00:00.000Z",
  operator: { operatorUserId: "11111111-1111-4111-8111-111111111111", role: "owner", locationId: "loc-a", locationIds: ["loc-a", "loc-b"], capabilities: ["store:read"] }
} as unknown as OperatorSession;

const locations = [
  { locationId: "loc-a", locationName: "Detroit", marketLabel: "Detroit", timezone: "America/Detroit" },
  { locationId: "loc-b", locationName: "Chicago", marketLabel: "Chicago", timezone: "America/Detroit" }
] as DashboardLocation[];

const report = {
  query: { locationIds: ["loc-a"], start: "2026-09-09T04:00:00.000Z", end: "2026-09-10T04:00:00.000Z", previousStart: "2026-09-08T04:00:00.000Z", previousEnd: "2026-09-09T04:00:00.000Z", timezone: "America/Detroit", granularity: "hour" },
  summary: { netSales: { amountCents: 12345, currency: "USD" }, averageOrderValue: { amountCents: 0, currency: "USD" }, paidOrders: 0, dataQuality: { missingQuotePaidOrders: 0, unallocatableRefunds: 0, merchandiseMetricsComplete: true } },
  previous: { dataQuality: { missingQuotePaidOrders: 0, unallocatableRefunds: 0, merchandiseMetricsComplete: true } },
  comparison: { netSales: { percentChange: null }, averageOrderValue: { percentChange: null }, paidOrders: { percentChange: null } },
  series: [],
  locations: []
} as unknown as ReportingResponse;

describe("React Owner Home metrics and chart", () => {
  it("shows a local-date hourly range for Today and calendar-day ranges for historical periods", () => {
    expect(getReportingDateRange("today", "America/Detroit", new Date("2026-09-09T04:00:00.000Z"))).toEqual({
      start: "2026-09-09", end: "2026-09-10", granularity: "hour"
    });
    expect(getReportingDateRange("7d", "America/Detroit", new Date("2026-09-09T16:00:00.000Z"))).toEqual({
      start: "2026-09-03", end: "2026-09-10", granularity: "day"
    });
  });

  it("renders loading separately and preserves authoritative zero and unavailable values", () => {
    const loading = renderToStaticMarkup(<OwnerHomeMetrics report={null} loading unavailable={false} />);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("owner-home-kpi--skeleton");

    const success = renderToStaticMarkup(<OwnerHomeMetrics report={report} loading={false} unavailable={false} />);
    expect(success).toContain("$123.45");
    expect(success).toContain("$0.00");
    expect(success).toContain(">0</div>");

    const unavailable = renderToStaticMarkup(<OwnerHomeMetrics report={null} loading={false} unavailable />);
    expect(unavailable).toContain("Unavailable");
    expect(unavailable).not.toContain("$0.00");
  });

  it("keeps the chart metric toggle interactive and reports no activity without fabricating values", () => {
    const emptyReport = { ...report, series: [] };
    const html = renderToStaticMarkup(
      <OwnerHomePerformanceChart report={emptyReport} metric="netSales" loading={false} allLocations={false} error={null} onMetricChange={vi.fn()} />
    );
    expect(html).toContain('aria-label="Performance metric"');
    expect(html).toContain("No chart activity for this period");
  });
});

describe("Owner Home reporting lifecycle", () => {
  it("preserves the existing manager Home state preview query", () => {
    expect(resolveOperatorOverviewState("?homeState=no-connection", true, "ready", null)).toBe("no-connection");
    expect(resolveOperatorOverviewState("?homeState=all", true, "ready", null)).toBe("all");
    expect(resolveOperatorOverviewState("?unrelated=1", false, "ready", null)).toBe("no-connection");
  });

  it("requests all authorized locations only for All Locations and forwards server parameters", async () => {
    const fetchReport = vi.fn(async () => report);
    const result = await requestOwnerReport({
      session,
      locations,
      selectedLocationId: "all",
      period: "7d",
      signal: new AbortController().signal,
      now: new Date("2026-09-09T16:00:00.000Z"),
      fetchReport
    });
    expect(result).toEqual({ status: "ready", report });
    expect(fetchReport).toHaveBeenCalledWith(session, ["loc-a", "loc-b"], {
      start: "2026-09-03", end: "2026-09-10", granularity: "day"
    }, expect.any(AbortSignal));
  });

  it("uses the selected location's own timezone and never expands a scoped request to all locations", async () => {
    const fetchReport = vi.fn(async () => report);
    const scopedLocations = [locations[0]!, { ...locations[1]!, timezone: "America/Los_Angeles" }];
    const result = await requestOwnerReport({
      session,
      locations: scopedLocations,
      selectedLocationId: "loc-b",
      period: "today",
      signal: new AbortController().signal,
      now: new Date("2026-09-09T07:00:00.000Z"),
      fetchReport
    });
    expect(result.status).toBe("ready");
    expect(fetchReport).toHaveBeenCalledWith(session, ["loc-b"], {
      start: "2026-09-09", end: "2026-09-10", granularity: "hour"
    }, expect.any(AbortSignal));
  });

  it("requires one reporting timezone for All Locations and returns a distinct mixed-timezone state", async () => {
    const fetchReport = vi.fn();
    const result = await requestOwnerReport({
      session,
      locations: [locations[0]!, { ...locations[1]!, timezone: "America/Chicago" }],
      selectedLocationId: "all",
      period: "today",
      signal: new AbortController().signal,
      fetchReport
    });
    expect(result).toEqual({ status: "mixed-timezones" });
    expect(fetchReport).not.toHaveBeenCalled();
  });

  it("keeps API failures distinct from a successful zero-valued response", async () => {
    const result = await requestOwnerReport({
      session,
      locations,
      selectedLocationId: "loc-a",
      period: "today",
      signal: new AbortController().signal,
      fetchReport: async () => { throw new Error("reporting unavailable"); }
    });
    expect(result).toEqual({ status: "error", error: "reporting unavailable" });
  });

  it("ignores a cancelled request and invalidates older request epochs", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await requestOwnerReport({
      session,
      locations,
      selectedLocationId: "loc-a",
      period: "today",
      signal: controller.signal,
      fetchReport: vi.fn()
    });
    expect(cancelled).toEqual({ status: "cancelled" });

    const epochs = createOwnerReportRequestEpoch();
    const first = epochs.begin();
    const second = epochs.begin();
    expect(epochs.isCurrent(first)).toBe(false);
    expect(epochs.isCurrent(second)).toBe(true);
    epochs.invalidate();
    expect(epochs.isCurrent(second)).toBe(false);
  });
});
