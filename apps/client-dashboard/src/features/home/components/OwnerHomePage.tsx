"use client";

import React from "react";
import type { ReportingResponse } from "@lattelink/contracts-reporting";
import { formatCompactCount } from "../../../ui/format";
import type { OwnerPeriod } from "../owner-home-domain";
import { formatReportMetric } from "../owner-home-domain";
import { useDashboardLocation } from "../../location/location-provider";
import { OwnerHomeMetrics } from "./OwnerHomeMetrics";
import { OwnerHomePerformanceChart } from "./OwnerHomePerformanceChart";
import { useOwnerHomeReport } from "../use-owner-home-report";

const periodLabels: Record<OwnerPeriod, string> = { today: "Today", "7d": "7D", "30d": "30D" };

function AttentionPanel({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <section className="owner-home-panel owner-home-attention owner-home-attention--loading" aria-label="Needs attention loading" aria-busy="true">
        <span className="owner-home-skeleton owner-home-skeleton--title" aria-hidden="true" />
        <div className="owner-home-attention__skeletons" aria-hidden="true"><span /><span /></div>
      </section>
    );
  }
  return (
    <section className="owner-home-panel owner-home-attention owner-home-attention--planned" aria-labelledby="owner-home-attention-title">
      <div className="owner-home-panel__heading"><div><h2 id="owner-home-attention-title">Needs attention</h2></div></div>
      <div className="owner-home-attention__planned"><span className="owner-home-planned-pill">Planned</span></div>
    </section>
  );
}

function MixedTimezoneState() {
  return (
    <section className="owner-home-state owner-home-state--mixed" role="status">
      <span className="owner-home-state__icon" aria-hidden="true">◌</span>
      <h2>Choose a location to view performance</h2>
      <p>All locations use different reporting timezones. Select one location from the workspace selector to continue.</p>
    </section>
  );
}

function DataQualityNotice({ report }: { report: ReportingResponse }) {
  const current = report.summary?.dataQuality;
  const previous = report.previous.dataQuality;
  const hasUnallocatableRefunds = (current?.unallocatableRefunds ?? 0) > 0 || (previous?.unallocatableRefunds ?? 0) > 0;
  const hasMissingQuoteData = (current?.missingQuotePaidOrders ?? 0) > 0 || (previous?.missingQuotePaidOrders ?? 0) > 0;
  if (!hasUnallocatableRefunds && !hasMissingQuoteData) return null;
  const message = hasUnallocatableRefunds
    ? "A historical refund has no item allocation. The refund total is recorded, but we will not guess its merchandise split."
    : "Some paid orders are missing their quote details, so merchandise metrics cannot be calculated yet.";
  return <p className="owner-home-data-quality" role="status">{message}</p>;
}

function LocationPerformance({ report, loading }: { report: ReportingResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="owner-home-panel owner-home-locations" aria-label="Location performance loading" aria-busy="true">
        <span className="owner-home-skeleton owner-home-skeleton--title" />
        <span className="owner-home-skeleton owner-home-skeleton--row" />
        <span className="owner-home-skeleton owner-home-skeleton--row" />
      </section>
    );
  }
  const locations = report?.locations ?? [];
  return (
    <section className="owner-home-panel owner-home-locations" aria-labelledby="owner-home-locations-title">
      <div className="owner-home-panel__heading">
        <div><h2 id="owner-home-locations-title">Location performance</h2></div>
        <p className="owner-home-panel__hint">All locations · same reporting timezone</p>
      </div>
      <div className="owner-home-location-table">
        <div className="owner-home-location-table__head"><span>Location</span><span>Net Sales</span><span>Orders</span><span>Avg Order</span><span>Change</span></div>
        {locations.map((location) => (
          <div className="owner-home-location-row" key={location.locationId}>
            <span>{location.locationName}</span>
            <span>{formatReportMetric(location.netSales)}</span>
            <span>{formatCompactCount(location.paidOrders)}</span>
            <span>{formatReportMetric(location.averageOrderValue)}</span>
            <span>—</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OwnerHomePage() {
  const reportState = useOwnerHomeReport();
  const location = useDashboardLocation();
  const allLocations = location.isAllLocations;
  const hasMultipleLocations = location.availableLocations.length > 1 || location.selectedLocationId === "all";
  const loading = reportState.status === "loading";
  const mixedTimezone = reportState.status === "mixed-timezones";
  const unavailable = reportState.status === "error";
  const report = reportState.report;
  const summary = report?.summary;
  const showDataQuality = Boolean(!loading && summary && (summary.netSales === null || summary.averageOrderValue === null));
  const empty = Boolean(summary && summary.paidOrders === 0);
  const experienceClass = allLocations ? "owner-home--all-locations" : "owner-home--single-location";

  return (
    <div className={`owner-home ${experienceClass}${empty ? " owner-home--empty" : ""}`} aria-label="Owner home">
      <div className="owner-home__controls">
        <div className="owner-home-period">
          <div role="group" aria-label="Reporting period">
            {(Object.keys(periodLabels) as OwnerPeriod[]).map((period) => (
              <button key={period} type="button" className={reportState.period === period ? "is-active" : ""} aria-pressed={reportState.period === period} onClick={() => reportState.setPeriod(period)}>
                {periodLabels[period]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mixedTimezone ? <MixedTimezoneState /> : (
        <>
          {unavailable ? <OwnerHomeMetrics report={null} loading={false} unavailable /> : <OwnerHomeMetrics report={report} loading={loading} unavailable={false} />}
          {showDataQuality && report ? <DataQualityNotice report={report} /> : null}
          {unavailable ? (
            <OwnerHomePerformanceChart report={null} metric={reportState.chartMetric} loading={false} allLocations={allLocations} error={reportState.error} onMetricChange={reportState.setChartMetric} />
          ) : (
            <OwnerHomePerformanceChart report={report} metric={reportState.chartMetric} loading={loading} allLocations={allLocations} error={null} onMetricChange={reportState.setChartMetric} />
          )}
        </>
      )}
      <div className="owner-home-operations"><AttentionPanel loading={reportState.initialLoading} /></div>
      {mixedTimezone || unavailable || !hasMultipleLocations || !allLocations ? null : <LocationPerformance report={report} loading={loading} />}
    </div>
  );
}

const homeStates = {
    loading: { icon: "", title: "Loading your home", copy: "We’re getting the latest store activity ready." },
    empty: { icon: "—", title: "Nothing here yet", copy: "Your store activity will appear here once data starts coming in." },
    "no-connection": { icon: "↯", title: "No connection", copy: "Check your internet connection, then try again.", action: "Try again" },
    "no-api": { icon: "↗", title: "API unavailable", copy: "We couldn’t connect to the Nomly API. Try again in a moment.", action: "Retry connection" },
    error: { icon: "!", title: "Something went wrong", copy: "The Home screen couldn’t load right now. Try again.", action: "Try again" }
} as const;

export type OwnerHomeFallbackStatus = keyof typeof homeStates;

export function OwnerHomeStateCard({
  status,
  message,
  onRetry
}: {
  status: OwnerHomeFallbackStatus;
  message?: string;
  onRetry?: () => void;
}) {
  const content = homeStates[status];
  const loading = status === "loading";
  const copy = status === "error" && message ? message : content.copy;
  return (
    <article className={`dash-home-state dash-home-state--${status}`} data-home-state={status} aria-busy={loading}>
      <div className="dash-home-state__icon" aria-hidden="true">
        {loading ? <span className="dash-home-state__loading-icon" /> : content.icon}
      </div>
      {loading ? null : <h2 className="dash-home-state__title">{content.title}</h2>}
      {loading ? null : <p className="dash-home-state__copy">{copy}</p>}
      {"action" in content ? <button className="button button--secondary" type="button" onClick={onRetry}>{content.action}</button> : null}
    </article>
  );
}

export function OwnerHomeStateView(props: Parameters<typeof OwnerHomeStateCard>[0]) {
  return <section className="dash-overview" aria-label="Home"><OwnerHomeStateCard {...props} /></section>;
}
