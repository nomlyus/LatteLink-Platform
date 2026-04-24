import { createOperatorStaffUser, updateOperatorStaffUser } from "../api.js";
import { canManageTeamMembers } from "../model.js";
import { addToast, setError, state } from "../state.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";

export async function handleTeamCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canManageTeamMembers(state.session.operator)) {
    setError("Team management is only available to accounts with staff access controls.");
    render();
    return;
  }

  const formData = new FormData(form);

  try {
    state.creatingTeamUser = true;
    setError(null);
    render();
    await createOperatorStaffUser(state.session, state.selectedLocationId === "all" ? null : state.selectedLocationId, {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password")
    });
    addToast("Created team member account.", "success");
    form.reset();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create team member account.");
  } finally {
    state.creatingTeamUser = false;
    render();
  }
}

export async function handleTeamUserSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canManageTeamMembers(state.session.operator)) {
    setError("Team management is only available to accounts with staff access controls.");
    render();
    return;
  }

  const operatorUserId = form.dataset.operatorUserId;
  if (!operatorUserId) {
    return;
  }

  const formData = new FormData(form);
  const activeField = form.elements.namedItem("active");
  const active = activeField instanceof HTMLInputElement ? activeField.checked : false;
  const wasActive = form.dataset.wasActive === "true";

  if (wasActive && !active && typeof window !== "undefined") {
    const confirmed = window.confirm("Deactivate this team member? They will lose dashboard access until you reactivate them.");
    if (!confirmed) {
      if (activeField instanceof HTMLInputElement) {
        activeField.checked = true;
      }
      return;
    }
  }

  try {
    state.busyTeamUserId = operatorUserId;
    setError(null);
    render();
    await updateOperatorStaffUser(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      operatorUserId,
      {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password"),
      active
      }
    );
    addToast("Updated team member access.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update team member access.");
  } finally {
    state.busyTeamUserId = null;
    render();
  }
}
