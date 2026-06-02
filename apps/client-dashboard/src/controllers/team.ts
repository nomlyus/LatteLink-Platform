import { createOperatorStaffUser, deleteOperatorStaffUser, updateOperatorStaffUser, updateOperatorOnboarding } from "../api.js";
import { canManageTeamMembers, isOwnerOperator } from "../model.js";
import { addToast, setError, state } from "../state.js";
import { persistSession } from "../storage.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";
import { rememberPendingTeamUserUpdate, replaceTeamUser } from "../team-state.js";

function applyUpdatedTeamUser(updatedUser: ReturnType<typeof replaceTeamUser>[number]) {
  rememberPendingTeamUserUpdate(updatedUser);
  state.teamUsers = replaceTeamUser(state.teamUsers, updatedUser);
  if (state.session?.operator.operatorUserId === updatedUser.operatorUserId) {
    state.session = {
      ...state.session,
      operator: updatedUser
    };
    persistSession(state.session);
  }
}

export async function handleTeamCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canManageTeamMembers(state.session.operator)) {
    setError("Team management is only available to accounts with team access controls.");
    render();
    return;
  }

  const formData = new FormData(form);

  try {
    state.creatingTeamUser = true;
    setError(null);
    render();
    const locationId = state.selectedLocationId === "all" ? null : state.selectedLocationId;
    await createOperatorStaffUser(state.session, locationId, {
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      role: formData.get("role"),
      password: formData.get("password")
    });
    if (state.onboardingSummary && locationId) {
      state.onboardingSummary = await updateOperatorOnboarding(state.session, locationId, {
        teamConfiguredOrSkipped: true
      });
    }
    addToast("Created operator account.", "success");
    form.reset();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create operator account.");
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
    setError("Team management is only available to accounts with team access controls.");
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
    const confirmed = window.confirm("Deactivate this operator account? It will lose dashboard access until you reactivate it.");
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
    const updatedUser = await updateOperatorStaffUser(
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
    applyUpdatedTeamUser(updatedUser);
    addToast("Updated operator access.", "success");
    await loadDashboard();
    applyUpdatedTeamUser(updatedUser);
  } catch (error) {
    await handleOperatorActionError(error, "Unable to update operator access.");
  } finally {
    state.busyTeamUserId = null;
    render();
  }
}

export async function handleTeamUserDelete(operatorUserId: string) {
  if (!state.session) {
    return;
  }
  if (!isOwnerOperator(state.session.operator) || !canManageTeamMembers(state.session.operator)) {
    setError("Only owner accounts can delete operator accounts.");
    render();
    return;
  }
  if (state.session.operator.operatorUserId === operatorUserId) {
    setError("You cannot delete your own account.");
    render();
    return;
  }

  const targetUser = state.teamUsers.find((user) => user.operatorUserId === operatorUserId);
  if (!targetUser) {
    return;
  }
  if (targetUser.role === "owner") {
    setError("Owner accounts can only be managed from the admin dashboard.");
    render();
    return;
  }

  if (typeof window !== "undefined" && !window.confirm(`Delete ${targetUser.displayName}'s dashboard account? This cannot be undone.`)) {
    return;
  }

  try {
    state.busyTeamUserId = operatorUserId;
    setError(null);
    render();
    await deleteOperatorStaffUser(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      operatorUserId
    );
    state.teamUsers = state.teamUsers.filter((user) => user.operatorUserId !== operatorUserId);
    addToast("Deleted operator account.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to delete operator account.");
  } finally {
    state.busyTeamUserId = null;
    render();
  }
}
