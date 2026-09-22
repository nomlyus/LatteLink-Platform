import { state, ordersRefreshIntervalMs, cancelConfirmTimeoutMs } from "./state";
import { subscribeToAdminOrderStream, type AdminOrderStreamEvent } from "./api";
import { canAccessCapability, filterOrdersByView, isActiveOrder, isStoreOperator, type OperatorOrder } from "./model";
import { alertForNewOrders, resetNewOrderAlert } from "./order-alert";
import { render } from "./render";

export function getOrderAlertScope() {
  const operatorId = state.session?.operator.operatorUserId ?? "signed-out";
  return `${operatorId}:${state.selectedLocationId ?? "unselected"}`;
}

export function alertForCurrentOrders() {
  if (!isStoreOperator(state.session?.operator ?? null)) {
    resetNewOrderAlert();
    return;
  }
  alertForNewOrders(getOrderAlertScope(), state.orders);
}

export function stopAutoRefresh() {
  if (state.autoRefreshHandle !== null) {
    clearInterval(state.autoRefreshHandle);
    state.autoRefreshHandle = null;
  }
  if (state.orderStreamUnsubscribe !== null) {
    state.orderStreamUnsubscribe();
    state.orderStreamUnsubscribe = null;
  }
}

export function startAutoRefresh(loadDashboard: (options?: { silent?: boolean }) => Promise<void>) {
  if (typeof window === "undefined") {
    return;
  }
  if (!state.session || state.loading || !canAccessCapability(state.session.operator, "orders:read")) {
    return;
  }

  if (state.orderStreamUnsubscribe !== null || state.autoRefreshHandle !== null) {
    return;
  }

  const session = state.session;
  const locationId = state.selectedLocationId;

  // The order stream is location-scoped. For All Locations, polling keeps the
  // aggregate correct instead of allowing one location's SSE snapshot to
  // overwrite the portfolio state.
  if (locationId === "all") {
    state.autoRefreshHandle = setInterval(() => {
      if (state.session && !state.loading) {
        void loadDashboard({ silent: true });
      }
    }, ordersRefreshIntervalMs);
    return;
  }

  state.orderStreamUnsubscribe = subscribeToAdminOrderStream({
    session,
    locationId,
    onEvent: (event: AdminOrderStreamEvent) => {
      if (!state.session) {
        return;
      }
      if (event.type === "snapshot") {
        state.orders = event.orders;
        alertForCurrentOrders();
        state.lastRefreshedAt = Date.now();
        reconcileSelectedOrder();
        render();
      } else if (event.type === "order_update") {
        applyUpdatedOrder(event.order);
        alertForCurrentOrders();
        render();
      }
    },
    onError: () => {
      if (state.orderStreamUnsubscribe !== null) {
        state.orderStreamUnsubscribe = null;
      }
      if (state.autoRefreshHandle === null && state.session) {
        state.autoRefreshHandle = setInterval(() => {
          if (state.session && !state.loading) {
            void loadDashboard({ silent: true });
          }
        }, ordersRefreshIntervalMs);
      }
    }
  });
}

export function applyUpdatedOrder(updatedOrder: OperatorOrder) {
  const existingOrder = state.orders.find((order) => order.id === updatedOrder.id);
  const nextOrder = existingOrder
    ? { ...existingOrder, ...updatedOrder, customer: updatedOrder.customer ?? existingOrder.customer }
    : updatedOrder;
  state.orders = existingOrder
    ? state.orders.map((order) => order.id === updatedOrder.id ? nextOrder : order)
    : [nextOrder, ...state.orders];
  state.lastRefreshedAt = Date.now();
  reconcileSelectedOrder();
}

export function clearPendingCancel() {
  if (state.pendingCancelTimeoutHandle !== null) {
    clearTimeout(state.pendingCancelTimeoutHandle);
    state.pendingCancelTimeoutHandle = null;
  }
  state.pendingCancelOrderId = null;
}

export function armPendingCancel(orderId: string) {
  clearPendingCancel();
  state.pendingCancelOrderId = orderId;
  state.pendingCancelTimeoutHandle = setTimeout(() => {
    if (state.pendingCancelOrderId === orderId) {
      clearPendingCancel();
      render();
    }
  }, cancelConfirmTimeoutMs);
}

export function selectOrder(orderId: string | null) {
  clearPendingCancel();
  state.selectedOrderId = orderId;
}

export function reconcileSelectedOrder() {
  if (state.selectedOrderId && state.orders.some((order) => order.id === state.selectedOrderId)) {
    return;
  }
  state.selectedOrderId = state.orders.find(isActiveOrder)?.id ?? state.orders[0]?.id ?? null;
}

export function getSelectedOrder() {
  if (state.selectedOrderId) {
    return state.orders.find((order) => order.id === state.selectedOrderId) ?? null;
  }
  return state.orders.find(isActiveOrder) ?? state.orders[0] ?? null;
}

export function getVisibleOrders() {
  return filterOrdersByView(state.orders, state.orderFilter);
}
