"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatOrderStatus, type OperatorOrder, type OperatorOrderAction } from "../../../model";
import { formatMoney } from "../../../ui/format";
import { orderItemCount, orderPaymentLabel, orderSubtotalCents, orderTaxCents } from "../orders-domain";

function headerDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  const date = new Date(parsed);
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)} • ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function activityTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(parsed)) : value;
}

function ItemLines({ order }: { order: OperatorOrder }) {
  if (order.items.length === 0) return <p className="muted-copy">No line items recorded for this order.</p>;
  return <div className="detail-stack">{order.items.map((item, index) => {
    const selected = item.customization?.selectedOptions.map((option) => option.optionLabel).join(" · ");
    return <div className="line-item" key={`${item.itemId}-${index}`}>
      <div><strong>{item.quantity}× {item.itemName ?? item.itemId}</strong>{selected ? <p>{selected}</p> : null}{item.customization?.notes ? <p>Note: {item.customization.notes}</p> : null}</div>
      <span>{formatMoney(item.lineTotalCents ?? item.unitPriceCents * item.quantity)}</span>
    </div>;
  })}</div>;
}

export type OrderDetailDialogProps = {
  order: OperatorOrder | null;
  locationLabel: string;
  open: boolean;
  opening: boolean;
  closing: boolean;
  busy: boolean;
  canRefund: boolean;
  canAdvance: boolean;
  nextAction?: OperatorOrderAction;
  canCancel: boolean;
  readOnlyMessage: string;
  cancelRequested: boolean;
  refundRequested: boolean;
  error: string | null;
  notice: string | null;
  onClose: () => void;
  onAdvance: (status: "IN_PREP" | "READY" | "COMPLETED", note?: string) => void;
  onBeginCancel: () => void;
  onCancel: (reason: string) => void;
  onBeginRefund: () => void;
  onRefund: (reason: string) => void;
  onDismissAction: () => void;
};

export function OrderDetailDialog(props: OrderDetailDialogProps) {
  const {
    order, locationLabel, open, opening, closing, busy, canRefund, canAdvance, nextAction,
    canCancel, readOnlyMessage, cancelRequested, refundRequested, error, notice,
    onClose, onAdvance, onBeginCancel, onCancel, onBeginRefund, onRefund, onDismissAction
  } = props;
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundReason, setRefundReason] = useState("Customer requested a refund");

  useEffect(() => {
    if (!open || !order) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')];
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open, order]);

  useEffect(() => {
    setCancelReason("");
    setRefundReason("Customer requested a refund");
    onDismissAction();
  }, [onDismissAction, order?.id]);

  if (!open || !order) return null;
  const placedAt = order.timeline[0]?.occurredAt ?? "";
  const itemCount = orderItemCount(order);
  const refund = order.refundSummary;
  const showReadOnly = !canRefund && !canAdvance && !canCancel && !cancelRequested && !refundRequested;

  return <div className={`dash-modal dash-order-detail-modal${opening ? " dash-order-detail-modal--opening" : ""}${closing ? " dash-order-detail-modal--closing" : ""}`} role="presentation">
    <button className="dash-modal__backdrop" type="button" onClick={onClose} aria-label="Close order details" />
    <div ref={dialog} className="dash-modal__dialog dash-modal__dialog--order" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" aria-describedby="order-detail-date">
      <div className="dash-modal__header">
        <div className="dash-order-detail__title-group"><h2 className="dash-order-detail__title" id="order-detail-title">{order.pickupCode}</h2><div className="dash-order-detail__date" id="order-detail-date">{headerDate(placedAt)}</div></div>
        <div className="dash-order-detail__status" aria-label={`Order status: ${formatOrderStatus(order.status)}`}>{formatOrderStatus(order.status)}</div>
        <button ref={closeButton} className="dash-order-detail__close" type="button" onClick={onClose} aria-label="Close order details">
          <svg className="dash-order-detail__close-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="dash-order-detail__body">
        <section className="dash-order-detail__customer">
          <div className="dash-order-detail__customer-heading">Customer Details</div>
          <div className="dash-order-detail__identity"><strong>{order.customer?.name ?? "Customer details unavailable"}</strong>{order.customer?.email ? <a className="dash-order-detail__email" href={`mailto:${order.customer.email}`}>{order.customer.email}</a> : null}{order.customer?.phone ? <span className="dash-order-detail__email">{order.customer.phone}</span> : null}</div>
        </section>
        <div className="dash-detail-grid dash-order-detail__summary">
          <div className="dash-detail-metric"><span>Location</span><strong>{locationLabel}</strong></div>
          <div className="dash-detail-metric"><span>Total</span><strong>{formatMoney(order.total.amountCents)}</strong></div>
          <div className="dash-detail-metric"><span>Payment</span><strong>{orderPaymentLabel(order)}</strong></div>
          <div className="dash-detail-metric"><span>Fulfillment</span><strong>Pickup</strong></div>
        </div>
        {refund ? <section className="dash-order-detail__section" aria-label="Refund information"><div className="dash-order-detail__section-heading">Refund information</div><p className="muted-copy">{refund.settledRefundCount} settled refund{refund.settledRefundCount === 1 ? "" : "s"} · {formatMoney(refund.settledAmountCents)} refunded{refund.remainingPaidAmountCents > 0 ? ` · ${formatMoney(refund.remainingPaidAmountCents)} remaining` : ""}</p></section> : null}
        <section className="dash-order-detail__section"><div className="dash-order-detail__section-heading"><span>Items</span><strong>{itemCount} {itemCount === 1 ? "item" : "items"}</strong></div><ItemLines order={order} /></section>
        <section className="dash-order-detail__totals" aria-label="Order totals"><div><span>Subtotal</span><strong>{formatMoney(orderSubtotalCents(order))}</strong></div><div><span>Tax</span><strong>{formatMoney(orderTaxCents(order))}</strong></div><div><span>Total</span><strong>{formatMoney(order.total.amountCents)}</strong></div></section>
        <section className="dash-order-detail__section dash-order-detail__activity"><div className="dash-order-detail__section-heading">Order Activity</div><div className="timeline-stack">{order.timeline.length ? order.timeline.map((entry, index) => <div className="dash-order-activity__row" key={`${entry.status}-${entry.occurredAt}-${index}`}><span className="dash-order-activity__dot" aria-hidden="true" /><div className="dash-order-activity__content"><div className="dash-order-activity__meta"><strong>{formatOrderStatus(entry.status).toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())}</strong><span>{activityTime(entry.occurredAt)}</span></div>{entry.note ? <p>{entry.note}</p> : null}</div></div>) : <p className="muted-copy">No timeline events recorded.</p>}</div></section>
        <section className="dash-order-detail__section dash-order-detail__actions"><div className="dash-order-detail__section-heading">Order Controls</div>
          {notice ? <p className="dash-order-action-notice" role="status">{notice}</p> : null}
          {error ? <p className="dash-order-refresh-error" role="alert">{error}</p> : null}
          <div className="button-row">
            {canRefund && !refundRequested ? <button className="button button--secondary dash-order-detail__action" type="button" disabled={busy} onClick={onBeginRefund}>Refund</button> : null}
            {canAdvance && nextAction ? <button className="button button--secondary dash-order-detail__action" type="button" disabled={busy} onClick={() => onAdvance(nextAction.status, nextAction.note)}>{busy ? "Updating order…" : nextAction.label}</button> : null}
            {canCancel && !cancelRequested ? <button className="button button--ghost dash-order-detail__action" type="button" disabled={busy} onClick={onBeginCancel}>{order.status === "PENDING_PAYMENT" ? "Cancel unpaid order" : "Cancel and refund"}</button> : null}
            {showReadOnly ? <span className="dash-order-detail__read-only">{readOnlyMessage}</span> : null}
          </div>
          {cancelRequested ? <form className="dash-order-action-form" onSubmit={(event) => { event.preventDefault(); onCancel(cancelReason); }}><p className="muted-copy">{order.status === "PENDING_PAYMENT" ? "This order has not been paid. No refund will be issued." : `This cancels the order and refunds ${formatMoney(order.total.amountCents)} to the original payment method.`}</p><label className="field-label" htmlFor="react-cancel-order-reason">Reason</label><input className="field-input" id="react-cancel-order-reason" maxLength={240} required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="For example, item unavailable" disabled={busy} /><div className="button-row"><button className="button button--danger" type="submit" disabled={busy || !cancelReason.trim()}>{busy ? "Canceling…" : order.status === "PENDING_PAYMENT" ? "Confirm cancel" : `Confirm cancel and refund ${formatMoney(order.total.amountCents)}`}</button><button className="button button--ghost" type="button" onClick={onDismissAction} disabled={busy}>Back</button></div></form> : null}
          {refundRequested ? <form className="dash-order-action-form" onSubmit={(event) => { event.preventDefault(); onRefund(refundReason); }}><p className="muted-copy">This issues a full refund to the original payment method.</p><label className="field-label" htmlFor="react-refund-order-reason">Reason</label><input className="field-input" id="react-refund-order-reason" maxLength={240} required value={refundReason} onChange={(event) => setRefundReason(event.target.value)} disabled={busy} /><div className="button-row"><button className="button button--danger" type="submit" disabled={busy || !refundReason.trim()}>{busy ? "Refunding…" : `Confirm full refund ${formatMoney(order.total.amountCents)}`}</button><button className="button button--ghost" type="button" onClick={onDismissAction} disabled={busy}>Back</button></div></form> : null}
        </section>
      </div>
    </div>
  </div>;
}
