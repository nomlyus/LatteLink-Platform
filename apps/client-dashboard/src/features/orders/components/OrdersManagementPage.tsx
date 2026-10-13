"use client";

import React, { useMemo } from "react";
import { filterOrders, paginateOrders, type OrdersViewFilter } from "../orders-domain";
import { useOrders } from "../use-orders";
import { OrderDetails } from "./OrderDetails";
import { TablePagination } from "../../../components/dashboard/TablePagination";
import { OrdersTable } from "./OrdersTable";
import { OrdersToolbar } from "./OrdersToolbar";
import { OrdersScreenBoundary } from "./OrdersScreenBoundary";

function emptyOrdersMessage(query: string, filter: OrdersViewFilter) {
  if (query) return "No orders match this search.";
  if (filter === "active") return "No active orders.";
  if (filter === "completed") return "No completed orders.";
  if (filter === "canceled") return "No canceled orders.";
  return "No orders yet.";
}

export function OrdersManagementPage() {
  const data = useOrders();
  const isOwner = data.session?.operator.role === "owner";
  const locationNames = useMemo(() => new Map(data.availableLocations.map((location) => [location.locationId, location.locationName])), [data.availableLocations]);
  const viewFilter = isOwner ? "all" : data.filter;
  const filtered = useMemo(() => filterOrders(data.orders, viewFilter, data.query, locationNames), [data.orders, viewFilter, data.query, locationNames]);
  const paginated = useMemo(() => paginateOrders(filtered, data.page), [data.page, filtered]);
  const toolbar = (
    <OrdersToolbar isOwner={isOwner} loading={data.status === "loading"} filter={data.filter}
      refreshError={data.refreshError} online={data.online} connectionState={data.connectionState}
      selectedLocationId={data.selectedLocationId} onFilterChange={data.setFilter}
      onRefresh={() => { void data.refresh(); }} />
  );

  return (
    <OrdersScreenBoundary data={data} toolbar={toolbar}>
      <section className="dash-section dash-section--orders">
        {data.selectedLocationId === "all" ? (
          <div className="orders-readonly-note" role="status">This all-locations Orders view is read-only. Choose one location to update an order’s status.</div>
        ) : null}
        {toolbar}
        <article className="dash-surface dash-order-table-surface" id="orders-results">
          {filtered.length === 0 ? (
            <div className="dash-empty-surface" role="status"><p className="dash-empty-copy">{emptyOrdersMessage(data.query, viewFilter)}</p></div>
          ) : (
            <OrdersTable orders={paginated.items} locationNames={locationNames}
              includeLocation={data.selectedLocationId === "all"} onOpen={data.openOrder} />
          )}
        </article>
        <TablePagination label="Orders pagination" page={paginated.page} pageCount={paginated.pageCount} start={paginated.start}
          end={paginated.end} total={paginated.total} onPage={data.setPage} />
      </section>
      <OrderDetails data={data} locationNames={locationNames} />
    </OrdersScreenBoundary>
  );
}
