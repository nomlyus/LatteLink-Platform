import { describe, expect, it } from "vitest";
import {
  getChartBarHeight,
  getOwnerReportingLocationIds,
  getReportingDateRange
} from "../src/features/home/owner-home-domain";

describe("React Owner Home reporting domain", () => {
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
});
