"use client";

import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type OrdersSearchState = { query: string; setQuery: (query: string) => void };
const OrdersSearchContext = createContext<OrdersSearchState | null>(null);

export function OrdersSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <OrdersSearchContext.Provider value={value}>{children}</OrdersSearchContext.Provider>;
}

export function useOrdersSearch() {
  const search = useContext(OrdersSearchContext);
  if (!search) throw new Error("Orders search requires the Orders route provider.");
  return search;
}
