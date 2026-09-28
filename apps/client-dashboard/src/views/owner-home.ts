import type { ReportingResponse } from "@lattelink/contracts-reporting";
import { isApiRequestError } from "../api";
import { getSelectedLocation, hasMultipleLocations, isAllLocationsSelected, state } from "../state";
import { escapeHtml, formatCompactCount, formatMoney } from "../ui/format";

export type OwnerPeriod = "today" | "7d" | "30d";
export type OwnerChartMetric = "netSales" | "orders";

export function shouldRenderOwnerHome(operator: { role?: string } | null | undefined) {
  return operator?.role === "owner";
}

const periodLabels: Record<OwnerPeriod, string> = { today: "Today", "7d": "7D", "30d": "30D" };

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

export function resolveOwnerReportingTimezone() {
  if (!isAllLocationsSelected()) {
    return getSelectedLocation()?.timezone ?? null;
  }
  const timezones = [...new Set(state.availableLocations.map((location) => location.timezone).filter(Boolean))];
  return timezones.length === 1 ? timezones[0] : timezones.length > 1 ? "mixed" : null;
}

export function getOwnerReportingLocationIds() {
  if (isAllLocationsSelected()) {
    return state.availableLocations.map((location) => location.locationId);
  }
  return state.selectedLocationId ? [state.selectedLocationId] : [];
}

export function getChartBarHeight(value: number, max: number, maxHeight = 104) {
  return max > 0 ? Math.round((Math.abs(value) / max) * maxHeight) : 0;
}

function formatMetric(metric: { amountCents: number } | null | undefined) {
  return metric ? formatMoney(metric.amountCents) : "Unavailable";
}

function comparisonLabel(percentChange: number | null, unavailable: boolean) {
  if (unavailable) return "Unavailable";
  if (percentChange === null) return "No prior data";
  const sign = percentChange > 0 ? "+" : "";
  return `${sign}${percentChange.toFixed(1)}%`;
}

function renderKpi(label: string, value: string, change: string, tone = "") {
  return `<article class="owner-home-kpi">
    <div class="owner-home-kpi__value">${escapeHtml(value)}</div>
    <div class="owner-home-kpi__label">${escapeHtml(label)}</div>
    <div class="owner-home-kpi__comparison ${tone ? `owner-home-kpi__comparison--${tone}` : ""}">${escapeHtml(change)} <span>vs previous period</span></div>
  </article>`;
}

function renderKpiSkeleton() {
  return `<div class="owner-home-kpi owner-home-kpi--skeleton" aria-hidden="true"><span class="owner-home-skeleton owner-home-skeleton--value"></span><span class="owner-home-skeleton owner-home-skeleton--label"></span><span class="owner-home-skeleton owner-home-skeleton--meta"></span></div>`;
}

function renderChart(report: ReportingResponse | null, loading: boolean) {
  const metric = state.ownerHome.chartMetric;
  const series = report?.series ?? [];
  const values = series.map((bucket) => metric === "orders" ? bucket.paidOrders : bucket.netSales?.amountCents ?? 0);
  const max = Math.max(0, ...values.map((value) => Math.abs(value)));
  const noActivity = !loading && series.length > 0 && values.every((value) => value === 0) && series.every((bucket) => bucket.paidOrders === 0);
  const salesUnavailable = !loading && metric === "netSales" && series.some((bucket) => bucket.netSales === null);
  const timezone = report?.query.timezone;
  const formatBucket = (bucket: ReportingResponse["series"][number]) => {
    const date = new Date(bucket.start);
    if (report?.query.granularity === "hour") {
      return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric" }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "numeric", day: "numeric" }).format(date);
  };
  return `<section class="owner-home-chart" aria-labelledby="owner-home-performance-title">
    <div class="owner-home-chart__header">
      <div><h2 id="owner-home-performance-title">Performance</h2></div>
      <div class="owner-home-toggle" role="group" aria-label="Performance metric">
        <button type="button" class="${metric === "netSales" ? "is-active" : ""}" data-action="set-owner-chart-metric" data-chart-metric="netSales">Net Sales</button>
        <button type="button" class="${metric === "orders" ? "is-active" : ""}" data-action="set-owner-chart-metric" data-chart-metric="orders">Orders</button>
      </div>
    </div>
    <div class="owner-home-chart__plot" aria-label="${metric === "netSales" ? "Net sales" : "Orders"} by ${report?.query.granularity ?? "time"}">
      ${loading ? (isAllLocationsSelected() ? `<div class="owner-home-chart__loading">${Array.from({ length: 12 }, () => '<span class="owner-home-skeleton owner-home-skeleton--bar"></span>').join("")}</div>` : `<div class="owner-home-chart__loading owner-home-chart__loading--roomy"><span class="owner-home-skeleton owner-home-skeleton--chart"></span></div>`) : salesUnavailable || series.length === 0 || noActivity ? `<div class="owner-home-chart__empty">${salesUnavailable ? "Net sales are unavailable for this period" : noActivity ? "No paid order activity in this period" : "No chart activity for this period"}</div>` : `<div class="owner-home-bars" style="--owner-series-count:${series.length}">${series.map((bucket, index) => {
        const value = values[index] ?? 0;
        const height = getChartBarHeight(value, max);
        const label = formatBucket(bucket);
        const display = metric === "orders" ? `${formatCompactCount(bucket.paidOrders)} orders` : formatMetric(bucket.netSales);
        const showLabel = series.length <= 8 || index === 0 || index === series.length - 1 || index % Math.ceil(series.length / 7) === 0;
        return `<button type="button" class="owner-home-bar" style="--owner-bar-height:${height}px" aria-label="${escapeHtml(`${label}: ${display}`)}"><span class="owner-home-bar__fill"></span><span class="owner-home-bar__tooltip"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(`Sales: ${formatMetric(bucket.netSales)}`)}</span><span>${escapeHtml(`Orders: ${formatCompactCount(bucket.paidOrders)}`)}</span></span>${showLabel ? `<span class="owner-home-bar__label">${escapeHtml(label)}</span>` : ""}</button>`;
      }).join("")}</div>`}
    </div>
  </section>`;
}

function renderChartError(message: string) {
  return `<section class="owner-home-chart owner-home-chart--error" aria-labelledby="owner-home-performance-title">
    <div class="owner-home-chart__header">
      <div><h2 id="owner-home-performance-title">Performance</h2></div>
      <div class="owner-home-toggle" aria-hidden="true"><span>Net Sales</span><span>Orders</span></div>
    </div>
    <div class="owner-home-chart__empty" role="status"><strong>Reporting is unavailable</strong><span>${escapeHtml(message)}</span></div>
  </section>`;
}

function renderUnavailableKpis() {
  return `<section class="owner-home-kpis owner-home-kpis--unavailable" aria-label="Business performance unavailable">
    ${renderKpi("Net sales", "—", "Unavailable", "neutral")}
    ${renderKpi("Orders", "—", "Unavailable", "neutral")}
    ${renderKpi("Avg order", "—", "Unavailable", "neutral")}
  </section>`;
}

function renderAttention(loading: boolean) {
  if (loading) {
    return `<section class="owner-home-panel owner-home-attention owner-home-attention--loading" aria-label="Needs attention loading" aria-busy="true">
      <span class="owner-home-skeleton owner-home-skeleton--title" aria-hidden="true"></span>
      <div class="owner-home-attention__skeletons" aria-hidden="true"><span></span><span></span></div>
    </section>`;
  }
  return `<section class="owner-home-panel owner-home-attention owner-home-attention--planned" aria-labelledby="owner-home-attention-title">
    <div class="owner-home-panel__heading"><div><h2 id="owner-home-attention-title">Needs attention</h2></div></div>
    <div class="owner-home-attention__planned"><span class="owner-home-planned-pill">Planned</span></div>
  </section>`;
}

function renderLocations(report: ReportingResponse | null, loading: boolean) {
  if (!hasMultipleLocations() || !isAllLocationsSelected()) return "";
  if (loading) return `<section class="owner-home-panel owner-home-locations"><span class="owner-home-skeleton owner-home-skeleton--title"></span><span class="owner-home-skeleton owner-home-skeleton--row"></span><span class="owner-home-skeleton owner-home-skeleton--row"></span></section>`;
  const locations = report?.locations ?? [];
  return `<section class="owner-home-panel owner-home-locations" aria-labelledby="owner-home-locations-title"><div class="owner-home-panel__heading"><div><h2 id="owner-home-locations-title">Location performance</h2></div><p class="owner-home-panel__hint">All locations · same reporting timezone</p></div><div class="owner-home-location-table"><div class="owner-home-location-table__head"><span>Location</span><span>Net Sales</span><span>Orders</span><span>Avg Order</span><span>Change</span></div>${locations.map((location) => `<div class="owner-home-location-row"><span>${escapeHtml(location.locationName)}</span><span>${escapeHtml(formatMetric(location.netSales))}</span><span>${escapeHtml(formatCompactCount(location.paidOrders))}</span><span>${escapeHtml(formatMetric(location.averageOrderValue))}</span><span>—</span></div>`).join("")}</div></section>`;
}

function renderMixedTimezone() {
  return `<section class="owner-home-state owner-home-state--mixed" role="status"><span class="owner-home-state__icon" aria-hidden="true">◌</span><h2>Choose a location to view performance</h2><p>All locations use different reporting timezones. Select one location from the workspace selector to continue.</p></section>`;
}

function renderReportingError(mixedTimezone = false) {
  const mixed = mixedTimezone || state.ownerHome.error === "MIXED_REPORTING_TIMEZONES";
  if (mixed) return renderMixedTimezone();
  return `<section class="owner-home-state owner-home-state--error" role="alert"><span class="owner-home-state__icon" aria-hidden="true">!</span><h2>Reporting is unavailable</h2><p>${escapeHtml(state.ownerHome.error ?? "We couldn’t load performance data right now.")}</p><button type="button" data-action="refresh">Try again</button></section>`;
}

export function renderOwnerHome() {
  if (!shouldRenderOwnerHome(state.session?.operator)) return "";
  const pageLoading = state.loading;
  const reportingLoading = pageLoading || state.ownerHome.loading;
  const report = state.ownerHome.report;
  const timezoneState = resolveOwnerReportingTimezone();
  const reportingUnavailable = !reportingLoading && (state.ownerHome.error || timezoneState === "mixed");
  const summary = report?.summary;
  const comparison = report?.comparison;
  const netSalesUnavailable = summary ? summary.netSales === null : false;
  const averageUnavailable = summary ? summary.averageOrderValue === null : false;
  const currentDataQuality = summary?.dataQuality;
  const previousDataQuality = report?.previous.dataQuality;
  const hasUnallocatableRefunds = Boolean(
    (currentDataQuality?.unallocatableRefunds ?? 0) > 0 || (previousDataQuality?.unallocatableRefunds ?? 0) > 0
  );
  const hasMissingQuoteData = Boolean(
    (currentDataQuality?.missingQuotePaidOrders ?? 0) > 0 || (previousDataQuality?.missingQuotePaidOrders ?? 0) > 0
  );
  const dataQualityMessage = hasUnallocatableRefunds
    ? "A historical refund has no item allocation. The refund total is recorded, but we will not guess its merchandise split."
    : hasMissingQuoteData
      ? "Some paid orders are missing their quote details, so merchandise metrics cannot be calculated yet."
      : "Some reporting metrics are unavailable. Valid metrics continue to display.";
  const noPaidOrders = Boolean(summary && summary.paidOrders === 0);
  const showDataQualityNotice = Boolean(!reportingLoading && summary && (netSalesUnavailable || averageUnavailable));
  const experienceClass = isAllLocationsSelected() ? "owner-home--all-locations" : "owner-home--single-location";
  const emptyClass = noPaidOrders ? " owner-home--empty" : "";
  return `<div class="owner-home ${experienceClass}${emptyClass}" aria-label="Owner home">
    <div class="owner-home__controls"><div class="owner-home-period"><div role="group" aria-label="Reporting period">${(["today", "7d", "30d"] as OwnerPeriod[]).map((period) => `<button type="button" class="${state.ownerHome.period === period ? "is-active" : ""}" data-action="set-owner-period" data-period="${period}">${periodLabels[period]}</button>`).join("")}</div></div></div>
    ${timezoneState === "mixed" && !reportingLoading ? renderReportingError(true) : reportingUnavailable ? renderUnavailableKpis() : `<section class="owner-home-kpis" aria-label="Business performance">${reportingLoading || !summary || !comparison ? `${renderKpiSkeleton()}${renderKpiSkeleton()}${renderKpiSkeleton()}` : `${renderKpi("Net sales", formatMetric(summary.netSales), comparisonLabel(comparison.netSales.percentChange, netSalesUnavailable), comparison.netSales.percentChange === null ? "neutral" : comparison.netSales.percentChange > 0 ? "positive" : "negative")}${renderKpi("Orders", formatCompactCount(summary.paidOrders), comparisonLabel(comparison.paidOrders.percentChange, false), comparison.paidOrders.percentChange === null ? "neutral" : comparison.paidOrders.percentChange > 0 ? "positive" : "negative")}${renderKpi("Avg order", formatMetric(summary.averageOrderValue), comparisonLabel(comparison.averageOrderValue.percentChange, averageUnavailable), comparison.averageOrderValue.percentChange === null ? "neutral" : comparison.averageOrderValue.percentChange > 0 ? "positive" : "negative")}`}</section>`}
    ${showDataQualityNotice ? `<p class="owner-home-data-quality" role="status">${dataQualityMessage}</p>` : ""}
    ${timezoneState === "mixed" && !reportingLoading ? "" : reportingUnavailable ? renderChartError(state.ownerHome.error ?? "We couldn’t load performance data right now.") : renderChart(report, reportingLoading)}
    <div class="owner-home-operations">${renderAttention(pageLoading)}</div>
    ${timezoneState === "mixed" && !reportingLoading ? "" : reportingUnavailable ? "" : renderLocations(report, reportingLoading)}
  </div>`;
}

export function reportingErrorCode(error: unknown) {
  if (!isApiRequestError(error)) return null;
  const payload = error.payload;
  return typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code : null;
}
