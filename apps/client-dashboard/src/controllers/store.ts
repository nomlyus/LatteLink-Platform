import { updateOperatorStoreConfig } from "../api.js";
import { canUpdateStoreSettings } from "../model.js";
import { addToast, setError, state } from "../state.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";

export async function handleStoreSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canUpdateStoreSettings(state.session.operator)) {
    setError("Store settings are read-only for your account.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.savingStore = true;
    setError(null);
    render();
    await updateOperatorStoreConfig(state.session, state.selectedLocationId === "all" ? null : state.selectedLocationId, {
      storeName: formData.get("storeName"),
      locationName: formData.get("locationName"),
      hours: formData.get("hours"),
      pickupInstructions: formData.get("pickupInstructions")
    });
    addToast("Saved store settings.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save store settings.");
  } finally {
    state.savingStore = false;
    render();
  }
}
