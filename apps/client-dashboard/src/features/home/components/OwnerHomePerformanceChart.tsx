"use client";

import React from "react";
import type { ReportingResponse } from "@lattelink/contracts-reporting";
import type { CSSProperties } from "react";
import { formatCompactCount } from "../../../ui/format";
import { formatReportMetric, getChartBarHeight, type OwnerChartMetric } from "../owner-home-domain";

const metricLabels: Record<OwnerChartMetric, string> = { netSales: "Net Sales", orders: "Orders" };

function LoadingChart({ allLocations }: { allLocations: boolean }) {
  if (allLocations) {
    return <div className="owner-home-chart__loading" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} className="owner-home-skeleton owner-home-skeleton--bar" />)}</div>;
  }
  return <div className="owner-home-chart__loading owner-home-chart__loading--roomy" aria-hidden="true"><span className="owner-home-skeleton owner-home-skeleton--chart" /></div>;
}

function ChartBars({ report, metric }: { report: ReportingResponse; metric: OwnerChartMetric }) {
  const series = report.series;
  const values = series.map((bucket) => metric === "orders" ? bucket.paidOrders : bucket.netSales?.amountCents ?? 0);
  const max = Math.max(0, ...values.map((value) => Math.abs(value)));
  const noActivity = series.length > 0 && values.every((value) => value === 0) && series.every((bucket) => bucket.paidOrders === 0);
  const salesUnavailable = metric === "netSales" && series.some((bucket) => bucket.netSales === null);
  if (salesUnavailable || series.length === 0 || noActivity) {
    const message = salesUnavailable
      ? "Net sales are unavailable for this period"
      : noActivity
        ? "No paid order activity in this period"
        : "No chart activity for this period";
    return <div className="owner-home-chart__empty">{message}</div>;
  }

  const timezone = report.query.timezone;
  const formatBucket = (bucket: ReportingResponse["series"][number]) => {
    const date = new Date(bucket.start);
    if (report.query.granularity === "hour") {
      return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric" }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "numeric", day: "numeric" }).format(date);
  };

  return (
    <div className="owner-home-bars" style={{ "--owner-series-count": series.length } as CSSProperties}>
      {series.map((bucket, index) => {
        const value = values[index] ?? 0;
        const height = getChartBarHeight(value, max);
        const label = formatBucket(bucket);
        const display = metric === "orders" ? `${formatCompactCount(bucket.paidOrders)} orders` : formatReportMetric(bucket.netSales);
        const showLabel = series.length <= 8 || index === 0 || index === series.length - 1 || index % Math.ceil(series.length / 7) === 0;
        return (
          <button
            key={`${bucket.start}-${index}`}
            type="button"
            className="owner-home-bar"
            style={{ "--owner-bar-height": `${height}px` } as CSSProperties}
            aria-label={`${label}: ${display}`}
          >
            <span className="owner-home-bar__fill" />
            <span className="owner-home-bar__tooltip">
              <strong>{label}</strong>
              <span>Sales: {formatReportMetric(bucket.netSales)}</span>
              <span>Orders: {formatCompactCount(bucket.paidOrders)}</span>
            </span>
            {showLabel ? <span className="owner-home-bar__label">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function OwnerHomePerformanceChart({
  report,
  metric,
  loading,
  allLocations,
  error,
  onMetricChange
}: {
  report: ReportingResponse | null;
  metric: OwnerChartMetric;
  loading: boolean;
  allLocations: boolean;
  error: string | null;
  onMetricChange: (metric: OwnerChartMetric) => void;
}) {
  if (error) {
    return (
      <section className="owner-home-chart owner-home-chart--error" aria-labelledby="owner-home-performance-title">
        <div className="owner-home-chart__header">
          <div><h2 id="owner-home-performance-title">Performance</h2></div>
          <div className="owner-home-toggle" aria-hidden="true"><span>Net Sales</span><span>Orders</span></div>
        </div>
        <div className="owner-home-chart__empty" role="status">
          <strong>Reporting is unavailable</strong><span>{error}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="owner-home-chart" aria-labelledby="owner-home-performance-title">
      <div className="owner-home-chart__header">
        <div><h2 id="owner-home-performance-title">Performance</h2></div>
        <div className="owner-home-toggle" role="group" aria-label="Performance metric">
          {(Object.keys(metricLabels) as OwnerChartMetric[]).map((choice) => (
            <button key={choice} type="button" className={metric === choice ? "is-active" : ""} aria-pressed={metric === choice} onClick={() => onMetricChange(choice)}>
              {metricLabels[choice]}
            </button>
          ))}
        </div>
      </div>
      <div className="owner-home-chart__plot" aria-label={`${metric === "orders" ? "Orders" : "Net sales"} by ${report?.query.granularity ?? "time"}`}>
        {loading ? <LoadingChart allLocations={allLocations} /> : report ? <ChartBars report={report} metric={metric} /> : null}
      </div>
    </section>
  );
}
