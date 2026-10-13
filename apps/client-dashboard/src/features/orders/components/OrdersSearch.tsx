"use client";

import React from "react";
import { DashboardSearch } from "../../../components/dashboard/DashboardSearch";
import { useOrdersSearch } from "../orders-search-provider";

export function OrdersSearch() {
  const { query, setQuery } = useOrdersSearch();
  return <DashboardSearch label="Search orders" controls="orders-results" query={query} onQueryChange={setQuery} />;
}
