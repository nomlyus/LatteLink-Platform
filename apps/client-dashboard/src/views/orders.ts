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
  isStoreOperator,
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

function getOrderElapsedLabel(order: OperatorOrder) {
  const firstEventAt = order.timeline[0]?.occurredAt;
  if (!firstEventAt) {
    return "Just now";
  }

  const deltaMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(firstEventAt)) / 60_000));
  if (deltaMinutes < 1) {
    return "Just now";
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  return `${Math.floor(deltaMinutes / 60)}h ago`;
}

function renderOrderItems(order: OperatorOrder, variant: "detail" | "ticket") {
  const itemMarkup = order.items
    .map((item) => {
      const selectedOptions = item.customization?.selectedOptions?.map((option) => option.optionLabel).join(" · ");
      return `
        <div class="${variant === "ticket" ? "dash-ticket-item" : "line-item"}">
          <div>
            <strong>${item.quantity}x ${escapeHtml(item.itemName ?? item.itemId)}</strong>
            ${selectedOptions ? `<p>${escapeHtml(selectedOptions)}</p>` : ""}
            ${item.customization?.notes ? `<p>Note: ${escapeHtml(item.customization.notes)}</p>` : ""}
          </div>
          ${variant === "detail" ? `<span>${formatMoney(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</span>` : ""}
        </div>
      `;
    })
    .join("");

  return itemMarkup || `<p class="muted-copy">No line items recorded for this order.</p>`;
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
      <div class="detail-stack">${renderOrderItems(order, "detail")}</div>
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

function renderQueueRows(orders: readonly OperatorOrder[], selectedOrderId: string | null) {
  return orders.length > 0
    ? orders
        .map(
          (order) => `
            <button class="dash-order-row ${selectedOrderId === order.id ? "dash-order-row--selected" : ""}" type="button" data-action="select-order" data-order-id="${order.id}">
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
}

function renderStoreTicket(order: OperatorOrder, appConfig: AppConfig | null) {
  const manualStatusControlsEnabled = canAdvanceOrderStatus(state.session?.operator ?? null, appConfig);
  const cancelControlsEnabled = canCancelOrder(state.session?.operator ?? null, appConfig, order);
  const nextAction = getOrderActions(order, resolveAppConfigFulfillmentMode(appConfig))[0];
  const controls = [
    manualStatusControlsEnabled && nextAction
      ? `
          <button
            class="button button--primary"
            type="button"
            data-action="advance-order"
            data-order-id="${order.id}"
            data-order-status="${nextAction.status}"
            data-order-note="${escapeHtml(nextAction.note ?? "")}"
            ${state.busyOrderId === order.id ? "disabled" : ""}
          >
            ${escapeHtml(nextAction.label)}
          </button>
        `
      : "",
    cancelControlsEnabled ? renderCancelButton(order) : ""
  ]
    .filter((markup) => markup.length > 0)
    .join("");

  return `
    <article class="dash-ticket-card">
      <div class="dash-ticket-card__top">
        <div>
          <div class="dash-ticket-code">${escapeHtml(order.pickupCode)}</div>
          <div class="dash-ticket-customer">${escapeHtml(getOrderCustomerLabel(order))}</div>
        </div>
        <div class="dash-ticket-meta">
          ${renderOrderStatusBadge(order.status)}
          <span class="dash-ticket-age">${escapeHtml(getOrderElapsedLabel(order))}</span>
        </div>
      </div>

      <div class="dash-ticket-items">
        ${renderOrderItems(order, "ticket")}
      </div>

      <div class="dash-ticket-footer">
        <div class="dash-ticket-total">${formatMoney(order.total.amountCents)}</div>
        ${controls ? `<div class="button-row">${controls}</div>` : ""}
      </div>
    </article>
  `;
}

function renderStoreModeBoard(appConfig: AppConfig | null) {
  const visibleOrders = getVisibleOrders();
  const lanes = [
    {
      key: "new",
      title: "New",
      description: "Paid orders waiting to be started.",
      orders: visibleOrders.filter((order) => order.status === "PAID")
    },
    {
      key: "in-prep",
      title: "In prep",
      description: "Drinks currently being made.",
      orders: visibleOrders.filter((order) => order.status === "IN_PREP")
    },
    {
      key: "ready",
      title: "Ready",
      description: "Completed drinks waiting for pickup.",
      orders: visibleOrders.filter((order) => order.status === "READY")
    }
  ] as const;

  const completedOrders = visibleOrders.filter((order) => order.status === "COMPLETED" || order.status === "CANCELED");
  const selectedLocation = getSelectedLocation();
  const activeOrders = filterOrdersByView(state.orders, "active");

  return `
    <section class="dash-section dash-section--store-mode">
      ${renderSectionHeading({
        eyebrow: "Store mode",
        title: selectedLocation?.locationName ? `${selectedLocation.locationName} live board` : "Live ticket board",
        description: "Every ticket shows the items and modifiers the team needs to make right now.",
        actions: `
          <div class="dash-segmented-control">
            ${renderOrderFilterRow(activeOrders.length, completedOrders.length)}
          </div>
          <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
            ${state.loading ? '<span class="spinner"></span>' : "Refresh"}
          </button>
        `
      })}
      <div class="dash-store-board">
        ${lanes
          .map(
            (lane) => `
              <section class="dash-store-lane">
                <div class="dash-store-lane__head">
                  <div>
                    <div class="dash-panel-title">${escapeHtml(lane.title)}</div>
                    <h3 class="dash-surface-title">${lane.orders.length} tickets</h3>
                  </div>
                  <p class="muted-copy">${escapeHtml(lane.description)}</p>
                </div>
                <div class="dash-store-lane__tickets">
                  ${
                    lane.orders.length > 0
                      ? lane.orders.map((order) => renderStoreTicket(order, appConfig)).join("")
                      : `<div class="dash-empty-surface"><p class="muted-copy">No tickets in ${escapeHtml(
                          lane.title.toLowerCase()
                        )} right now.</p></div>`
                  }
                </div>
              </section>
            `
          )
          .join("")}
      </div>
      ${
        completedOrders.length > 0 && state.orderFilter !== "active"
          ? `
              <article class="dash-surface">
                <div class="dash-surface-head">
                  <div>
                    <div class="dash-panel-title">Recently closed</div>
                    <h3 class="dash-surface-title">${completedOrders.length} recent tickets</h3>
                  </div>
                  <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt, state.loading))}</span>
                </div>
                <div class="dash-ticket-grid">
                  ${completedOrders.map((order) => renderStoreTicket(order, appConfig)).join("")}
                </div>
              </article>
            `
          : ""
      }
    </section>
  `;
}

function renderAllLocationsOrders() {
  const activeOrders = filterOrdersByView(state.orders, "active");
  const completedOrders = filterOrdersByView(state.orders, "completed");
  const visibleOrders = getVisibleOrders();
  const selectedOrder = getSelectedOrder();

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
          <div class="dash-order-list">${renderQueueRows(visibleOrders, selectedOrder?.id ?? null)}</div>
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

function renderDashboardOrders(appConfig: AppConfig | null) {
  const activeOrders = filterOrdersByView(state.orders, "active");
  const completedOrders = filterOrdersByView(state.orders, "completed");
  const visibleOrders = getVisibleOrders();
  const selectedOrder = getSelectedOrder();
  const selectedLocation = getSelectedLocation();

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Orders",
        title: selectedLocation?.locationName ? `${selectedLocation.locationName} orders` : "Orders overview",
        description: "Track incoming orders and open any ticket when you need a deeper fulfillment timeline.",
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
          <div class="dash-order-list">${renderQueueRows(visibleOrders, selectedOrder?.id ?? null)}</div>
        </article>

        <article class="dash-surface">
          ${
            selectedOrder
              ? renderOrderDetail(selectedOrder, appConfig)
              : `<div class="dash-empty-surface"><p class="muted-copy">Select an order to inspect its items and fulfillment timeline.</p></div>`
          }
        </article>
      </div>
    </section>
  `;
}

export function renderOrdersSection() {
  if (isAllLocationsSelected()) {
    return renderAllLocationsOrders();
  }

  if (!isStaffDashboardEnabled(state.appConfig) || !isOrderTrackingEnabled(state.appConfig)) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: isStoreOperator(state.session?.operator ?? null) ? "Store mode" : "Orders",
          title: "Live order tracking is paused.",
          description: "Enable order tracking in store capabilities before using the operations board."
        })}
        <article class="dash-surface dash-empty-surface">
          <p class="muted-copy">This workspace will show incoming orders, prep states, and fulfillment activity once the live order board is enabled for the store.</p>
        </article>
      </section>
    `;
  }

  if (isStoreOperator(state.session?.operator ?? null)) {
    return renderStoreModeBoard(state.appConfig);
  }

  return renderDashboardOrders(state.appConfig);
}
