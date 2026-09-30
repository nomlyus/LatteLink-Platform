import React from "react";
import type { ReportingResponse } from "@lattelink/contracts-reporting";
import { formatCompactCount } from "../../../ui/format";
import { formatReportMetric, getComparisonLabel } from "../owner-home-domain";

function Metric({ label, value, change, tone }: { label: string; value: string; change: string; tone: string }) {
  return (
    <article className="owner-home-kpi">
      <div className="owner-home-kpi__value">{value}</div>
      <div className="owner-home-kpi__label">{label}</div>
      <div className={`owner-home-kpi__comparison ${tone ? `owner-home-kpi__comparison--${tone}` : ""}`}>
        {change} <span>vs previous period</span>
      </div>
    </article>
  );
}

function changeTone(percentChange: number | null) {
  return percentChange === null ? "neutral" : percentChange > 0 ? "positive" : "negative";
}

export function OwnerHomeMetrics({ report, loading, unavailable }: { report: ReportingResponse | null; loading: boolean; unavailable: boolean }) {
  if (unavailable) {
    return (
      <section className="owner-home-kpis owner-home-kpis--unavailable" aria-label="Business performance unavailable">
        <Metric label="Net sales" value="—" change="Unavailable" tone="neutral" />
        <Metric label="Orders" value="—" change="Unavailable" tone="neutral" />
        <Metric label="Avg order" value="—" change="Unavailable" tone="neutral" />
      </section>
    );
  }
  if (loading || !report?.summary || !report.comparison) {
    return (
      <section className="owner-home-kpis" aria-label="Business performance" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="owner-home-kpi owner-home-kpi--skeleton" aria-hidden="true">
            <span className="owner-home-skeleton owner-home-skeleton--value" />
            <span className="owner-home-skeleton owner-home-skeleton--label" />
            <span className="owner-home-skeleton owner-home-skeleton--meta" />
          </div>
        ))}
      </section>
    );
  }

  const { summary, comparison } = report;
  return (
    <section className="owner-home-kpis" aria-label="Business performance">
      <Metric
        label="Net sales"
        value={formatReportMetric(summary.netSales)}
        change={getComparisonLabel(comparison.netSales.percentChange, summary.netSales === null)}
        tone={changeTone(comparison.netSales.percentChange)}
      />
      <Metric
        label="Orders"
        value={formatCompactCount(summary.paidOrders)}
        change={getComparisonLabel(comparison.paidOrders.percentChange, false)}
        tone={changeTone(comparison.paidOrders.percentChange)}
      />
      <Metric
        label="Avg order"
        value={formatReportMetric(summary.averageOrderValue)}
        change={getComparisonLabel(comparison.averageOrderValue.percentChange, summary.averageOrderValue === null)}
        tone={changeTone(comparison.averageOrderValue.percentChange)}
      />
    </section>
  );
}
