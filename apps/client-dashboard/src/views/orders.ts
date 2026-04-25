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

type StoreLaneTone = "needs-action" | "in-progress" | "ready" | "closed";
type StoreTicketFilter = "all" | "needs_action" | "in_progress" | "ready" | "closed";

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

function getOrderItemCount(order: OperatorOrder) {
  return order.items.reduce((count, item) => count + item.quantity, 0);
}

function getStoreTicketCustomerName(order: OperatorOrder) {
  return order.customer?.name ?? "Customer details unavailable";
}

function getStoreTicketStatusLabel(order: OperatorOrder) {
  return order.status === "PAID" ? "Confirmed" : formatOrderStatus(order.status);
}

function getOrderNotes(order: OperatorOrder) {
  return order.items
    .flatMap((item) => (item.customization?.notes?.trim() ? [item.customization.notes.trim()] : []))
    .slice(0, 2);
}

function getStoreLaneTone(status: OperatorOrder["status"]): StoreLaneTone {
  switch (status) {
    case "IN_PREP":
      return "in-progress";
    case "READY":
      return "ready";
    case "COMPLETED":
    case "CANCELED":
      return "closed";
    case "PAID":
    default:
      return "needs-action";
  }
}

function renderStoreModeSummary(orders: readonly OperatorOrder[], completedOrders: readonly OperatorOrder[]) {
  const activeOrders = orders.filter(
    (order) => order.status === "PAID" || order.status === "IN_PREP" || order.status === "READY"
  );
  const inProgressCount = orders.filter((order) => order.status === "IN_PREP").length;
  const readyCount = orders.filter((order) => order.status === "READY").length;
  const needsActionCount = orders.filter((order) => order.status === "PAID").length;
  const filters: Array<{ key: StoreTicketFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: activeOrders.length },
    { key: "needs_action", label: "Confirmed", count: needsActionCount },
    { key: "in_progress", label: "In prep", count: inProgressCount },
    { key: "ready", label: "Ready", count: readyCount },
    { key: "closed", label: "Closed", count: completedOrders.length }
  ];
  const activeIndex = filters.findIndex((filter) => filter.key === state.storeTicketFilter);

  return `
    <div class="dash-store-summary" aria-label="Store board filters">
      <div class="dash-store-summary__rail" style="--store-summary-active-index: ${Math.max(activeIndex, 0)};">
        <div class="dash-store-summary__highlight" aria-hidden="true"></div>
        ${filters
          .map(
            (filter) => `
              <button
                class="dash-store-summary__tab ${state.storeTicketFilter === filter.key ? "dash-store-summary__tab--active" : ""}"
                type="button"
                data-action="set-store-ticket-filter"
                data-store-ticket-filter="${filter.key}"
              >
                <span>${escapeHtml(filter.label)}</span>
                <strong>${filter.count}</strong>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function filterStoreTickets(orders: readonly OperatorOrder[], filter: StoreTicketFilter) {
  switch (filter) {
    case "needs_action":
      return orders.filter((order) => order.status === "PAID");
    case "in_progress":
      return orders.filter((order) => order.status === "IN_PREP");
    case "ready":
      return orders.filter((order) => order.status === "READY");
    case "closed":
      return orders.filter((order) => order.status === "COMPLETED" || order.status === "CANCELED");
    case "all":
    default:
      return orders.filter((order) => order.status === "PAID" || order.status === "IN_PREP" || order.status === "READY");
  }
}

function getStoreTicketPriority(order: OperatorOrder) {
  switch (order.status) {
    case "PAID":
      return 0;
    case "IN_PREP":
      return 1;
    case "READY":
      return 2;
    case "COMPLETED":
      return 3;
    case "CANCELED":
      return 4;
    case "PENDING_PAYMENT":
    default:
      return 5;
  }
}

function sortStoreTickets(orders: readonly OperatorOrder[]) {
  return [...orders].sort((left, right) => {
    const priorityDelta = getStoreTicketPriority(left) - getStoreTicketPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftTime = Date.parse(left.timeline[0]?.occurredAt ?? "") || 0;
    const rightTime = Date.parse(right.timeline[0]?.occurredAt ?? "") || 0;
    return leftTime - rightTime;
  });
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
  const noteMarkup = getOrderNotes(order)
    .map((note) => `<div class="dash-ticket-callout">${escapeHtml(note)}</div>`)
    .join("");
  const tone = getStoreLaneTone(order.status);
  const itemCount = getOrderItemCount(order);
  const controls = [
    manualStatusControlsEnabled && nextAction
      ? `
          <button
            class="button button--primary dash-ticket-action"
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
    <article class="dash-ticket-card dash-ticket-card--${tone}">
      <div class="dash-ticket-card__band">
        <div class="dash-ticket-heading">
          <div class="dash-ticket-label">${escapeHtml(getStoreTicketStatusLabel(order))}</div>
          <div class="dash-ticket-customer">${escapeHtml(getStoreTicketCustomerName(order))}</div>
        </div>
        <div class="dash-ticket-meta">
          <div class="dash-ticket-code">${escapeHtml(order.pickupCode)}</div>
        </div>
      </div>
      <div class="dash-ticket-facts">
        <div class="dash-ticket-fact">
          <span>Elapsed</span>
          <strong>${escapeHtml(getOrderElapsedLabel(order))}</strong>
        </div>
        <div class="dash-ticket-fact">
          <span>Items</span>
          <strong>${itemCount}</strong>
        </div>
        <div class="dash-ticket-fact">
          <span>Total</span>
          <strong>${formatMoney(order.total.amountCents)}</strong>
        </div>
      </div>

      <div class="dash-ticket-body">
        <div class="dash-ticket-items">
          ${renderOrderItems(order, "ticket")}
        </div>

        ${noteMarkup ? `<div class="dash-ticket-callouts">${noteMarkup}</div>` : ""}
      </div>

      <div class="dash-ticket-footer">${controls ? `<div class="dash-ticket-actions">${controls}</div>` : ""}</div>
    </article>
  `;
}

function renderStoreModeBoard(appConfig: AppConfig | null) {
  const storeOrders = [...state.orders];
  const completedOrders = storeOrders.filter((order) => order.status === "COMPLETED" || order.status === "CANCELED");
  const orderedTickets = sortStoreTickets(filterStoreTickets(storeOrders, state.storeTicketFilter));

  return `
    <section class="dash-section dash-section--store-mode">
      <div class="dash-store-board__toolbar">
        ${renderStoreModeSummary(storeOrders, completedOrders)}
        <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
          ${state.loading ? '<span class="spinner"></span>' : "Refresh"}
        </button>
      </div>
      <div class="dash-store-board">
        <div class="dash-store-board__meta">
          <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt, state.loading))}</span>
        </div>
        <div class="dash-store-ticket-strip" role="list" aria-label="Store tickets">
          ${
            orderedTickets.length > 0
              ? orderedTickets.map((order) => renderStoreTicket(order, appConfig)).join("")
              : `<div class="dash-empty-surface dash-empty-surface--store-strip"><p class="muted-copy">No tickets are in this view right now.</p></div>`
          }
        </div>
      </div>
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
