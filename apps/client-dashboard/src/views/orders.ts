import { getSelectedLocation, isAllLocationsSelected, state } from "../state.js";
import { escapeHtml, formatDateTime, formatMoney, formatRelativeRefresh } from "../ui/format.js";
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  filterOrdersByView,
  formatOrderStatus,
  getOrderActions,
  getOrderCustomerLabel,
  getOrderDetailActionUnavailableMessage,
  type OperatorOrder
} from "../model.js";
import {
  isOrderTrackingEnabled,
  isStaffDashboardEnabled,
  resolveAppConfigFulfillmentMode,
  type AppConfig
} from "@lattelink/contracts-catalog";
import { getSelectedOrder, getVisibleOrders } from "../orders-runtime.js";
import { renderLocationSelectionNotice, renderOrderStatusBadge, renderSectionHeading } from "./common.js";

function renderOrderFilterRow(activeOrderCount: number, completedOrderCount: number) {
  return (
    [
      { key: "active", label: "Active", count: activeOrderCount },
      { key: "all", label: "All", count: state.orders.length },
      { key: "completed", label: "Completed", count: completedOrderCount }
    ] as const
  )
    .map(
      (filter) => `
        <button
          class="dash-segment-button ${state.orderFilter === filter.key ? "dash-segment-button--active" : ""}"
          type="button"
          data-action="set-order-filter"
          data-order-filter="${filter.key}"
        >
          ${escapeHtml(filter.label)} <span>${filter.count}</span>
        </button>
      `
    )
    .join("");
}

function renderCancelButton(order: OperatorOrder) {
  if (order.status === "COMPLETED" || order.status === "CANCELED") {
    return "";
  }
  const disabled = state.busyOrderId === order.id ? "disabled" : "";
  if (state.pendingCancelOrderId === order.id) {
    return `
      <div class="confirm-row">
        <button class="button button--danger" type="button" data-action="confirm-cancel-order" data-order-id="${order.id}" ${disabled}>
          Confirm cancel
        </button>
        <button class="button button--ghost" type="button" data-action="dismiss-cancel-order" data-order-id="${order.id}" ${disabled}>
          Back
        </button>
      </div>
    `;
  }
  return `
    <button class="button button--ghost" type="button" data-action="cancel-order" data-order-id="${order.id}" ${disabled}>
      Cancel order
    </button>
  `;
}

function renderOrderDetail(order: OperatorOrder, appConfig: AppConfig | null) {
  const manualStatusControlsEnabled = canAdvanceOrderStatus(state.session?.operator ?? null, appConfig);
  const cancelControlsEnabled = canCancelOrder(state.session?.operator ?? null, appConfig, order);
  const fulfillmentMode = resolveAppConfigFulfillmentMode(appConfig);
  const actions = getOrderActions(order, fulfillmentMode);
  const timeline = order.timeline
    .map(
      (entry) => `
        <div class="timeline-row">
          <strong>${escapeHtml(formatOrderStatus(entry.status))}</strong>
          <span>${escapeHtml(formatDateTime(entry.occurredAt))}</span>
          ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
        </div>
      `
    )
    .join("");
  const items = order.items
    .map((item) => {
      const selectedOptions = item.customization?.selectedOptions?.map((option) => option.optionLabel).join(" · ");
      return `
        <div class="line-item">
          <div>
            <strong>${item.quantity}x ${escapeHtml(item.itemName ?? item.itemId)}</strong>
            ${selectedOptions ? `<p>${escapeHtml(selectedOptions)}</p>` : ""}
            ${item.customization?.notes ? `<p>Note: ${escapeHtml(item.customization.notes)}</p>` : ""}
          </div>
          <span>${formatMoney(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</span>
        </div>
      `;
    })
    .join("");

  const actionButtons = actions
    .map(
      (action) => `
        <button
          class="button ${action.tone === "primary" ? "button--primary" : "button--secondary"}"
          type="button"
          data-action="advance-order"
          data-order-id="${order.id}"
          data-order-status="${action.status}"
          data-order-note="${escapeHtml(action.note ?? "")}"
          ${state.busyOrderId === order.id ? "disabled" : ""}
        >
          ${escapeHtml(action.label)}
        </button>
      `
    )
    .join("");
  const controlButtons = [
    manualStatusControlsEnabled ? actionButtons : "",
    cancelControlsEnabled ? renderCancelButton(order) : ""
  ]
    .filter((markup) => markup.length > 0)
    .join("");
  const latestTimelineEntry = order.timeline[order.timeline.length - 1];

  return `
    <div class="dash-detail-header">
      <div>
        <div class="dash-panel-title">Order detail</div>
        <h3 class="dash-surface-title">${escapeHtml(order.pickupCode)}</h3>
        <p class="muted-copy">${escapeHtml(getOrderCustomerLabel(order))}</p>
      </div>
      ${renderOrderStatusBadge(order.status)}
    </div>
    <div class="dash-detail-grid">
      <div class="dash-detail-metric">
        <span>Store</span>
        <strong>${escapeHtml(order.locationId)}</strong>
      </div>
      <div class="dash-detail-metric">
        <span>Total</span>
        <strong>${formatMoney(order.total.amountCents)}</strong>
      </div>
      <div class="dash-detail-metric">
        <span>Last update</span>
        <strong>${escapeHtml(latestTimelineEntry ? formatDateTime(latestTimelineEntry.occurredAt) : "Just now")}</strong>
      </div>
    </div>
    <div class="dash-detail-block">
      <div class="dash-detail-block__label">Items</div>
      <div class="detail-stack">${items || `<p class="muted-copy">No line items recorded for this order.</p>`}</div>
    </div>
    ${
      controlButtons
        ? `<div class="button-row">${controlButtons}</div>`
        : `<p class="muted-copy">${escapeHtml(
            getOrderDetailActionUnavailableMessage(state.session?.operator ?? null, appConfig, order)
          )}</p>`
    }
    <div class="dash-detail-block">
      <div class="dash-detail-block__label">Timeline</div>
      <div class="timeline-stack">${timeline}</div>
    </div>
  `;
}

export function renderOrdersSection() {
  if (isAllLocationsSelected()) {
    const activeOrders = filterOrdersByView(state.orders, "active");
    const completedOrders = filterOrdersByView(state.orders, "completed");
    const visibleOrders = getVisibleOrders();
    const selectedOrder = getSelectedOrder();
    const orderRows =
      visibleOrders.length > 0
        ? visibleOrders
            .map(
              (order) => `
                <button class="dash-order-row ${selectedOrder?.id === order.id ? "dash-order-row--selected" : ""}" type="button" data-action="select-order" data-order-id="${order.id}">
                  <span class="dash-order-row__main">
                    <strong>${escapeHtml(order.pickupCode)}</strong>
                    <span class="dash-order-row__meta">${escapeHtml(getOrderCustomerLabel(order))}</span>
                  </span>
                  ${renderOrderStatusBadge(order.status)}
                  <span class="dash-order-row__amount">${formatMoney(order.total.amountCents)}</span>
                </button>
              `
            )
            .join("")
        : `<p class="muted-copy">No orders are loaded for the selected view.</p>`;

    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Orders",
          title: "Multi-location queue",
          description: "Review orders across all accessible locations. Switch to a specific location to update fulfillment states.",
          actions: `
            <div class="dash-segmented-control">
              ${renderOrderFilterRow(activeOrders.length, completedOrders.length)}
            </div>
            <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
              ${state.loading ? '<span class="spinner"></span>' : "Refresh"}
            </button>
          `
        })}
        ${renderLocationSelectionNotice("This all-locations board is read-only. Choose one location from the workspace picker to move orders through prep or completion.")}
        <div class="dash-split-layout dash-split-layout--orders">
          <article class="dash-surface">
            <div class="dash-surface-head">
              <div>
                <div class="dash-panel-title">Queue</div>
                <h3 class="dash-surface-title">${visibleOrders.length} in view</h3>
              </div>
              <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt, state.loading))}</span>
            </div>
            <div class="dash-order-list">${orderRows}</div>
          </article>

          <article class="dash-surface">
            ${
              selectedOrder
                ? renderOrderDetail(selectedOrder, null)
                : `<div class="dash-empty-surface"><p class="muted-copy">Select an order to inspect its items and fulfillment timeline.</p></div>`
            }
          </article>
        </div>
      </section>
    `;
  }

  if (!isStaffDashboardEnabled(state.appConfig) || !isOrderTrackingEnabled(state.appConfig)) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Orders",
          title: "Live order tracking is paused.",
          description: "Enable order tracking in store capabilities before using the operations board."
        })}
        <article class="dash-surface dash-empty-surface">
          <p class="muted-copy">This workspace will show incoming orders, prep states, and fulfillment activity once the live order board is enabled for the store.</p>
        </article>
      </section>
    `;
  }

  const activeOrders = filterOrdersByView(state.orders, "active");
  const completedOrders = filterOrdersByView(state.orders, "completed");
  const visibleOrders = getVisibleOrders();
  const selectedOrder = getSelectedOrder();
  const selectedLocation = getSelectedLocation();
  const orderRows =
    visibleOrders.length > 0
      ? visibleOrders
          .map(
            (order) => `
              <button class="dash-order-row ${selectedOrder?.id === order.id ? "dash-order-row--selected" : ""}" type="button" data-action="select-order" data-order-id="${order.id}">
                <span class="dash-order-row__main">
                  <strong>${escapeHtml(order.pickupCode)}</strong>
                  <span class="dash-order-row__meta">${escapeHtml(getOrderCustomerLabel(order))}</span>
                </span>
                ${renderOrderStatusBadge(order.status)}
                <span class="dash-order-row__amount">${formatMoney(order.total.amountCents)}</span>
              </button>
            `
          )
          .join("")
      : `<p class="muted-copy">No orders are loaded for the selected view.</p>`;

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Orders",
        title: selectedLocation?.locationName ? `${selectedLocation.locationName} orders` : "Live order operations",
        description: "Track incoming orders and move drinks through prep without leaving the dashboard.",
        actions: `
          <div class="dash-segmented-control">
            ${renderOrderFilterRow(activeOrders.length, completedOrders.length)}
          </div>
          <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
            ${state.loading ? '<span class="spinner"></span>' : "Refresh"}
          </button>
        `
      })}
      <div class="dash-split-layout dash-split-layout--orders">
        <article class="dash-surface">
          <div class="dash-surface-head">
            <div>
              <div class="dash-panel-title">Queue</div>
              <h3 class="dash-surface-title">${visibleOrders.length} in view</h3>
            </div>
            <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt, state.loading))}</span>
          </div>
          <div class="dash-order-list">${orderRows}</div>
        </article>

        <article class="dash-surface">
          ${
            selectedOrder
              ? renderOrderDetail(selectedOrder, state.appConfig)
              : `<div class="dash-empty-surface"><p class="muted-copy">Select an order to inspect its items and fulfillment timeline.</p></div>`
          }
        </article>
      </div>
    </section>
  `;
}
