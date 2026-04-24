import { setError, state } from "../state.js";
import { updateOperatorOrderStatus } from "../api.js";
import {
  canAdvanceOrderStatus,
  canCancelOrder,
  getOrderCancelUnavailableMessage,
  getOrderControlUnavailableMessage
} from "../model.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { clearPendingCancel } from "../orders-runtime.js";
import { render } from "../render.js";

export async function handleOrderAdvance(
  orderId: string,
  status: "IN_PREP" | "READY" | "COMPLETED" | "CANCELED",
  note?: string
) {
  if (!state.session) {
    return;
  }

  const selectedOrder = state.orders.find((order) => order.id === orderId);
  const canProceed =
    status === "CANCELED"
      ? canCancelOrder(state.session.operator, state.appConfig, selectedOrder ?? null)
      : canAdvanceOrderStatus(state.session.operator, state.appConfig);

  if (!canProceed) {
    setError(
      status === "CANCELED"
        ? getOrderCancelUnavailableMessage(state.session.operator, state.appConfig, selectedOrder ?? null) ??
            "Canceling this order is unavailable for this store."
        : getOrderControlUnavailableMessage(state.session.operator, state.appConfig) ??
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
