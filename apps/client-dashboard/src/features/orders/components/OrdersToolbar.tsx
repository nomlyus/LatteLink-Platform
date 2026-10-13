"use client";

import React from "react";
import type { OrdersViewFilter } from "../orders-domain";
import { getOrdersConnectionLabel, type OrdersConnectionStatus } from "../orders-connection";

const filterOptions: ReadonlyArray<{ value: OrdersViewFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All" }
];

type OrdersToolbarProps = OrdersConnectionStatus & {
  isOwner: boolean;
  loading: boolean;
  filter: OrdersViewFilter;
  refreshError: string | null;
  onFilterChange: (filter: OrdersViewFilter) => void;
  onRefresh: () => void;
};

export function OrdersToolbar({ isOwner, loading, filter, refreshError, onFilterChange, onRefresh, ...connection }: OrdersToolbarProps) {
  return (
    <div className="dash-order-toolbar orders-toolbar">
      {!isOwner ? (
        <div className="orders-toolbar__filters">
          <div className="orders-filter-tabs" role="group" aria-label="Order status filter">
            {filterOptions.map((option) => (
              <button key={option.value} type="button" aria-pressed={filter === option.value}
                className={filter === option.value ? "is-active" : ""} onClick={() => onFilterChange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!isOwner || refreshError ? (
        <div className="dash-order-toolbar__status">
          {!isOwner ? (
            <span className={`dash-order-connection dash-order-connection--${connection.online ? connection.connectionState : "unavailable"}`} role="status" aria-live="polite">
              {getOrdersConnectionLabel(connection)}
            </span>
          ) : null}
          {refreshError ? <span className="dash-order-refresh-error" role="alert">{refreshError}</span> : null}
        </div>
      ) : null}
      <button className="button button--ghost" type="button" onClick={onRefresh} disabled={loading}>
        {loading ? <><span className="spinner" /> Refreshing…</> : "Refresh"}
      </button>
    </div>
  );
}
