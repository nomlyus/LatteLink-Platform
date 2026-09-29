"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOperatorOrders, updateOperatorOrderStatus, cancelAndRefundOperatorOrder, refundOperatorOrder, type AdminOrderStreamState } from "../../api";
import { isSessionAuthFailure } from "../auth/session-compat";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { canAccessCapability, canAdvanceOrderStatus, canCancelOrder, canRefundOrder, filterVisibleOrders, getOrderActions, isStoreOperator, type OperatorOrder } from "../../model";
import { alertForNewOrders, disposeNewOrderAlertRuntime, enableNewOrderSound, isNewOrderSoundEnabled, resumeNewOrderSound } from "../../order-alert";
import { resolveAppConfigFulfillmentMode } from "@lattelink/contracts-catalog";
import { createOrdersRequestEpoch, mountOrdersRealtime, registerOrdersBrowserLifecycle, startOrdersPolling } from "./orders-lifecycle";

type OrdersLoadStatus = "loading" | "ready" | "error";
type OrdersViewFilter = "all" | "active" | "completed" | "canceled";
type StoreOrdersFilter = "all" | "needs_action" | "in_progress" | "ready" | "closed";
type OrdersUiState = {
  status: OrdersLoadStatus;
  orders: OperatorOrder[];
  error: string | null;
  refreshError: string | null;
  lastRefreshedAt: number | null;
  connectionState: AdminOrderStreamState;
  filter: OrdersViewFilter;
  storeFilter: StoreOrdersFilter;
  query: string;
  page: number;
  selectedOrderId: string | null;
  detailsOpen: boolean;
  detailsOpening: boolean;
  detailsClosing: boolean;
  busyOrderId: string | null;
  cancelOrderId: string | null;
  refundOrderId: string | null;
  actionError: string | null;
  actionNotice: string | null;
  soundEnabled: boolean;
  online: boolean;
};

const initialUiState: OrdersUiState = {
  status: "loading", orders: [], error: null, refreshError: null, lastRefreshedAt: null,
  connectionState: "connecting", filter: "active", storeFilter: "all", query: "", page: 1, selectedOrderId: null,
  detailsOpen: false, detailsOpening: false, detailsClosing: false, busyOrderId: null, cancelOrderId: null,
  refundOrderId: null, actionError: null, actionNotice: null, soundEnabled: false,
  online: typeof navigator === "undefined" || navigator.onLine
};

function mergeUpdatedOrder(orders: readonly OperatorOrder[], updated: OperatorOrder) {
  const existing = orders.some((order) => order.id === updated.id);
  return existing
    ? orders.map((order) => order.id === updated.id ? { ...order, ...updated, customer: updated.customer ?? order.customer } : order)
    : [updated, ...orders];
}

export function useOrders() {
  const { status: sessionStatus, session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const selectedLocationId = location.selectedLocationId;
  const selectedLocationIdRef = useRef(selectedLocationId);
  selectedLocationIdRef.current = selectedLocationId;
  const locationIds = location.availableLocations.map((item) => item.locationId);
  const [ui, setUi] = useState<OrdersUiState>(initialUiState);
  const statusRef = useRef(ui.status);
  statusRef.current = ui.status;
  const requestEpoch = useRef(createOrdersRequestEpoch());
  const requestController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const busyMutation = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const isStore = isStoreOperator(session?.operator);
  const selectedLocation = location.availableLocations.find((item) => item.locationId === selectedLocationId) ?? null;
  const appConfig = selectedLocation?.appConfig ?? null;
  const scopedLocationId = selectedLocationId && selectedLocationId !== "all" ? selectedLocationId : null;
  const canReadOrders = canAccessCapability(session?.operator, "orders:read");

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (session) void location.loadAvailableLocations();
  }, [session, location.loadAvailableLocations]);

  const refreshOrders = useCallback(async (silent = false) => {
    if (!session || !canReadOrders || !selectedLocationId || location.status !== "ready") return;
    const thisRequest = requestEpoch.current.begin();
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (!silent || statusRef.current !== "ready") {
      setUi((current) => ({ ...current, status: "loading", error: null, refreshError: null }));
    } else {
      setUi((current) => ({ ...current, refreshError: null }));
    }

    try {
      const currentSession = await refreshSession();
      if (!currentSession || controller.signal.aborted || !requestEpoch.current.isCurrent(thisRequest)) return;
      const requestedLocations = selectedLocationId === "all"
        ? locationIds
        : [selectedLocationId];
      if (requestedLocations.length === 0) throw new Error("No authorized locations are available for Orders.");
      const responses = await Promise.all(requestedLocations.map((locationId) => fetchOperatorOrders(currentSession, locationId, controller.signal)));
      if (controller.signal.aborted || !requestEpoch.current.isCurrent(thisRequest) || !mounted.current) return;
      const orders = responses.flat();
      setUi((current) => ({
        ...current,
        status: "ready",
        orders,
        error: null,
        refreshError: null,
        lastRefreshedAt: Date.now(),
        page: Math.min(current.page, Math.max(1, Math.ceil(orders.length / 15))),
        selectedOrderId: current.selectedOrderId && orders.some((order) => order.id === current.selectedOrderId)
          ? current.selectedOrderId
          : null
      }));
    } catch (error) {
      if (controller.signal.aborted || !requestEpoch.current.isCurrent(thisRequest) || !mounted.current) return;
      const message = error instanceof Error ? error.message : "Unable to load orders.";
      if (isSessionAuthFailure(error)) void logout();
      setUi((current) => current.status === "ready" && silent
        ? { ...current, refreshError: message }
        : { ...current, status: "error", error: message, refreshError: null });
    } finally {
      if (requestEpoch.current.isCurrent(thisRequest)) requestController.current = null;
    }
  }, [canReadOrders, location.status, locationIds.join("\u0000"), logout, refreshSession, selectedLocationId, session]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session || !canReadOrders || location.status !== "ready") return;
    void refreshOrders();
    return () => {
      requestEpoch.current.invalidate();
      requestController.current?.abort();
      requestController.current = null;
    };
  }, [canReadOrders, location.status, refreshOrders, session, sessionStatus]);

  useEffect(() => {
    if (!session || !canReadOrders || !selectedLocationId || location.status !== "ready") return;
    let active = true;
    let hasRecovered = false;
    if (selectedLocationId === "all") {
      setUi((current) => ({ ...current, connectionState: "connected" }));
      return () => { active = false; };
    }
    const unsubscribe = mountOrdersRealtime({
      session,
      locationId: selectedLocationId,
      onEvent: (event) => {
        if (!active || !mounted.current) return;
        if (event.type === "snapshot") {
          const orders = filterVisibleOrders(event.orders).filter((order) => order.locationId === selectedLocationId);
          setUi((current) => ({ ...current, orders, status: "ready", lastRefreshedAt: Date.now(), error: null }));
          return;
        }
        if (event.order.locationId !== selectedLocationId) return;
        setUi((current) => ({ ...current, orders: mergeUpdatedOrder(current.orders, event.order), lastRefreshedAt: Date.now() }));
      },
      onStateChange: (connectionState) => {
        if (!active || !mounted.current) return;
        if (connectionState === "reconnecting" || connectionState === "unavailable") hasRecovered = true;
        if (connectionState === "connected" && hasRecovered) {
          hasRecovered = false;
          void refreshRef.current();
        }
        setUi((current) => ({ ...current, connectionState }));
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [canReadOrders, location.status, selectedLocationId, session, streamEpoch]);

  const silentRefreshRef = useRef<() => void>(() => undefined);
  silentRefreshRef.current = () => { void refreshOrders(true); };
  refreshRef.current = silentRefreshRef.current;

  useEffect(() => registerOrdersBrowserLifecycle({
    online: () => {
      setUi((current) => ({ ...current, online: true }));
      void refreshRef.current();
      setStreamEpoch((epoch) => epoch + 1);
    },
    offline: () => setUi((current) => ({ ...current, online: false })),
    visible: () => {
      if (document.visibilityState === "visible") {
        void refreshRef.current();
        void resumeNewOrderSound();
      }
    }
  }), []);

  useEffect(() => {
    if (!session || !canReadOrders || !selectedLocationId || location.status !== "ready") return;
    if (selectedLocationId === "all" || ui.connectionState !== "connected") {
      return startOrdersPolling(() => { void refreshRef.current(); });
    }
  }, [canReadOrders, location.status, selectedLocationId, session, ui.connectionState]);

  useEffect(() => {
    if (!isStore || !session || !selectedLocationId || ui.status !== "ready") return;
    alertForNewOrders(`${session.operator.operatorUserId}:${selectedLocationId}`, ui.orders);
  }, [isStore, selectedLocationId, session, ui.orders, ui.status]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openingTimer.current) clearTimeout(openingTimer.current);
    requestController.current?.abort();
    if (isStore) void disposeNewOrderAlertRuntime();
  }, [isStore]);

  const openOrder = useCallback((orderId: string, trigger?: HTMLElement | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openingTimer.current) clearTimeout(openingTimer.current);
    opener.current = trigger ?? document.activeElement as HTMLElement;
    setUi((current) => ({ ...current, selectedOrderId: orderId, detailsOpen: true, detailsOpening: true, detailsClosing: false, actionError: null, actionNotice: null }));
    openingTimer.current = setTimeout(() => {
      openingTimer.current = null;
      if (mounted.current) setUi((current) => ({ ...current, detailsOpening: false }));
    }, 440);
  }, []);

  const closeOrder = useCallback(() => {
    setUi((current) => {
      if (!current.detailsOpen || current.detailsClosing) return current;
      return { ...current, detailsOpening: false, detailsClosing: true };
    });
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (!mounted.current) return;
      setUi((current) => ({ ...current, selectedOrderId: null, detailsOpen: false, detailsOpening: false, detailsClosing: false, cancelOrderId: null, refundOrderId: null }));
      opener.current?.focus({ preventScroll: true });
    }, 360);
  }, []);

  const setFilter = useCallback((filter: OrdersViewFilter) => setUi((current) => ({ ...current, filter, page: 1 })), []);
  const setQuery = useCallback((query: string) => setUi((current) => ({ ...current, query, page: 1 })), []);
  const setPage = useCallback((page: number) => setUi((current) => ({ ...current, page })), []);
  const setStoreFilter = useCallback((storeFilter: StoreOrdersFilter) => setUi((current) => ({ ...current, storeFilter, page: 1 })), []);
  const beginCancel = useCallback((orderId: string) => setUi((current) => ({ ...current, cancelOrderId: orderId, refundOrderId: null, actionError: null })), []);
  const beginRefund = useCallback((orderId: string) => setUi((current) => ({ ...current, refundOrderId: orderId, cancelOrderId: null, actionError: null })), []);
  const dismissAction = useCallback(() => setUi((current) => ({ ...current, cancelOrderId: null, refundOrderId: null, actionError: null })), []);

  const performMutation = useCallback(async (orderId: string, mutation: (currentSession: NonNullable<typeof session>, locationId: string | null) => Promise<OperatorOrder>, successMessage: string) => {
    if (!session || busyMutation.current) return false;
    busyMutation.current = true;
    const mutationLocationSelection = selectedLocationId;
    const mutationOperatorId = session.operator.operatorUserId;
    const order = ui.orders.find((item) => item.id === orderId);
    setUi((current) => ({ ...current, busyOrderId: orderId, actionError: null, actionNotice: null }));
    try {
      const currentSession = await refreshSession();
      if (!currentSession || !order) throw new Error("This order is no longer available. Refresh Orders and try again.");
      const mutationLocationId = selectedLocationId === "all"
        ? currentSession.operator.role === "owner" ? null : order.locationId
        : scopedLocationId;
      const updated = await mutation(currentSession, mutationLocationId);
      if (!mounted.current || selectedLocationIdRef.current !== mutationLocationSelection || currentSession.operator.operatorUserId !== mutationOperatorId) return true;
      setUi((current) => ({ ...current, orders: mergeUpdatedOrder(current.orders, updated), actionNotice: successMessage, cancelOrderId: null, refundOrderId: null }));
      await refreshRef.current();
      return true;
    } catch (error) {
      if (isSessionAuthFailure(error)) void logout();
      if (mounted.current) setUi((current) => ({ ...current, actionError: error instanceof Error ? error.message : "The order action could not be completed." }));
      return false;
    } finally {
      busyMutation.current = false;
      if (mounted.current) setUi((current) => ({ ...current, busyOrderId: null }));
    }
  }, [logout, refreshOrders, refreshSession, scopedLocationId, selectedLocationId, session, ui.orders]);

  const advanceOrder = useCallback(async (orderId: string, status: "IN_PREP" | "READY" | "COMPLETED", note?: string) => {
    const order = ui.orders.find((item) => item.id === orderId);
    if (!order || !scopedLocationId || !canAdvanceOrderStatus(session?.operator, appConfig) || getOrderActions(order, resolveAppConfigFulfillmentMode(appConfig))[0]?.status !== status) return false;
    return performMutation(orderId, (current, locationId) => updateOperatorOrderStatus(current, locationId, orderId, { status, note }), "Order status updated.");
  }, [appConfig, performMutation, scopedLocationId, session?.operator, ui.orders]);

  const cancelOrder = useCallback(async (orderId: string, reason: string) => {
    const order = ui.orders.find((item) => item.id === orderId);
    if (!order || !scopedLocationId || !canCancelOrder(session?.operator, appConfig, order) || !reason.trim()) return false;
    return performMutation(orderId, (current, locationId) => cancelAndRefundOperatorOrder(current, locationId, orderId, { reason: reason.trim() }), "Order canceled.");
  }, [appConfig, performMutation, scopedLocationId, session?.operator, ui.orders]);

  const refundOrder = useCallback(async (orderId: string, reason: string) => {
    const order = ui.orders.find((item) => item.id === orderId);
    const ownerAllLocations = selectedLocationId === "all" && session?.operator.role === "owner";
    if (!order || !canRefundOrder(session?.operator, order) || (!scopedLocationId && !ownerAllLocations) || !reason.trim()) return false;
    return performMutation(orderId, (current, locationId) => refundOperatorOrder(current, locationId, orderId, { reason: reason.trim() }), "Refund submitted.");
  }, [performMutation, scopedLocationId, selectedLocationId, session?.operator, ui.orders]);

  const enableSound = useCallback(async () => {
    const enabled = await enableNewOrderSound();
    setUi((current) => ({ ...current, soundEnabled: enabled && isNewOrderSoundEnabled() }));
  }, []);

  const selectedOrder = ui.orders.find((order) => order.id === ui.selectedOrderId) ?? null;
  const controlsAllowed = Boolean(scopedLocationId);
  return {
    ...ui,
    sessionStatus,
    session,
    selectedLocationId,
    selectedLocation,
    availableLocations: location.availableLocations,
    locationStatus: location.status,
    reloadLocations: location.loadAvailableLocations,
    appConfig,
    isStore,
    canReadOrders,
    selectedOrder,
    controlsAllowed,
    refresh: () => refreshOrders(false),
    setFilter,
    setQuery,
    setPage,
    setStoreFilter,
    beginCancel,
    beginRefund,
    dismissAction,
    openOrder,
    closeOrder,
    advanceOrder,
    cancelOrder,
    refundOrder,
    enableSound
  };
}
