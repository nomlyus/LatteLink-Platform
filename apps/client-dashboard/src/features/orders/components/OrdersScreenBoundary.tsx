"use client";

import React, { type ReactNode } from "react";
import { isOrderTrackingEnabled, isStaffDashboardEnabled } from "@lattelink/contracts-catalog";
import type { OrdersState } from "../use-orders";

type OrdersScreenState = Pick<OrdersState,
  "sessionStatus" | "canReadOrders" | "locationStatus" | "status" | "orders" | "error"
  | "selectedLocationId" | "availableLocations" | "appConfig" | "reloadLocations" | "refresh"
>;

function LoadingOrders() {
  return (
    <div className="dash-surface orders-loading" role="status" aria-busy="true" aria-label="Loading orders">
      <span className="dash-skeleton dash-skeleton--row" />
      <span className="dash-skeleton dash-skeleton--row" />
      <span className="dash-skeleton dash-skeleton--row" />
    </div>
  );
}

function OrdersFailure({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="dash-surface dash-empty-surface" role="alert">
      <div className="dash-empty-copy">
        <p>{message}</p>
        <button className="button button--ghost" type="button" onClick={onRetry}>{retryLabel}</button>
      </div>
    </div>
  );
}

export function OrdersScreenBoundary({ data, toolbar, children }: { data: OrdersScreenState; toolbar?: ReactNode; children: ReactNode }) {
  if (data.sessionStatus === "loading") return <LoadingOrders />;
  if (data.sessionStatus === "signed-out") return null;
  if (!data.canReadOrders) {
    return <section className="dash-section dash-section--orders">
      <div className="dash-surface dash-empty-surface" role="status">
        <p className="dash-empty-copy">You don’t have permission to view orders for this workspace.</p>
      </div>
    </section>;
  }
  if (data.locationStatus === "idle" || data.locationStatus === "loading") {
    return <section className="dash-section dash-section--orders"><LoadingOrders /></section>;
  }
  if (data.locationStatus === "error") {
    return <section className="dash-section dash-section--orders">
      <OrdersFailure message="Unable to load authorized locations." retryLabel="Retry" onRetry={() => { void data.reloadLocations(); }} />
    </section>;
  }
  if (data.status === "loading" && data.orders.length === 0) {
    return <section className="dash-section dash-section--orders">{toolbar}<LoadingOrders /></section>;
  }
  if (data.status === "error") {
    return <section className="dash-section dash-section--orders">
      {toolbar}
      <OrdersFailure message={data.error ?? "Unable to load orders."} retryLabel="Try again" onRetry={() => { void data.refresh(); }} />
    </section>;
  }
  const featuresEnabled = data.selectedLocationId === "all"
    ? data.availableLocations.some((location) => isStaffDashboardEnabled(location.appConfig) && isOrderTrackingEnabled(location.appConfig))
    : isStaffDashboardEnabled(data.appConfig) && isOrderTrackingEnabled(data.appConfig);
  if (!featuresEnabled) {
    return <section className="dash-section dash-section--orders">
      <div className="dash-surface dash-empty-surface">
        <p className="dash-empty-copy">Live order tracking is paused. Enable order tracking in store capabilities before using the operations board.</p>
      </div>
    </section>;
  }
  return <>{children}</>;
}
