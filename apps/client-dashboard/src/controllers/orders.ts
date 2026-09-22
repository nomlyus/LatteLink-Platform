import { setError, state } from "../state";
import { cancelAndRefundOperatorOrder, updateOperatorOrderStatus } from "../api";
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  getOrderCancelUnavailableMessage,
  getOrderControlUnavailableMessage
} from "../model";
import { handleOperatorActionError, loadDashboard } from "../lifecycle";
import { clearPendingCancel } from "../orders-runtime";
import { render } from "../render";

export async function handleOrderAdvance(
  orderId: string,
  status: "IN_PREP" | "READY" | "COMPLETED",
  note?: string
) {
  if (!state.session) {
    return;
  }

  const canProceed = canAdvanceOrderStatus(state.session.operator, state.appConfig);

  if (!canProceed) {
    setError(
      getOrderControlUnavailableMessage(state.session.operator, state.appConfig) ??
        "Manual order status controls are unavailable for this store."
    );
    render();
    return;
  }

  try {
    state.busyOrderId = orderId;
    clearPendingCancel();
    setError(null);
    render();
    await updateOperatorOrderStatus(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      orderId,
      { status, note }
    );
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update order.");
  } finally {
    state.busyOrderId = null;
    render();
  }
}

export async function handleOrderCancel(orderId: string, reason: string) {
  if (!state.session) {
    return;
  }

  const selectedOrder = state.orders.find((order) => order.id === orderId);
  if (!canCancelOrder(state.session.operator, state.appConfig, selectedOrder ?? null)) {
    setError(
      getOrderCancelUnavailableMessage(state.session.operator, state.appConfig, selectedOrder ?? null) ??
        "Canceling this order is unavailable for this store."
    );
    render();
    return;
  }

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    setError("Enter a reason before canceling an order.");
    render();
    return;
  }

  try {
    state.busyOrderId = orderId;
    clearPendingCancel();
    setError(null);
    render();
    await cancelAndRefundOperatorOrder(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      orderId,
      { reason: normalizedReason }
    );
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to cancel and refund order.");
  } finally {
    state.busyOrderId = null;
    render();
  }
}
