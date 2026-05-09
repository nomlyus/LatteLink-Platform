import { escapeHtml } from "../ui/format.js";
import { getOverviewSnapshot } from "../overview-data.js";
import { isAllLocationsSelected, state } from "../state.js";
import { filterOrdersByView } from "../model.js";
import { getAvailableDashboardSections } from "../sections.js";

function renderOverviewActionCards() {
  const availableSections = getAvailableDashboardSections();
  const activeOrders = filterOrdersByView(state.orders, "active").length;
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-action-panel" aria-label="Dashboard shortcuts">
        <div class="dash-panel-header">
          <div>
            <div class="dash-panel-title">Portfolio</div>
            <h3 class="dash-surface-title">Multi-location summary</h3>
          </div>
        </div>
        <div class="dash-action-grid">
          <article class="dash-action-card">
            <div>
              <span class="dash-action-label">Locations</span>
              <strong>${state.availableLocations.length}</strong>
              <p>Switch the workspace filter to inspect one store in detail.</p>
            </div>
          </article>
          <article class="dash-action-card">
            <div>
              <span class="dash-action-label">Active queue</span>
              <strong>${activeOrders}</strong>
              <p>All open orders across the locations you can access.</p>
            </div>
            ${
              availableSections.includes("orders")
                ? `<button class="button button--secondary button--sm" type="button" data-action="set-section" data-section="orders">Orders</button>`
                : ""
            }
          </article>
        </div>
      </section>
    `;
  }
  return "";
}

export function renderOverviewSection() {
  const overview = getOverviewSnapshot();
  const chartBars = overview.chartBars
    .map(
      (bar) => `
        <div class="dash-bar-column">
          <div class="dash-bar ${bar.highlighted ? "dash-bar--active" : ""}" style="height: ${bar.height}%"></div>
          <span class="dash-bar-label">${escapeHtml(bar.label)}</span>
        </div>
      `
    )
    .join("");

  return `
    <section class="dash-overview">
      <div class="dash-kpi-row">
        ${overview.metrics
          .map(
            (metric) => `
              <article class="dash-kpi-card">
                <span class="dash-kpi-label">${escapeHtml(metric.label)}</span>
                <strong class="dash-kpi-value">${escapeHtml(metric.value)}</strong>
                <span class="dash-kpi-delta dash-kpi-delta--${metric.trend.tone}">${escapeHtml(metric.trend.text)}</span>
              </article>
            `
          )
          .join("")}
      </div>
      <section class="dash-chart-panel">
        <div class="dash-panel-header">
          <div class="dash-panel-title">Orders — Last 7 Days</div>
        </div>
        <div class="dash-chart-body">
          <div class="dash-bars">${chartBars}</div>
        </div>
      </section>
      ${renderOverviewActionCards()}
    </section>
  `;
}
