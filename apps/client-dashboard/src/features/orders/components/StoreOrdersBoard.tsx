"use client";

import React, { useEffect, useMemo, useState } from "react";
import { resolveAppConfigFulfillmentMode } from "@lattelink/contracts-catalog";
import { canAdvanceOrderStatus, canCancelOrder, formatOrderStatus, getOrderActions, type OperatorOrder } from "../../../model";
import { formatMoney } from "../../../ui/format";
import { filterOrders, filterStoreOrders, orderElapsedLabel, orderItemCount, sortStoreOrders } from "../orders-domain";
import { getOrdersConnectionLabel } from "../orders-connection";
import type { OrdersState } from "../use-orders";

const storeFilters = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Confirmed" },
  { key: "in_progress", label: "In prep" },
  { key: "ready", label: "Ready" },
  { key: "closed", label: "Closed" }
] as const;

function StoreTicket({ order, data, now }: { order: OperatorOrder; data: OrdersState; now: number }) {
  const nextAction = getOrderActions(order, resolveAppConfigFulfillmentMode(data.appConfig))[0];
  const canAdvance = data.controlsAllowed && canAdvanceOrderStatus(data.session?.operator, data.appConfig) && Boolean(nextAction);
  const canCancel = data.controlsAllowed && canCancelOrder(data.session?.operator, data.appConfig, order);
  const notes = order.items.flatMap((item) => item.customization?.notes?.trim() ? [item.customization.notes.trim()] : []).slice(0, 2);
  const tone = order.status === "PAID" ? "needs-action" : order.status === "IN_PREP" ? "in-progress" : order.status === "READY" ? "ready" : order.status === "CANCELED" ? "canceled" : "closed";

  return (
    <article className={`dash-ticket-card dash-ticket-card--${tone}`} role="listitem">
      <div className="dash-ticket-card__band">
        <div className="dash-ticket-heading">
          <div className="dash-ticket-label">{order.status === "PAID" ? "Confirmed" : formatOrderStatus(order.status)}</div>
          <div className="dash-ticket-customer">{order.customer?.name ?? "Customer details unavailable"}</div>
        </div>
        <button className="dash-ticket-code" type="button" onClick={(event) => data.openOrder(order.id, event.currentTarget)} aria-label={`Open order ${order.pickupCode}`}>
          {order.pickupCode}
        </button>
      </div>
      <div className="dash-ticket-facts">
        <div className="dash-ticket-fact"><span>Elapsed</span><strong>{orderElapsedLabel(order, now)}</strong></div>
        <div className="dash-ticket-fact"><span>Items</span><strong>{orderItemCount(order)}</strong></div>
        <div className="dash-ticket-fact"><span>Total</span><strong>{formatMoney(order.total.amountCents)}</strong></div>
      </div>
      <div className="dash-ticket-body">
        <div className="dash-ticket-items">
          {order.items.map((item, index) => (
            <div className="dash-ticket-item" key={`${item.itemId}-${index}`}>
              <strong>{item.quantity}× {item.itemName ?? item.itemId}</strong>
              {item.customization?.selectedOptions.length ? <p>{item.customization.selectedOptions.map((option) => option.optionLabel).join(" · ")}</p> : null}
              {item.customization?.notes ? <p>Note: {item.customization.notes}</p> : null}
            </div>
          ))}
        </div>
        {notes.length ? (
          <div className="dash-ticket-callouts">
            {notes.map((note, index) => <div className="dash-ticket-callout" key={`${index}-${note}`}>{note}</div>)}
          </div>
        ) : null}
      </div>
      <div className="dash-ticket-footer">
        <div className="dash-ticket-actions">
          {canAdvance && nextAction ? (
            <button className="button button--primary dash-ticket-action" type="button" disabled={data.busyOrderId === order.id}
              onClick={() => { void data.advanceOrder(order.id, nextAction.status, nextAction.note); }}>
              {data.busyOrderId === order.id ? "Updating order…" : nextAction.label}
            </button>
          ) : null}
          {canCancel ? (
            <button className="button button--ghost" type="button" disabled={data.busyOrderId === order.id}
              onClick={(event) => { data.openOrder(order.id, event.currentTarget); data.beginCancel(order.id); }}>
              {order.status === "PENDING_PAYMENT" ? "Cancel unpaid" : "Cancel and refund"}
            </button>
          ) : null}
          <button className="button button--ghost" type="button" onClick={(event) => data.openOrder(order.id, event.currentTarget)}>Details</button>
        </div>
      </div>
    </article>
  );
}

export function StoreOrdersBoard({ data }: { data: OrdersState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const inScope = useMemo(() => data.selectedLocationId === "all"
    ? data.orders : data.orders.filter((order) => order.locationId === data.selectedLocationId), [data.orders, data.selectedLocationId]);
  const filtered = useMemo(() => sortStoreOrders(filterOrders(filterStoreOrders(inScope, data.storeFilter), "all", data.query), data.storeFilter), [data.query, data.storeFilter, inScope]);
  const counts = {
    all: inScope.filter((order) => ["PAID", "IN_PREP", "READY"].includes(order.status)).length,
    needs_action: inScope.filter((order) => order.status === "PAID").length,
    in_progress: inScope.filter((order) => order.status === "IN_PREP").length,
    ready: inScope.filter((order) => order.status === "READY").length,
    closed: inScope.filter((order) => ["COMPLETED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.status)).length
  };
  const emptyMessage = data.query ? "No orders match this search." : data.status === "ready" ? "No tickets are in this view right now." : "Loading orders…";

  return (
    <section className="dash-section dash-section--store-mode dash-section--orders" id="orders-results">
      <div className="dash-store-board__toolbar">
        <div className="dash-store-summary orders-store-filters" role="group" aria-label="Store order queue">
          {storeFilters.map((filter) => (
            <button key={filter.key} className={`dash-store-summary__tab${data.storeFilter === filter.key ? " dash-store-summary__tab--active" : ""}`}
              type="button" aria-pressed={data.storeFilter === filter.key} onClick={() => data.setStoreFilter(filter.key)}>
              <span>{filter.label}</span><strong>{counts[filter.key]}</strong>
            </button>
          ))}
        </div>
        <label className="orders-search">
          <span className="visually-hidden">Search orders</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
          <input type="search" value={data.query} onChange={(event) => data.setQuery(event.target.value)} placeholder="Search orders…" />
        </label>
        <span className={`dash-order-connection dash-order-connection--${data.online ? data.connectionState : "unavailable"}`} role="status">
          {getOrdersConnectionLabel(data)}
        </span>
        <button className={`button ${data.soundEnabled ? "button--secondary" : "button--primary"}`} type="button" onClick={() => { void data.enableSound(); }}>
          {data.soundEnabled ? "Order sound on" : "Enable order sound"}
        </button>
        <button className="button button--ghost" type="button" onClick={() => { void data.refresh(); }} disabled={data.status === "loading"}>Refresh</button>
      </div>
      <div className={`dash-store-board${filtered.length === 0 ? " dash-store-board--empty" : ""}`}>
        <div className="dash-store-ticket-strip" role="list" aria-label="Store orders">
          {filtered.map((order) => <StoreTicket key={order.id} order={order} data={data} now={now} />)}
          {filtered.length === 0 ? <div className="dash-empty-surface" role="status"><p className="dash-empty-copy">{emptyMessage}</p></div> : null}
        </div>
      </div>
    </section>
  );
}
