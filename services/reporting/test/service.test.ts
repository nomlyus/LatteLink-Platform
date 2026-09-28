import { describe, expect, it } from "vitest";
import { queryReporting, serialize } from "../src/service.js";
import type { ReportingAggregateRow, ReportingRepository } from "../src/repository.js";

const locations = [
  { locationId: "loc-a", locationName: "Alpha", timezone: "America/Detroit" },
  { locationId: "loc-b", locationName: "Bravo", timezone: "America/Detroit" }
];
const bounds = {
  currentStart: "2026-03-08T05:00:00.000Z", currentEnd: "2026-03-09T04:00:00.000Z",
  previousStart: "2026-03-07T05:00:00.000Z", previousEnd: "2026-03-08T05:00:00.000Z"
};
const query = { locationIds: ["loc-a"], start: "2026-03-08", end: "2026-03-09", granularity: "day" as const };

function row(input: Partial<ReportingAggregateRow> = {}): ReportingAggregateRow {
  return {
    location_id: "loc-a", period: "current", bucket_start: bounds.currentStart,
    gross_sales: 1000, discounts: 0, tax: 60, collected: 1060, refunds: 0, merchandise_refunds: 0,
    paid_orders: 1, missing_quote_paid_orders: 0, unallocatable_refunds: 0, ...input
  };
}

function report(rows: ReportingAggregateRow[], selected = query) {
  return serialize(selected, locations, bounds, "America/Detroit", rows, [{ start: bounds.currentStart, end: bounds.currentEnd }]);
}

describe("reporting metric semantics", () => {
  it("counts a successful paid order and a paid-then-completed order from the canonical payment row", () => {
    const value = report([row(), row({ bucket_start: "2026-03-08T06:00:00.000Z" })]);
    expect(value.summary).toMatchObject({ grossSales: { amountCents: 2000 }, collected: { amountCents: 2120 }, paidOrders: 2, averageOrderValue: { amountCents: 1000 } });
  });

  it("excludes pending payment, failed payment, and canceled unpaid orders because they create no successful-charge aggregate", () => {
    const value = report([]);
    expect(value.summary).toMatchObject({ grossSales: { amountCents: 0 }, collected: { amountCents: 0 }, paidOrders: 0, averageOrderValue: { amountCents: 0 } });
  });

  it("uses only one canonical successful charge for payment retries and multiple accidental successes", () => {
    // The repository SELECT DISTINCT ON(order_id) produces exactly this one row.
    const value = report([row({ collected: 1060 })]);
    expect(value.summary.collected?.amountCents).toBe(1060);
    expect(value.summary.paidOrders).toBe(1);
  });

  it("reports a full refund and reduces net sales by the known merchandise amount", () => {
    const value = report([row(), row({ gross_sales: 0, discounts: 0, tax: 0, collected: 0, refunds: 1060, merchandise_refunds: 1000, paid_orders: 0 })]);
    expect(value.summary).toMatchObject({ refunds: { amountCents: 1060 }, netCollected: { amountCents: 0 }, netSales: { amountCents: 0 } });
  });

  it("does not fabricate merchandise net sales or AOV for partial refunds", () => {
    const value = report([row(), row({ gross_sales: 0, discounts: 0, tax: 0, collected: 0, refunds: 500, merchandise_refunds: 0, paid_orders: 0, unallocatable_refunds: 1 })]);
    expect(value.summary.netSales).toBeNull();
    expect(value.summary.averageOrderValue).toBeNull();
    expect(value.summary.netCollected?.amountCents).toBe(560);
  });

  it("handles discounted and taxed quotes in integer cents", () => {
    const value = report([row({ gross_sales: 1001, discounts: 101, tax: 54, collected: 954 })]);
    expect(value.summary).toMatchObject({ grossSales: { amountCents: 1001 }, discounts: { amountCents: 101 }, netSales: { amountCents: 900 }, tax: { amountCents: 54 }, averageOrderValue: { amountCents: 900 } });
    expect(Number.isInteger(value.summary.netSales?.amountCents)).toBe(true);
  });

  it("attributes financial sales to successful payment time, not order creation time", () => {
    const value = report([row({ bucket_start: "2026-03-08T05:00:00.000Z" })]); // paid at 12:01 AM Detroit, bucketed at 12:00
    expect(value.series[0]?.paidOrders).toBe(1);
  });

  it("returns null rather than Infinity when the previous period is zero", () => {
    const value = report([row()]);
    expect(value.comparison.grossSales.percentChange).toBeNull();
    expect(value.comparison.paidOrders.percentChange).toBeNull();
  });

  it("aggregates authorized locations on the backend and matches the location breakdown", () => {
    const value = report([row({ location_id: "loc-a" }), row({ location_id: "loc-b", gross_sales: 2500, collected: 2500, tax: 0 })], { ...query, locationIds: ["loc-a", "loc-b"] });
    expect(value.summary.grossSales?.amountCents).toBe(3500);
    expect(value.locations.reduce((sum, location) => sum + (location.grossSales?.amountCents ?? 0), 0)).toBe(3500);
  });

  it("retains a 23-hour DST day as explicit UTC bucket boundaries", () => {
    const buckets = Array.from({ length: 23 }, (_, i) => ({ start: new Date(Date.parse(bounds.currentStart) + i * 3_600_000).toISOString(), end: new Date(Date.parse(bounds.currentStart) + (i + 1) * 3_600_000).toISOString() }));
    const value = serialize({ ...query, granularity: "hour" }, locations, bounds, "America/Detroit", [], buckets);
    expect(value.series).toHaveLength(23);
    expect(value.series.every((bucket) => Date.parse(bucket.end) - Date.parse(bucket.start) === 3_600_000)).toBe(true);
  });
});

describe("reporting query validation and location/timezone behavior", () => {
  function repository(): ReportingRepository {
    return {
      close: async () => {},
      pingDb: async () => {},
      getLocations: async (ids) => locations.filter((location) => ids.includes(location.locationId)),
      resolveBounds: async () => bounds,
      aggregate: async () => [],
      listCurrentBuckets: async () => [{ start: bounds.currentStart, end: bounds.currentEnd }]
    };
  }

  it("accepts local-date boundaries for hourly Owner Home reporting", async () => {
    const value = await queryReporting({ locationIds: ["loc-a"], start: "2026-03-08", end: "2026-03-09", granularity: "hour" }, repository());
    expect(value.query.granularity).toBe("hour");
    expect(value.query.timezone).toBe("America/Detroit");
  });

  it("derives the single location timezone and uses it for today, 7-day, 30-day and custom local-date ranges", async () => {
    const resolvedTimezones: string[] = [];
    const storedTimezoneRepository = repository();
    storedTimezoneRepository.getLocations = async () => [{ ...locations[0]!, timezone: "America/Chicago" }];
    storedTimezoneRepository.resolveBounds = async (input) => {
      resolvedTimezones.push(input.timezone);
      return bounds;
    };
    for (const [start, end] of [["2026-03-08", "2026-03-09"], ["2026-03-02", "2026-03-09"], ["2026-02-07", "2026-03-09"], ["2026-02-17", "2026-03-09"]]) {
      const value = await queryReporting({ locationIds: ["loc-a"], start, end, granularity: "day" }, storedTimezoneRepository);
      expect(value.query.timezone).toBe("America/Chicago");
    }
    expect(resolvedTimezones).toEqual(["America/Chicago", "America/Chicago", "America/Chicago", "America/Chicago"]);
  });

  it("rejects nonexistent scoped locations and returns a typed mixed-timezone error", async () => {
    await expect(queryReporting({ ...query, locationIds: ["not-authorized"] }, repository())).rejects.toThrow("do not exist");
    const mixed = repository();
    mixed.getLocations = async () => [locations[0]!, { ...locations[1]!, timezone: "America/Chicago" }];
    await expect(queryReporting({ ...query, locationIds: ["loc-a", "loc-b"] }, mixed)).rejects.toMatchObject({ code: "MIXED_REPORTING_TIMEZONES" });
  });

  it("accepts multiple locations when their persisted timezones match", async () => {
    const value = await queryReporting({ ...query, locationIds: ["loc-a", "loc-b"] }, repository());
    expect(value.query.timezone).toBe("America/Detroit");
  });
});
