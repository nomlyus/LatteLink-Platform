import {
  reportingResponseSchema,
  reportingScopedQuerySchema,
  type ReportingQuery,
  type ReportingResponse
} from "@lattelink/contracts-reporting";
import type { ReportingAggregateRow, ReportingBucket, ReportingLocation, ReportingRepository } from "./repository.js";

type RawMetrics = {
  grossSales: number;
  discounts: number;
  tax: number;
  collected: number;
  refunds: number;
  merchandiseRefunds: number;
  paidOrders: number;
  missingQuotePaidOrders: number;
  unallocatableRefunds: number;
};

const emptyRaw = (): RawMetrics => ({
  grossSales: 0, discounts: 0, tax: 0, collected: 0, refunds: 0, merchandiseRefunds: 0,
  paidOrders: 0, missingQuotePaidOrders: 0, unallocatableRefunds: 0
});

function integer(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Reporting aggregate exceeds JavaScript integer safety");
  return parsed;
}

function add(target: RawMetrics, row: ReportingAggregateRow) {
  target.grossSales += integer(row.gross_sales);
  target.discounts += integer(row.discounts);
  target.tax += integer(row.tax);
  target.collected += integer(row.collected);
  target.refunds += integer(row.refunds);
  target.merchandiseRefunds += integer(row.merchandise_refunds);
  target.paidOrders += integer(row.paid_orders);
  target.missingQuotePaidOrders += integer(row.missing_quote_paid_orders);
  target.unallocatableRefunds += integer(row.unallocatable_refunds);
}

function money(amountCents: number) { return { currency: "USD" as const, amountCents }; }

function toMetrics(raw: RawMetrics) {
  const merchandiseMetricsComplete = raw.missingQuotePaidOrders === 0 && raw.unallocatableRefunds === 0;
  const netSales = merchandiseMetricsComplete ? raw.grossSales - raw.discounts - raw.merchandiseRefunds : null;
  return {
    grossSales: raw.missingQuotePaidOrders === 0 ? money(raw.grossSales) : null,
    discounts: raw.missingQuotePaidOrders === 0 ? money(raw.discounts) : null,
    netSales: netSales === null ? null : money(netSales),
    tax: raw.missingQuotePaidOrders === 0 ? money(raw.tax) : null,
    collected: money(raw.collected),
    refunds: money(raw.refunds),
    netCollected: money(raw.collected - raw.refunds),
    paidOrders: raw.paidOrders,
    // Integer-cents, half-up rounding; no float currency arithmetic.
    averageOrderValue: raw.paidOrders === 0
      ? money(0)
      : netSales === null
        ? null
        : money(Math.floor((netSales + Math.floor(raw.paidOrders / 2)) / raw.paidOrders)),
    dataQuality: {
      missingQuotePaidOrders: raw.missingQuotePaidOrders,
      unallocatableRefunds: raw.unallocatableRefunds,
      merchandiseMetricsComplete
    }
  };
}

function percent(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function moneyComparison(current: { amountCents: number } | null, previous: { amountCents: number } | null) {
  return { current, previous, percentChange: percent(current?.amountCents ?? null, previous?.amountCents ?? null) };
}

function metricsComparison(current: ReturnType<typeof toMetrics>, previous: ReturnType<typeof toMetrics>) {
  return {
    grossSales: moneyComparison(current.grossSales, previous.grossSales),
    discounts: moneyComparison(current.discounts, previous.discounts),
    netSales: moneyComparison(current.netSales, previous.netSales),
    tax: moneyComparison(current.tax, previous.tax),
    collected: moneyComparison(current.collected, previous.collected),
    refunds: moneyComparison(current.refunds, previous.refunds),
    netCollected: moneyComparison(current.netCollected, previous.netCollected),
    paidOrders: { current: current.paidOrders, previous: previous.paidOrders, percentChange: percent(current.paidOrders, previous.paidOrders) },
    averageOrderValue: moneyComparison(current.averageOrderValue, previous.averageOrderValue)
  };
}

function iso(value: Date | string) { return new Date(value).toISOString(); }

function assertBoundaryAlignment(query: ReportingQuery) {
  if (query.granularity === "day" && (!/^\d{4}-\d{2}-\d{2}$/.test(query.start) || !/^\d{4}-\d{2}-\d{2}$/.test(query.end))) {
    throw new ReportingInputError("Day reporting requires whole local-date boundaries (YYYY-MM-DD).");
  }
  // The Owner Home requests Today as a local calendar date while asking the
  // service for hourly buckets. Dates resolve to local midnight in the
  // persisted location timezone; explicit datetimes are also accepted when
  // they are aligned to the top of an hour.
  const hourBoundary = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:00(?::00)?)?$/;
  if (query.granularity === "hour" && (!hourBoundary.test(query.start) || !hourBoundary.test(query.end))) {
    throw new ReportingInputError("Hour reporting requires local date or hour-aligned boundaries.");
  }
}

function assertTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { throw new ReportingInputError("timezone must be a valid IANA timezone identifier."); }
}

export class ReportingInputError extends Error {
  constructor(message: string, readonly code = "INVALID_REPORTING_QUERY") {
    super(message);
  }
}

export async function queryReporting(input: unknown, repository: ReportingRepository): Promise<ReportingResponse> {
  const query = reportingScopedQuerySchema.parse(input);
  assertBoundaryAlignment(query);
  const locations = await repository.getLocations(query.locationIds);
  if (locations.length !== query.locationIds.length) throw new ReportingInputError("One or more requested locations do not exist.");

  const storedTimezones = new Set(locations.map((location) => location.timezone));
  if (storedTimezones.size !== 1) {
    throw new ReportingInputError(
      "Selected locations use different store timezones; query each store separately until location-local portfolio bucketing is added.",
      "MIXED_REPORTING_TIMEZONES"
    );
  }
  const timezone = locations[0]!.timezone;
  assertTimezone(timezone);

  const bounds = await repository.resolveBounds({ start: query.start, end: query.end, timezone });
  if (bounds.currentStart >= bounds.currentEnd) throw new ReportingInputError("end must be after start.");
  const rows = await repository.aggregate({ locationIds: query.locationIds, bounds, timezone, granularity: query.granularity });
  const buckets = await repository.listCurrentBuckets({ ...bounds, start: query.start, end: query.end, timezone, granularity: query.granularity });
  return serialize(query, locations, bounds, timezone, rows, buckets);
}

export function serialize(
  query: ReportingQuery,
  locations: ReportingLocation[],
  bounds: { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string },
  timezone: string,
  rows: ReportingAggregateRow[],
  buckets: ReportingBucket[]
): ReportingResponse {
  const current = emptyRaw();
  const previous = emptyRaw();
  const currentByLocation = new Map(query.locationIds.map((id) => [id, emptyRaw()]));
  const byBucket = new Map<string, RawMetrics>();
  for (const row of rows) {
    const target = row.period === "current" ? current : previous;
    add(target, row);
    if (row.period === "current") {
      add(currentByLocation.get(row.location_id) ?? emptyRaw(), row);
      const key = iso(row.bucket_start);
      const bucket = byBucket.get(key) ?? emptyRaw();
      add(bucket, row);
      byBucket.set(key, bucket);
    }
  }
  const currentMetrics = toMetrics(current);
  const previousMetrics = toMetrics(previous);
  const locationById = new Map(locations.map((location) => [location.locationId, location]));
  return reportingResponseSchema.parse({
    query: { locationIds: query.locationIds, start: bounds.currentStart, end: bounds.currentEnd, previousStart: bounds.previousStart, previousEnd: bounds.previousEnd, timezone, granularity: query.granularity },
    summary: currentMetrics,
    previous: previousMetrics,
    comparison: metricsComparison(currentMetrics, previousMetrics),
    series: buckets.map((bucket) => ({ start: bucket.start, end: bucket.end, ...toMetrics(byBucket.get(bucket.start) ?? emptyRaw()) })),
    locations: query.locationIds.map((locationId) => ({
      locationId,
      locationName: locationById.get(locationId)?.locationName ?? locationId,
      ...toMetrics(currentByLocation.get(locationId) ?? emptyRaw())
    }))
  });
}
