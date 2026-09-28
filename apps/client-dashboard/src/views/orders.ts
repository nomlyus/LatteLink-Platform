import { getSelectedLocation, isAllLocationsSelected, state } from "../state";
import { escapeHtml, formatDateTime, formatMoney, formatRelativeRefresh } from "../ui/format";
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  canRefundOrder,
  formatOrderStatus,
  getOrderActions,
  isStoreOperator,
  type OperatorOrder
} from "../model";
import {
  isOrderTrackingEnabled,
  isStaffDashboardEnabled,
  resolveAppConfigFulfillmentMode,
  type AppConfig
} from "@lattelink/contracts-catalog";
import { isNewOrderSoundEnabled } from "../order-alert";
import { renderLocationSelectionNotice, renderOrderStatusBadge, renderSectionHeading } from "./common";

type StoreLaneTone = "needs-action" | "in-progress" | "ready" | "closed" | "canceled";
type StoreTicketFilter = "all" | "needs_action" | "in_progress" | "ready" | "closed";
const ordersPageSize = 15;

function renderOrderConnection() {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const stateLabel = offline
    ? "Offline — orders may be out of date"
    : isAllLocationsSelected()
      ? "Updating all locations every 30 seconds"
      : state.orderConnectionState === "connected"
        ? "Live orders connected"
        : state.orderConnectionState === "connecting"
          ? "Connecting to live orders"
          : state.orderConnectionState === "reconnecting"
            ? "Live orders reconnecting — checking for updates"
            : "Live orders unavailable — checking for updates";
  return `<span class="dash-order-connection dash-order-connection--${offline ? "unavailable" : state.orderConnectionState}" role="status" aria-live="polite">${escapeHtml(stateLabel)}</span>`;
}

function renderOrderToolbar() {
  return `
    <div class="dash-order-toolbar">
      <div class="dash-order-toolbar__status">
        ${renderOrderConnection()}
        <span class="dash-inline-note">${escapeHtml(formatRelativeRefresh(state.lastRefreshedAt, state.loading || state.ordersRefreshing))}</span>
        ${state.orderRefreshError ? `<span class="dash-order-refresh-error" role="alert">${escapeHtml(state.orderRefreshError)}</span>` : ""}
      </div>
      <button class="button button--ghost" type="button" data-action="refresh" ${state.loading || state.ordersRefreshing ? "disabled" : ""}>
        ${state.loading || state.ordersRefreshing ? '<span class="spinner"></span>' : "Refresh"}
      </button>
    </div>
  `;
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
  if (deltaMinutes <= 12 * 60) {
    return `${Math.floor(deltaMinutes / 60)}h ago`;
  }
  return `${Math.max(1, Math.floor(deltaMinutes / (24 * 60)))}d ago`;
}

function getOrderItemCount(order: OperatorOrder) {
  return order.items.reduce((count, item) => count + item.quantity, 0);
}

function getOrderSubtotalCents(order: OperatorOrder) {
  return order.items.reduce((total, item) => total + (item.lineTotalCents ?? item.unitPriceCents * item.quantity), 0);
}

function getOrderTaxCents(order: OperatorOrder) {
  return Math.max(order.total.amountCents - getOrderSubtotalCents(order), 0);
}

function getOrderPlacedAt(order: OperatorOrder) {
  return order.timeline[0]?.occurredAt ?? "";
}

function formatOrderHeaderDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  const date = new Date(parsed);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  return `${dateLabel} • ${timeLabel}`;
}

function formatOrderActivityTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(parsed));
}

function formatOrderActivityStatus(status: OperatorOrder["status"]) {
  return formatOrderStatus(status)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getOrderDisplayStatus(order: OperatorOrder) {
  return formatOrderStatus(order.status);
}

function getOrderLocationLabel(order: OperatorOrder) {
  return (
    state.availableLocations.find((location) => location.locationId === order.locationId)?.locationName ??
    (getSelectedLocation()?.locationId === order.locationId ? getSelectedLocation()?.locationName : undefined) ??
    state.storeConfig?.locationName ??
    order.locationId
  );
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
      return "closed";
    case "CANCELED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "canceled";
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
      return orders.filter((order) => order.status === "COMPLETED" || order.status === "CANCELED" || order.status === "REFUNDED" || order.status === "PARTIALLY_REFUNDED");
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

function sortStoreTickets(orders: readonly OperatorOrder[], filter: StoreTicketFilter) {
  return [...orders].sort((left, right) => {
    if (filter !== "closed") {
      const priorityDelta = getStoreTicketPriority(left) - getStoreTicketPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
    }

    const leftTime = Date.parse(left.timeline[0]?.occurredAt ?? "") || 0;
    const rightTime = Date.parse(right.timeline[0]?.occurredAt ?? "") || 0;
    return filter === "closed" ? rightTime - leftTime : leftTime - rightTime;
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
  if (order.status === "COMPLETED" || order.status === "CANCELED" || order.status === "REFUNDED" || order.status === "PARTIALLY_REFUNDED") {
    return "";
  }
  const disabled = state.busyOrderId === order.id ? "disabled" : "";
  const isUnpaid = order.status === "PENDING_PAYMENT";
  const actionLabel = isUnpaid ? "Cancel unpaid order" : "Cancel and refund";
  if (state.pendingCancelOrderId === order.id) {
    const confirmationCopy = isUnpaid
      ? "This order has not been paid. No refund will be issued."
      : `This cancels the order and refunds ${formatMoney(order.total.amountCents)} to the original payment method.`;
    return `
      <form class="confirm-row" data-form="cancel-order" data-order-id="${order.id}">
        <p class="muted-copy">${escapeHtml(confirmationCopy)}</p>
        <label class="field-label" for="cancel-reason-${order.id}">Reason</label>
        <input class="field-input" id="cancel-reason-${order.id}" name="reason" type="text" maxlength="240" required placeholder="For example, item unavailable" ${disabled} />
        <button class="button button--danger" type="submit" ${disabled}>
          ${isUnpaid ? "Confirm cancel" : `Confirm cancel and refund ${formatMoney(order.total.amountCents)}`}
        </button>
        <button class="button button--ghost" type="button" data-action="dismiss-cancel-order" data-order-id="${order.id}" ${disabled}>
          Back
        </button>
      </form>
    `;
  }
  return `
    <button class="button button--ghost" type="button" data-action="cancel-order" data-order-id="${order.id}" ${disabled}>
      ${state.busyOrderId === order.id ? `<span class="spinner"></span> ${isUnpaid ? "Canceling order…" : "Canceling and refunding…"}` : actionLabel}
    </button>
  `;
}

function renderStoreTicket(order: OperatorOrder, appConfig: AppConfig | null) {
  const specificLocationSelected = !isAllLocationsSelected();
  const manualStatusControlsEnabled = specificLocationSelected && canAdvanceOrderStatus(state.session?.operator ?? null, appConfig);
  const cancelControlsEnabled = specificLocationSelected && canCancelOrder(state.session?.operator ?? null, appConfig, order);
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
            ${state.busyOrderId === order.id ? '<span class="spinner"></span> Updating order…' : escapeHtml(nextAction.label)}
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

function renderOrderDetailActions(order: OperatorOrder, appConfig: AppConfig | null) {
  const specificLocationSelected = !isAllLocationsSelected();
  const manualStatusControlsEnabled = specificLocationSelected && canAdvanceOrderStatus(state.session?.operator ?? null, appConfig);
  const cancelControlsEnabled = specificLocationSelected && canCancelOrder(state.session?.operator ?? null, appConfig, order);
  const nextAction = getOrderActions(order, resolveAppConfigFulfillmentMode(appConfig))[0];
  const controls = [
    canRefundOrder(state.session?.operator ?? null, order) && (state.session?.operator.role === "owner" || specificLocationSelected)
      ? `<button class="button button--secondary dash-order-detail__action" type="button" data-action="refund-order" data-order-id="${order.id}" ${state.busyOrderId === order.id ? "disabled" : ""}>${state.busyOrderId === order.id ? "Refunding…" : "Refund"}</button>`
      : "",
    manualStatusControlsEnabled && nextAction
      ? `
          <button
            class="button button--secondary dash-order-detail__action"
            type="button"
            data-action="advance-order"
            data-order-id="${order.id}"
            data-order-status="${nextAction.status}"
            data-order-note="${escapeHtml(nextAction.note ?? "")}"
            ${state.busyOrderId === order.id ? "disabled" : ""}
          >
            ${state.busyOrderId === order.id ? '<span class="spinner"></span> Updating order…' : escapeHtml(nextAction.label)}
          </button>
        `
      : "",
    cancelControlsEnabled ? renderCancelButton(order) : ""
  ]
    .filter((markup) => markup.length > 0)
    .join("");

  if (controls) return controls;
  if (order.status === "CANCELED") return `<span class="dash-order-detail__read-only">Already canceled</span>`;
  if (order.status === "REFUNDED") return `<span class="dash-order-detail__read-only">Already refunded</span>`;
  if (order.status === "PARTIALLY_REFUNDED") return `<span class="dash-order-detail__read-only">Partially refunded</span>`;
  if (order.status === "COMPLETED") return `<span class="dash-order-detail__read-only">Refund unavailable</span>`;
  return `<span class="dash-order-detail__read-only">Read-only order details</span>`;
}

function renderOrderDetailsButton(order: OperatorOrder) {
  return `
    <button
      class="dash-order-table__details-button"
      type="button"
      data-action="open-order-details"
      data-order-id="${order.id}"
      aria-label="${escapeHtml(`View order details for ${order.pickupCode}`)}"
      title="View order details"
    >
      <svg class="dash-order-table__details-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4.25 2.25h5.5l2 2v9.5l-1.5-.8-1.5.8-1.5-.8-1.5.8-1.5-.8-1.5.8v-10a.7.7 0 0 1 .7-.7Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M9.5 2.5v2h2M5.5 7h4.75M5.5 9.25h4.75M5.5 11.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  `;
}

function renderOrderTable(
  orders: readonly OperatorOrder[],
  appConfig: AppConfig | null,
  includeLocation: boolean
) {
  if (orders.length === 0) {
    return `<div class="dash-empty-surface"><p class="muted-copy">No orders are loaded for the selected view.</p></div>`;
  }

  return `
    <div class="dash-order-table-wrap">
      <table class="dash-order-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            ${includeLocation ? '<th scope="col">Location</th>' : ""}
            <th scope="col">Customer</th>
            <th scope="col">Items</th>
            <th scope="col">Status</th>
            <th scope="col">Placed</th>
            <th scope="col" class="dash-order-table__amount-heading">Total</th>
            <th scope="col" class="dash-order-table__details-heading">Details</th>
          </tr>
        </thead>
        <tbody>
          ${orders
            .map(
              (order) => `
                <tr class="dash-order-table__row">
                  <td>
                    <div class="dash-order-table__order">
                      <strong>${escapeHtml(order.pickupCode)}</strong>
                    </div>
                  </td>
                  ${includeLocation ? `<td><span class="dash-order-table__location">${escapeHtml(order.locationId)}</span></td>` : ""}
                  <td><span class="dash-order-table__customer">${escapeHtml(order.customer?.name ?? "Customer details unavailable")}</span></td>
                  <td><span class="dash-order-table__items">${getOrderItemCount(order)} ${getOrderItemCount(order) === 1 ? "item" : "items"}</span></td>
                  <td>${renderOrderStatusBadge(order.status)}</td>
                  <td><span class="dash-order-table__date">${escapeHtml(formatDateTime(order.timeline[0]?.occurredAt ?? ""))}</span></td>
                  <td class="dash-order-table__amount">${formatMoney(order.total.amountCents)}</td>
                  <td class="dash-order-table__details">${renderOrderDetailsButton(order)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOrderDetailsModal(appConfig: AppConfig | null) {
  if (!state.orderDetailsOpen || !state.selectedOrderId) {
    return "";
  }

  const order = state.orders.find((candidate) => candidate.id === state.selectedOrderId);
  if (!order) {
    return "";
  }

  const timeline = order.timeline
    .map(
      (entry) => `
        <div class="dash-order-activity__row">
          <span class="dash-order-activity__dot" aria-hidden="true"></span>
          <div class="dash-order-activity__content">
            <div class="dash-order-activity__meta">
              <strong>${escapeHtml(formatOrderActivityStatus(entry.status))}</strong>
              <span>${escapeHtml(formatOrderActivityTime(entry.occurredAt))}</span>
            </div>
            ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
          </div>
        </div>
      `
    )
    .join("");
  const customerName = order.customer?.name ?? "Customer details unavailable";
  const customerEmail = order.customer?.email;
  const itemCount = getOrderItemCount(order);
  const orderPlacedAt = getOrderPlacedAt(order);

  return `
    <div class="dash-modal dash-order-detail-modal${state.orderDetailsOpening ? " dash-order-detail-modal--opening" : ""}${state.orderDetailsClosing ? " dash-order-detail-modal--closing" : ""}" role="presentation">
      <button
        class="dash-modal__backdrop"
        type="button"
        data-action="close-order-details"
        aria-label="Close order details"
      ></button>
      <div class="dash-modal__dialog dash-modal__dialog--order" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
        <div class="dash-modal__header">
          <div class="dash-order-detail__title-group">
            <h3 class="dash-order-detail__title" id="order-detail-title">${escapeHtml(order.pickupCode)}</h3>
            <div class="dash-order-detail__date">${escapeHtml(formatOrderHeaderDate(orderPlacedAt))}</div>
          </div>
          <div class="dash-order-detail__status" aria-label="Order status">${escapeHtml(getOrderDisplayStatus(order))}</div>
          <button
            class="dash-order-detail__close"
            type="button"
            data-action="close-order-details"
            aria-label="Close order details"
          >
            <svg class="dash-order-detail__close-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div class="dash-order-detail__body">
          <section class="dash-order-detail__customer">
            <div class="dash-order-detail__customer-heading">Customer Details</div>
            <div class="dash-order-detail__identity">
              <strong>${escapeHtml(customerName)}</strong>
              ${customerEmail ? `<a class="dash-order-detail__email" href="mailto:${escapeHtml(customerEmail)}">${escapeHtml(customerEmail)}</a>` : ""}
            </div>
          </section>
          <div class="dash-detail-grid dash-order-detail__summary">
            <div class="dash-detail-metric">
              <span>Location</span>
              <strong>${escapeHtml(getOrderLocationLabel(order))}</strong>
            </div>
            <div class="dash-detail-metric">
              <span>Total</span>
              <strong>${formatMoney(order.total.amountCents)}</strong>
            </div>
            <div class="dash-detail-metric">
              <span>Fulfillment</span>
              <strong>Pickup</strong>
            </div>
          </div>
          <section class="dash-order-detail__section">
            <div class="dash-order-detail__section-heading">
              <span>Items</span>
              <strong>${itemCount} ${itemCount === 1 ? "item" : "items"}</strong>
            </div>
            <div class="detail-stack">${renderOrderItems(order, "detail")}</div>
          </section>
          <section class="dash-order-detail__totals" aria-label="Order totals">
            <div><span>Subtotal</span><strong>${formatMoney(getOrderSubtotalCents(order))}</strong></div>
            <div><span>Tax</span><strong>${formatMoney(getOrderTaxCents(order))}</strong></div>
            <div><span>Total</span><strong>${formatMoney(order.total.amountCents)}</strong></div>
          </section>
          <section class="dash-order-detail__section dash-order-detail__activity">
            <div class="dash-order-detail__section-heading">Order Activity</div>
            <div class="timeline-stack">${timeline || '<p class="muted-copy">No timeline events recorded.</p>'}</div>
          </section>
          <section class="dash-order-detail__section dash-order-detail__actions">
            <div class="dash-order-detail__section-heading">Order Controls</div>
            <div class="button-row">${renderOrderDetailActions(order, appConfig)}</div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function paginateOrders(orders: readonly OperatorOrder[]) {
  const pageCount = Math.max(1, Math.ceil(orders.length / ordersPageSize));
  const page = Math.min(Math.max(state.ordersPage, 1), pageCount);
  if (page !== state.ordersPage) {
    state.ordersPage = page;
  }

  const start = (page - 1) * ordersPageSize;
  return {
    orders: orders.slice(start, start + ordersPageSize),
    page,
    pageCount
  };
}

function renderOrderPagination(page: number, pageCount: number) {
  if (pageCount <= 1) {
    return "";
  }

  return `
    <nav class="dash-order-pagination" aria-label="Orders pagination">
      <button
        class="dash-order-pagination__control"
        type="button"
        data-action="set-orders-page"
        data-orders-page="1"
        aria-label="First page"
        title="First page"
        ${page === 1 ? "disabled" : ""}
      >
        <span aria-hidden="true">&laquo;</span>
      </button>
      <button
        class="dash-order-pagination__control"
        type="button"
        data-action="set-orders-page"
        data-orders-page="${page - 1}"
        aria-label="Previous page"
        title="Previous page"
        ${page === 1 ? "disabled" : ""}
      >
        <span aria-hidden="true">&lsaquo;</span>
      </button>
      <span class="dash-order-pagination__page" aria-current="page">${page} / ${pageCount}</span>
      <button
        class="dash-order-pagination__control"
        type="button"
        data-action="set-orders-page"
        data-orders-page="${page + 1}"
        aria-label="Next page"
        title="Next page"
        ${page === pageCount ? "disabled" : ""}
      >
        <span aria-hidden="true">&rsaquo;</span>
      </button>
      <button
        class="dash-order-pagination__control"
        type="button"
        data-action="set-orders-page"
        data-orders-page="${pageCount}"
        aria-label="Last page"
        title="Last page"
        ${page === pageCount ? "disabled" : ""}
      >
        <span aria-hidden="true">&raquo;</span>
      </button>
    </nav>
  `;
}

function renderStoreModeBoard(appConfig: AppConfig | null) {
  const storeOrders = [...state.orders];
  const completedOrders = storeOrders.filter((order) => order.status === "COMPLETED" || order.status === "CANCELED" || order.status === "REFUNDED" || order.status === "PARTIALLY_REFUNDED");
  const orderedTickets = sortStoreTickets(filterStoreTickets(storeOrders, state.storeTicketFilter), state.storeTicketFilter);

  return `
    <section class="dash-section dash-section--store-mode">
      <div class="dash-store-board__toolbar">
        ${renderStoreModeSummary(storeOrders, completedOrders)}
        ${renderOrderConnection()}
        <button
          class="button ${isNewOrderSoundEnabled() ? "button--secondary" : "button--primary"}"
          type="button"
          data-action="enable-order-sound"
        >
          ${isNewOrderSoundEnabled() ? "Order sound on" : "Enable order sound"}
        </button>
        <button class="button button--ghost" type="button" data-action="refresh" ${state.loading ? "disabled" : ""}>
          ${state.loading ? '<span class="spinner"></span>' : "Refresh"}
        </button>
      </div>
      <div class="dash-store-board">
        <div class="dash-store-ticket-strip${orderedTickets.length === 0 ? " dash-store-ticket-strip--empty" : ""}" role="list" aria-label="Store tickets">
          ${
            orderedTickets.length > 0
              ? orderedTickets.map((order) => renderStoreTicket(order, appConfig)).join("")
              : `<div class="dash-empty-surface"><p class="muted-copy">No tickets are in this view right now.</p></div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderAllLocationsOrders() {
  const paginatedOrders = paginateOrders(state.orders);

  return `
    <section class="dash-section dash-section--orders">
      ${renderLocationSelectionNotice("This all-locations board is read-only. Choose one location from the workspace picker to move orders through prep or completion.")}
      ${renderOrderToolbar()}
      <article class="dash-surface dash-order-table-surface">
        ${renderOrderTable(paginatedOrders.orders, null, true)}
      </article>
      ${renderOrderPagination(paginatedOrders.page, paginatedOrders.pageCount)}
    </section>
    ${renderOrderDetailsModal(null)}
  `;
}

function renderDashboardOrders(appConfig: AppConfig | null) {
  const paginatedOrders = paginateOrders(state.orders);

  return `
    <section class="dash-section dash-section--orders">
      ${renderOrderToolbar()}
      <article class="dash-surface dash-order-table-surface">
        ${renderOrderTable(paginatedOrders.orders, appConfig, false)}
      </article>
      ${renderOrderPagination(paginatedOrders.page, paginatedOrders.pageCount)}
    </section>
    ${renderOrderDetailsModal(appConfig)}
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
