"use client";

import React from "react";
import { resolveAppConfigFulfillmentMode } from "@lattelink/contracts-catalog";
import { canAdvanceOrderStatus, canCancelOrder, canRefundOrder, getOrderActions, getOrderCancelUnavailableMessage, getOrderControlUnavailableMessage } from "../../../model";
import type { OrdersState } from "../use-orders";
import { OrderDetailDialog } from "./OrderDetailDialog";

function getReadOnlyMessage(data: OrdersState) {
  const order = data.selectedOrder;
  if (order?.status === "CANCELED") return "Already canceled";
  if (order?.status === "REFUNDED") return "Already refunded";
  if (order?.status === "PARTIALLY_REFUNDED") return "Partially refunded";
  if (data.selectedLocationId === "all") return "Choose a specific location to manage this order.";
  if (order?.status === "COMPLETED") return "Refund unavailable";
  return getOrderCancelUnavailableMessage(data.session?.operator, data.appConfig, order)
    ?? getOrderControlUnavailableMessage(data.session?.operator, data.appConfig)
    ?? "Read-only order details";
}

export function OrderDetails({ data, locationNames }: { data: OrdersState; locationNames: ReadonlyMap<string, string> }) {
  const order = data.selectedOrder;
  const operator = data.session?.operator;
  const allLocationsOwner = data.selectedLocationId === "all" && operator?.role === "owner";
  const canRefund = Boolean(order && canRefundOrder(operator, order) && (data.controlsAllowed || allLocationsOwner));
  const nextAction = order ? getOrderActions(order, resolveAppConfigFulfillmentMode(data.appConfig))[0] : undefined;
  const canAdvance = Boolean(order && data.controlsAllowed && canAdvanceOrderStatus(operator, data.appConfig) && nextAction);
  const canCancel = Boolean(order && data.controlsAllowed && canCancelOrder(operator, data.appConfig, order));

  return (
    <OrderDetailDialog
      order={order}
      locationLabel={order ? locationNames.get(order.locationId) ?? order.locationId : ""}
      open={data.detailsOpen}
      opening={data.detailsOpening}
      closing={data.detailsClosing}
      busy={data.busyOrderId === order?.id}
      canRefund={canRefund && data.refundOrderId !== order?.id}
      canAdvance={canAdvance}
      nextAction={nextAction}
      canCancel={canCancel && data.cancelOrderId !== order?.id}
      readOnlyMessage={getReadOnlyMessage(data)}
      cancelRequested={data.cancelOrderId === order?.id}
      refundRequested={data.refundOrderId === order?.id}
      error={data.actionError}
      notice={data.actionNotice}
      onClose={data.closeOrder}
      onAdvance={(status, note) => { if (order) void data.advanceOrder(order.id, status, note); }}
      onBeginCancel={() => { if (order) data.beginCancel(order.id); }}
      onCancel={(reason) => { if (order) void data.cancelOrder(order.id, reason); }}
      onBeginRefund={() => { if (order) data.beginRefund(order.id); }}
      onRefund={(reason) => { if (order) void data.refundOrder(order.id, reason); }}
      onDismissAction={data.dismissAction}
    />
  );
}
