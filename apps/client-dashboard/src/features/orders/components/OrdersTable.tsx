"use client";

import React from "react";
import { formatOrderStatus, type OperatorOrder } from "../../../model";
import { formatDateTime, formatMoney } from "../../../ui/format";
import { orderItemCount, orderPaymentLabel } from "../orders-domain";

type OrdersTableProps = {
  orders: readonly OperatorOrder[];
  locationNames: ReadonlyMap<string, string>;
  includeLocation: boolean;
  onOpen: (orderId: string, trigger: HTMLElement) => void;
};

function orderTone(status: OperatorOrder["status"]) {
  if (status === "READY" || status === "COMPLETED") return "success";
  if (status === "CANCELED") return "danger";
  if (status === "IN_PREP") return "warning";
  return "neutral";
}

function OrderTableRow({ order, locationLabel, includeLocation, onOpen }: {
  order: OperatorOrder;
  locationLabel: string;
  includeLocation: boolean;
  onOpen: OrdersTableProps["onOpen"];
}) {
  const itemCount = orderItemCount(order);
  return (
    <tr className="dash-order-table__row" tabIndex={0}
      onClick={(event) => onOpen(order.id, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(order.id, event.currentTarget);
        }
      }}
    >
      <td><div className="dash-order-table__order"><strong>{order.pickupCode}</strong></div></td>
      {includeLocation ? <td><span className="dash-order-table__location">{locationLabel}</span></td> : null}
      <td><span className="dash-order-table__customer">{order.customer?.name ?? "Customer details unavailable"}</span></td>
      <td><span className="dash-order-table__items">{itemCount} {itemCount === 1 ? "item" : "items"}</span></td>
      <td><span className={`dash-status-badge dash-status-badge--${orderTone(order.status)}`}>{formatOrderStatus(order.status)}</span></td>
      <td><span className="orders-payment-state">{orderPaymentLabel(order)}</span></td>
      <td><span className="dash-order-table__date">{formatDateTime(order.timeline[0]?.occurredAt ?? "")}</span></td>
      <td className="dash-order-table__amount">{formatMoney(order.total.amountCents)}</td>
      <td className="dash-order-table__details">
        <button className="dash-order-table__details-button" type="button"
          aria-label={`View order details for ${order.pickupCode}`} title="View order details"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(order.id, event.currentTarget);
          }}
        >
          <svg className="dash-order-table__details-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4.25 2.25h5.5l2 2v9.5l-1.5-.8-1.5.8-1.5-.8-1.5.8-1.5-.8-1.5.8v-10a.7.7 0 0 1 .7-.7Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 2.5v2h2M5.5 7h4.75M5.5 9.25h4.75M5.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

export function OrdersTable({ orders, locationNames, includeLocation, onOpen }: OrdersTableProps) {
  return (
    <div className="dash-order-table-wrap">
      <table className={`dash-order-table orders-react-table${includeLocation ? " orders-react-table--with-location" : ""}`}>
        <colgroup>
          <col className="orders-react-table__col--order" />
          {includeLocation ? <col className="orders-react-table__col--location" /> : null}
          <col />
          <col className="orders-react-table__col--items" />
          <col className="orders-react-table__col--status" />
          <col className="orders-react-table__col--payment" />
          <col className="orders-react-table__col--placed" />
          <col className="orders-react-table__col--total" />
          <col className="orders-react-table__col--details" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Order</th>
            {includeLocation ? <th scope="col">Location</th> : null}
            <th scope="col">Customer</th>
            <th scope="col">Items</th>
            <th scope="col">Status</th>
            <th scope="col">Payment</th>
            <th scope="col">Placed</th>
            <th scope="col" className="dash-order-table__amount-heading">Total</th>
            <th scope="col" className="dash-order-table__details-heading">Details</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderTableRow key={order.id} order={order} includeLocation={includeLocation}
              locationLabel={locationNames.get(order.locationId) ?? order.locationId} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
