import { isApiRequestError } from "../../api";

export type OwnerPeriod = "today" | "7d" | "30d";
export type OwnerChartMetric = "netSales" | "orders";

function localDateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function dateKey(parts: { year: number; month: number; day: number }) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getReportingDateRange(period: OwnerPeriod, timezone: string, now = new Date()) {
  const current = dateKey(localDateParts(now, timezone));
  const start = period === "today" ? current : shiftDateKey(current, period === "7d" ? -6 : -29);
  return {
    start,
    end: shiftDateKey(current, 1),
    granularity: period === "today" ? ("hour" as const) : ("day" as const)
  };
}

export function resolveOwnerReportingTimezone(
  selectedLocationId: string | "all" | null,
  locations: readonly { locationId: string; timezone?: string }[]
) {
  if (selectedLocationId !== "all") {
    return locations.find((location) => location.locationId === selectedLocationId)?.timezone ?? null;
  }
  const timezones = [...new Set(locations.map((location) => location.timezone).filter((timezone): timezone is string => Boolean(timezone)))];
  return timezones.length === 1 ? timezones[0] : timezones.length > 1 ? "mixed" : null;
}

export function getOwnerReportingLocationIds(
  selectedLocationId: string | "all" | null,
  locations: readonly { locationId: string }[]
) {
  if (selectedLocationId === "all") return locations.map((location) => location.locationId);
  return selectedLocationId ? [selectedLocationId] : [];
}

export function getChartBarHeight(value: number, max: number, maxHeight = 104) {
  return max > 0 ? Math.round((Math.abs(value) / max) * maxHeight) : 0;
}

export function formatReportMetric(metric: { amountCents: number } | null | undefined) {
  return metric ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(metric.amountCents / 100) : "Unavailable";
}

export function getComparisonLabel(percentChange: number | null, unavailable: boolean) {
  if (unavailable) return "Unavailable";
  if (percentChange === null) return "No prior data";
  const sign = percentChange > 0 ? "+" : "";
  return `${sign}${percentChange.toFixed(1)}%`;
}

export function reportingErrorCode(error: unknown) {
  if (!isApiRequestError(error)) return null;
  const payload = error.payload;
  return typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code : null;
}
