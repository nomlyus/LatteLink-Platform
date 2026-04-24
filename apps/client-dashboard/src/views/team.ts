import { isAllLocationsSelected, state } from "../state.js";
import { escapeHtml, getOperatorInitials } from "../ui/format.js";
import { canManageTeamMembers, getOperatorRoleLabel } from "../model.js";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common.js";

export function renderTeamSection() {
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Team",
          title: "Choose a location",
          description: "Operator access is managed one location at a time."
        })}
        ${renderLocationSelectionNotice("Select a specific location to review or update the operator accounts assigned to that storefront.")}
      </section>
    `;
  }

  const canWrite = canManageTeamMembers(state.session?.operator ?? null);
  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Team",
        title: "Operator access",
        description: "Control owner, manager, and store-screen access for this location."
      })}
      ${
        canWrite
          ? `
              <article class="dash-surface">
                <div class="dash-surface-head">
                  <div>
                    <div class="dash-panel-title">Create account</div>
                    <h3 class="dash-surface-title">Add a team member</h3>
                  </div>
                </div>
                <form class="dash-inline-form dash-inline-form--team" data-form="team-create">
                  <label class="field dash-field-inline">
                    <span>Name</span>
                    <input name="displayName" placeholder="Avery Quinn" required />
                  </label>
                  <label class="field dash-field-inline">
                    <span>Email</span>
                    <input name="email" type="email" placeholder="avery@store.com" required />
                  </label>
                  <label class="field dash-field-inline">
                    <span>Role</span>
                    <select name="role">
                      <option value="store">Store screen</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                  <label class="field dash-field-inline">
                    <span>Temporary password</span>
                    <input name="password" type="password" placeholder="Minimum 8 characters" minlength="8" required />
                  </label>
                  <button class="button button--primary" type="submit" ${state.creatingTeamUser ? "disabled" : ""}>
                    ${state.creatingTeamUser ? '<span class="spinner"></span>' : "Create account"}
                  </button>
                </form>
              </article>
            `
          : ""
      }

      <article class="dash-surface">
        <div class="dash-surface-head">
          <div>
            <div class="dash-panel-title">Team</div>
            <h3 class="dash-surface-title">${state.teamUsers.length} active accounts</h3>
          </div>
        </div>
        ${
          canWrite
            ? ""
            : `<p class="muted-copy">Team access is read-only for your current role. Only store owners can create, deactivate, or update operator accounts.</p>`
        }
        <div class="dash-data-group__rows">
        ${
          state.teamUsers.length > 0
            ? state.teamUsers
                .map(
                  (user) => `
                    <form
                      class="dash-data-row dash-data-row--team"
                      data-form="team-user"
                      data-operator-user-id="${user.operatorUserId}"
                      data-was-active="${user.active ? "true" : "false"}"
                    >
                      <div class="dash-data-row__identity dash-data-row__identity--with-avatar">
                        <span class="dash-avatar">${escapeHtml(getOperatorInitials(user.displayName))}</span>
                        <div>
                          <strong>${escapeHtml(user.displayName)}</strong>
                          <span>${escapeHtml(user.email)}</span>
                        </div>
                      </div>
                      <div class="dash-data-row__fields">
                        <label class="field dash-field-inline">
                          <span>Name</span>
                          <input name="displayName" value="${escapeHtml(user.displayName)}" ${canWrite ? "" : "disabled"} />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Email</span>
                          <input name="email" type="email" value="${escapeHtml(user.email)}" ${canWrite ? "" : "disabled"} />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Role</span>
                          <select name="role" ${canWrite ? "" : "disabled"}>
                            ${(["owner", "manager", "store"] as const)
                              .map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(getOperatorRoleLabel(role))}</option>`)
                              .join("")}
                          </select>
                        </label>
                        ${
                          canWrite
                            ? `
                                <label class="field dash-field-inline">
                                  <span>Reset password</span>
                                  <input name="password" type="password" placeholder="Leave blank to keep current password" minlength="8" />
                                </label>
                              `
                            : ""
                        }
                        <label class="toggle dash-toggle-inline">
                          <input type="checkbox" name="active" ${user.active ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                          <span>${user.active ? "Active" : "Inactive"}</span>
                        </label>
                      </div>
                      <div class="dash-data-row__actions">
                        <span class="dash-status-badge dash-status-badge--${user.active ? "success" : "neutral"}">${user.active ? "Active" : "Inactive"}</span>
                        ${
                          canWrite
                            ? `
                                <button class="button button--secondary" type="submit" ${state.busyTeamUserId === user.operatorUserId ? "disabled" : ""}>
                                  ${state.busyTeamUserId === user.operatorUserId ? "Saving…" : "Save"}
                                </button>
                              `
                            : ""
                        }
                      </div>
                    </form>
                  `
                )
                .join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No operator accounts are available for this store yet.</p></div>`
        }
        </div>
      </article>
    </section>
  `;
}
