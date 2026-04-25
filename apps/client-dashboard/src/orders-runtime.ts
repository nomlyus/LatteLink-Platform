import { state, ordersRefreshIntervalMs, cancelConfirmTimeoutMs } from "./state.js";
import { canAccessCapability, filterOrdersByView, isActiveOrder } from "./model.js";
import { render } from "./render.js";

export function stopAutoRefresh() {
  if (state.autoRefreshHandle !== null) {
    clearInterval(state.autoRefreshHandle);
    state.autoRefreshHandle = null;
  }
}

export function startAutoRefresh(loadDashboard: (options?: { silent?: boolean }) => Promise<void>) {
  if (typeof window === "undefined" || state.autoRefreshHandle !== null) {
    return;
  }
  if (
    !state.session ||
    state.section !== "orders" ||
    state.loading ||
    !canAccessCapability(state.session.operator, "orders:read")
  ) {
    return;
  }
  state.autoRefreshHandle = setInterval(() => {
    if (state.section === "orders" && state.session && !state.loading) {
      void loadDashboard({ silent: true });
    }
  }, ordersRefreshIntervalMs);
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
