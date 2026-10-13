"use client";

import React, { useMemo } from "react";
import { useOrders } from "../use-orders";
import { OrderDetails } from "./OrderDetails";
import { OrdersScreenBoundary } from "./OrdersScreenBoundary";
import { StoreOrdersBoard } from "./StoreOrdersBoard";

export function StoreOrdersPage() {
  const data = useOrders();
  const locationNames = useMemo(() => new Map(data.availableLocations.map((location) => [location.locationId, location.locationName])), [data.availableLocations]);

  return (
    <OrdersScreenBoundary data={data}>
      <StoreOrdersBoard data={data} />
      <OrderDetails data={data} locationNames={locationNames} />
    </OrdersScreenBoundary>
  );
}
