"use client";

import React, { useEffect, useMemo, useState } from "react";
import { isOrderTrackingEnabled, isStaffDashboardEnabled, resolveAppConfigFulfillmentMode } from "@lattelink/contracts-catalog";
import { canAdvanceOrderStatus, canCancelOrder, canRefundOrder, formatOrderStatus, getOrderActions, getOrderCancelUnavailableMessage, getOrderControlUnavailableMessage, type OperatorOrder } from "../../../model";
import { formatDateTime, formatMoney, formatRelativeRefresh } from "../../../ui/format";
import { filterOrders, filterStoreOrders, orderElapsedLabel, orderItemCount, orderPaymentLabel, paginateOrders, sortStoreOrders } from "../orders-domain";
import { useOrders } from "../use-orders";
import { OrderDetailDialog } from "./OrderDetailDialog";

const filterOptions: Array<{ value: "all" | "active" | "completed" | "canceled"; label: string }> = [
  { value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "canceled", label: "Canceled" }, { value: "all", label: "All" }
];

const storeFilters = [
  { key: "all", label: "All" }, { key: "needs_action", label: "Confirmed" }, { key: "in_progress", label: "In prep" }, { key: "ready", label: "Ready" }, { key: "closed", label: "Closed" }
] as const;

function orderTone(status: OperatorOrder["status"]) {
  if (status === "READY" || status === "COMPLETED") return "success";
  if (status === "CANCELED") return "danger";
  if (status === "IN_PREP") return "warning";
  return "neutral";
}

function connectionLabel(data: ReturnType<typeof useOrders>) {
  if (!data.online) return "Offline — orders may be out of date";
  if (data.selectedLocationId === "all") return "Updating all locations every 30 seconds";
  if (data.connectionState === "connected") return "Live orders connected";
  if (data.connectionState === "connecting") return "Connecting to live orders";
  if (data.connectionState === "reconnecting") return "Live orders reconnecting — checking for updates";
  return "Live orders unavailable — checking for updates";
}

function OrderPagination({ page, pageCount, start, end, total, onPage }: { page: number; pageCount: number; start: number; end: number; total: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return total > 0 ? <div className="dash-order-pagination-label">{start + 1}–{end} of {total}</div> : null;
  return <div className="orders-pagination-row"><span className="dash-inline-note">{start + 1}–{end} of {total}</span><nav className="dash-order-pagination" aria-label="Orders pagination">
    <button className="dash-order-pagination__control" type="button" onClick={() => onPage(1)} disabled={page === 1} aria-label="First page">«</button>
    <button className="dash-order-pagination__control" type="button" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
    <span className="dash-order-pagination__page" aria-current="page">{page} / {pageCount}</span>
    <button className="dash-order-pagination__control" type="button" onClick={() => onPage(page + 1)} disabled={page === pageCount} aria-label="Next page">›</button>
    <button className="dash-order-pagination__control" type="button" onClick={() => onPage(pageCount)} disabled={page === pageCount} aria-label="Last page">»</button>
  </nav></div>;
}

function OrdersToolbar({ data }: { data: ReturnType<typeof useOrders> }) {
  return <div className="dash-order-toolbar orders-toolbar">
    <div className="orders-toolbar__filters">
      <label className="orders-search"><span className="visually-hidden">Search orders</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg><input type="search" value={data.query} onChange={(event) => data.setQuery(event.target.value)} placeholder="Search pickup code, customer, email…" /></label>
      <div className="orders-filter-tabs" role="group" aria-label="Order status filter">{filterOptions.map((filter) => <button key={filter.value} type="button" aria-pressed={data.filter === filter.value} className={data.filter === filter.value ? "is-active" : ""} onClick={() => data.setFilter(filter.value)}>{filter.label}</button>)}</div>
    </div>
    <div className="dash-order-toolbar__status"><span className={`dash-order-connection dash-order-connection--${data.online ? data.connectionState : "unavailable"}`} role="status" aria-live="polite">{connectionLabel(data)}</span><span className="dash-inline-note">{formatRelativeRefresh(data.lastRefreshedAt, data.status === "loading")}</span>{data.refreshError ? <span className="dash-order-refresh-error" role="alert">{data.refreshError}</span> : null}</div>
    <button className="button button--ghost" type="button" onClick={() => { void data.refresh(); }} disabled={data.status === "loading"}>{data.status === "loading" ? <><span className="spinner" /> Refreshing…</> : "Refresh"}</button>
  </div>;
}

function OrdersTable({ orders, locationNames, includeLocation, onOpen }: { orders: readonly OperatorOrder[]; locationNames: ReadonlyMap<string, string>; includeLocation: boolean; onOpen: (order: OperatorOrder, trigger: HTMLElement) => void }) {
  return <div className="dash-order-table-wrap"><table className="dash-order-table orders-react-table"><thead><tr><th scope="col">Order</th>{includeLocation ? <th scope="col">Location</th> : null}<th scope="col">Customer</th><th scope="col">Items</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Placed</th><th scope="col" className="dash-order-table__amount-heading">Total</th><th scope="col" className="dash-order-table__details-heading">Details</th></tr></thead>
    <tbody>{orders.map((order) => <tr className="dash-order-table__row" key={order.id} tabIndex={0} onClick={(event) => onOpen(order, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(order, event.currentTarget); } }}>
      <td><div className="dash-order-table__order"><strong>{order.pickupCode}</strong></div></td>
      {includeLocation ? <td><span className="dash-order-table__location">{locationNames.get(order.locationId) ?? order.locationId}</span></td> : null}
      <td><span className="dash-order-table__customer">{order.customer?.name ?? "Customer details unavailable"}</span></td>
      <td><span className="dash-order-table__items">{orderItemCount(order)} {orderItemCount(order) === 1 ? "item" : "items"}</span></td>
      <td><span className={`dash-status-badge dash-status-badge--${orderTone(order.status)}`}>{formatOrderStatus(order.status)}</span></td>
      <td><span className="orders-payment-state">{orderPaymentLabel(order)}</span></td>
      <td><span className="dash-order-table__date">{formatDateTime(order.timeline[0]?.occurredAt ?? "")}</span></td>
      <td className="dash-order-table__amount">{formatMoney(order.total.amountCents)}</td>
      <td className="dash-order-table__details"><button className="dash-order-table__details-button" type="button" aria-label={`View order details for ${order.pickupCode}`} title="View order details" onClick={(event) => { event.stopPropagation(); onOpen(order, event.currentTarget); }}><svg className="dash-order-table__details-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.25 2.25h5.5l2 2v9.5l-1.5-.8-1.5.8-1.5-.8-1.5.8-1.5-.8-1.5.8v-10a.7.7 0 0 1 .7-.7Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M9.5 2.5v2h2M5.5 7h4.75M5.5 9.25h4.75M5.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button></td>
    </tr>)}</tbody></table></div>;
}

function StoreTicket({ order, data, now }: { order: OperatorOrder; data: ReturnType<typeof useOrders>; now: number }) {
  const nextAction = getOrderActions(order, resolveAppConfigFulfillmentMode(data.appConfig))[0];
  const canAdvance = data.controlsAllowed && canAdvanceOrderStatus(data.session?.operator, data.appConfig) && Boolean(nextAction);
  const canCancel = data.controlsAllowed && canCancelOrder(data.session?.operator, data.appConfig, order);
  const notes = order.items.flatMap((item) => item.customization?.notes?.trim() ? [item.customization.notes.trim()] : []).slice(0, 2);
  const tone = order.status === "PAID" ? "needs-action" : order.status === "IN_PREP" ? "in-progress" : order.status === "READY" ? "ready" : order.status === "CANCELED" ? "canceled" : "closed";
  return <article className={`dash-ticket-card dash-ticket-card--${tone}`} role="listitem">
    <div className="dash-ticket-card__band"><div className="dash-ticket-heading"><div className="dash-ticket-label">{order.status === "PAID" ? "Confirmed" : formatOrderStatus(order.status)}</div><div className="dash-ticket-customer">{order.customer?.name ?? "Customer details unavailable"}</div></div><button className="dash-ticket-code" type="button" onClick={(event) => data.openOrder(order.id, event.currentTarget)} aria-label={`Open order ${order.pickupCode}`}>{order.pickupCode}</button></div>
    <div className="dash-ticket-facts"><div className="dash-ticket-fact"><span>Elapsed</span><strong>{orderElapsedLabel(order, now)}</strong></div><div className="dash-ticket-fact"><span>Items</span><strong>{orderItemCount(order)}</strong></div><div className="dash-ticket-fact"><span>Total</span><strong>{formatMoney(order.total.amountCents)}</strong></div></div>
    <div className="dash-ticket-body"><div className="dash-ticket-items">{order.items.map((item, index) => <div className="dash-ticket-item" key={`${item.itemId}-${index}`}><strong>{item.quantity}× {item.itemName ?? item.itemId}</strong>{item.customization?.selectedOptions.length ? <p>{item.customization.selectedOptions.map((option) => option.optionLabel).join(" · ")}</p> : null}{item.customization?.notes ? <p>Note: {item.customization.notes}</p> : null}</div>)}</div>{notes.length ? <div className="dash-ticket-callouts">{notes.map((note, index) => <div className="dash-ticket-callout" key={`${index}-${note}`}>{note}</div>)}</div> : null}</div>
    <div className="dash-ticket-footer"><div className="dash-ticket-actions">{canAdvance && nextAction ? <button className="button button--primary dash-ticket-action" type="button" disabled={data.busyOrderId === order.id} onClick={() => { void data.advanceOrder(order.id, nextAction.status, nextAction.note); }}>{data.busyOrderId === order.id ? "Updating order…" : nextAction.label}</button> : null}{canCancel ? <button className="button button--ghost" type="button" disabled={data.busyOrderId === order.id} onClick={(event) => { data.openOrder(order.id, event.currentTarget); data.beginCancel(order.id); }}>{order.status === "PENDING_PAYMENT" ? "Cancel unpaid" : "Cancel and refund"}</button> : null}<button className="button button--ghost" type="button" onClick={(event) => data.openOrder(order.id, event.currentTarget)}>Details</button></div></div>
  </article>;
}

function StoreBoard({ data, now }: { data: ReturnType<typeof useOrders>; now: number }) {
  const inScope = data.selectedLocationId === "all" ? data.orders : data.orders.filter((order) => order.locationId === data.selectedLocationId);
  const activeOrders = inScope.filter((order) => ["PAID", "IN_PREP", "READY"].includes(order.status));
  const closedOrders = inScope.filter((order) => ["COMPLETED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status));
  const filtered = useMemo(() => sortStoreOrders(filterOrders(filterStoreOrders(inScope, data.storeFilter), "all", data.query), data.storeFilter), [data.query, data.storeFilter, inScope]);
  return <section className="dash-section dash-section--store-mode dash-section--orders">
    <div className="dash-store-board__toolbar"><div className="dash-store-summary orders-store-filters" role="group" aria-label="Store order queue">{storeFilters.map((filter) => {
      const count = filter.key === "all" ? activeOrders.length : filter.key === "needs_action" ? inScope.filter((order) => order.status === "PAID").length : filter.key === "in_progress" ? inScope.filter((order) => order.status === "IN_PREP").length : filter.key === "ready" ? inScope.filter((order) => order.status === "READY").length : closedOrders.length;
      return <button key={filter.key} className={`dash-store-summary__tab${data.storeFilter === filter.key ? " dash-store-summary__tab--active" : ""}`} type="button" aria-pressed={data.storeFilter === filter.key} onClick={() => data.setStoreFilter(filter.key)}><span>{filter.label}</span><strong>{count}</strong></button>;
    })}</div><label className="orders-search"><span className="visually-hidden">Search orders</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg><input type="search" value={data.query} onChange={(event) => data.setQuery(event.target.value)} placeholder="Search orders…" /></label><span className={`dash-order-connection dash-order-connection--${data.online ? data.connectionState : "unavailable"}`} role="status">{connectionLabel(data)}</span><button className={`button ${data.soundEnabled ? "button--secondary" : "button--primary"}`} type="button" onClick={() => { void data.enableSound(); }}>{data.soundEnabled ? "Order sound on" : "Enable order sound"}</button><button className="button button--ghost" type="button" onClick={() => { void data.refresh(); }} disabled={data.status === "loading"}>Refresh</button></div>
    <div className={`dash-store-board${filtered.length === 0 ? " dash-store-board--empty" : ""}`}><div className="dash-store-ticket-strip" role="list" aria-label="Store orders">{filtered.map((order) => <StoreTicket key={order.id} order={order} data={data} now={now} />)}{filtered.length === 0 ? <div className="dash-empty-surface" role="status"><p className="dash-empty-copy">{data.query ? "No orders match this search." : data.status === "ready" ? "No tickets are in this view right now." : "Loading orders…"}</p></div> : null}</div></div>
  </section>;
}

function LoadingOrders() {
  return <div className="dash-surface orders-loading" role="status" aria-busy="true" aria-label="Loading orders"><span className="dash-skeleton dash-skeleton--row" /><span className="dash-skeleton dash-skeleton--row" /><span className="dash-skeleton dash-skeleton--row" /></div>;
}

export function OrdersPage() {
  const data = useOrders();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const locationNames = useMemo(() => new Map(data.availableLocations.map((location) => [location.locationId, location.locationName])), [data.availableLocations]);
  const filtered = useMemo(() => filterOrders(data.orders, data.filter, data.query), [data.filter, data.orders, data.query]);
  const paginated = useMemo(() => paginateOrders(filtered, data.page), [data.page, filtered]);
  const selected = data.selectedOrder;
  const selectedAllOwnerCanRefund = data.selectedLocationId === "all" && data.session?.operator.role === "owner";
  const selectedOrderCanRefund = Boolean(selected && canRefundOrder(data.session?.operator, selected) && (data.controlsAllowed || selectedAllOwnerCanRefund));
  const nextAction = selected ? getOrderActions(selected, resolveAppConfigFulfillmentMode(data.appConfig))[0] : undefined;
  const selectedCanAdvance = Boolean(selected && data.controlsAllowed && canAdvanceOrderStatus(data.session?.operator, data.appConfig) && nextAction);
  const selectedCanCancel = Boolean(selected && data.controlsAllowed && canCancelOrder(data.session?.operator, data.appConfig, selected));
  const selectedReadOnlyMessage = selected?.status === "CANCELED" ? "Already canceled" : selected?.status === "REFUNDED" ? "Already refunded" : selected?.status === "PARTIALLY_REFUNDED" ? "Partially refunded" : data.selectedLocationId === "all" ? "Choose a specific location to manage this order." : selected?.status === "COMPLETED" ? "Refund unavailable" : getOrderCancelUnavailableMessage(data.session?.operator, data.appConfig, selected) ?? getOrderControlUnavailableMessage(data.session?.operator, data.appConfig) ?? "Read-only order details";
  const featuresEnabled = data.selectedLocationId === "all"
    ? data.availableLocations.some((location) => isStaffDashboardEnabled(location.appConfig) && isOrderTrackingEnabled(location.appConfig))
    : isStaffDashboardEnabled(data.appConfig) && isOrderTrackingEnabled(data.appConfig);

  if (data.sessionStatus === "loading") return <LoadingOrders />;
  if (data.sessionStatus === "signed-out") return null;
  if (!data.canReadOrders) return <section className="dash-section dash-section--orders"><div className="dash-surface dash-empty-surface" role="status"><p className="dash-empty-copy">You don’t have permission to view orders for this workspace.</p></div></section>;
  if (data.locationStatus === "idle" || data.locationStatus === "loading") return <section className="dash-section dash-section--orders"><LoadingOrders /></section>;
  if (data.locationStatus === "error") return <section className="dash-section dash-section--orders"><div className="dash-surface dash-empty-surface" role="alert"><div className="dash-empty-copy"><p>Unable to load authorized locations.</p><button className="button button--ghost" type="button" onClick={() => { void data.reloadLocations(); }}>Retry</button></div></div></section>;
  if (data.status === "loading" && data.orders.length === 0) return <section className="dash-section dash-section--orders"><OrdersToolbar data={data} /><LoadingOrders /></section>;
  if (data.status === "error") return <section className="dash-section dash-section--orders"><OrdersToolbar data={data} /><div className="dash-surface dash-empty-surface" role="alert"><div className="dash-empty-copy"><p>{data.error ?? "Unable to load orders."}</p><button className="button button--ghost" type="button" onClick={() => { void data.refresh(); }}>Try again</button></div></div></section>;
  if (!featuresEnabled) return <section className="dash-section dash-section--orders"><div className="dash-surface dash-empty-surface"><p className="dash-empty-copy">Live order tracking is paused. Enable order tracking in store capabilities before using the operations board.</p></div></section>;

  return <>
    {data.isStore ? <StoreBoard data={data} now={now} /> : <section className="dash-section dash-section--orders">
      {data.selectedLocationId === "all" ? <div className="orders-readonly-note" role="status">This all-locations Orders view is read-only. Choose one location to update an order’s status.</div> : null}
      <OrdersToolbar data={data} />
      <article className="dash-surface dash-order-table-surface">
        {filtered.length === 0 ? <div className="dash-empty-surface" role="status"><p className="dash-empty-copy">{data.query ? "No orders match this search." : data.filter === "active" ? "No active orders." : data.filter === "completed" ? "No completed orders." : data.filter === "canceled" ? "No canceled orders." : "No orders yet."}</p></div> : <OrdersTable orders={paginated.items} locationNames={locationNames} includeLocation={data.selectedLocationId === "all"} onOpen={(order, trigger) => data.openOrder(order.id, trigger)} />}
      </article>
      <OrderPagination page={paginated.page} pageCount={paginated.pageCount} start={paginated.start} end={paginated.end} total={paginated.total} onPage={data.setPage} />
    </section>}
    <OrderDetailDialog
      order={selected} locationLabel={selected ? locationNames.get(selected.locationId) ?? selected.locationId : ""}
      open={data.detailsOpen} opening={data.detailsOpening} closing={data.detailsClosing} busy={data.busyOrderId === selected?.id}
      canRefund={selectedOrderCanRefund && data.refundOrderId !== selected?.id} canAdvance={selectedCanAdvance}
      nextAction={nextAction} canCancel={selectedCanCancel && data.cancelOrderId !== selected?.id}
      readOnlyMessage={selectedReadOnlyMessage} cancelRequested={data.cancelOrderId === selected?.id} refundRequested={data.refundOrderId === selected?.id}
      error={data.actionError} notice={data.actionNotice} onClose={data.closeOrder}
      onAdvance={(status, note) => { if (selected) void data.advanceOrder(selected.id, status, note); }}
      onBeginCancel={() => { if (selected) data.beginCancel(selected.id); }} onCancel={(reason) => { if (selected) void data.cancelOrder(selected.id, reason); }}
      onBeginRefund={() => { if (selected) data.beginRefund(selected.id); }} onRefund={(reason) => { if (selected) void data.refundOrder(selected.id, reason); }} onDismissAction={data.dismissAction}
    />
  </>;
}
