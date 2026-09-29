"use client";

import React, { useState, type FormEvent } from "react";
import { z } from "zod";
import { DashboardDialog } from "../../../components/dashboard/DashboardDialog";
import type { OperatorUser } from "../../../model";
import { buildTeamMemberUpdate, getAdditionalTeamLocationCount, getTeamRoleLabel, requiresTeamAccessConfirmation, type TeamMemberDraft } from "../team-domain";

function getInitialDraft(member: OperatorUser): TeamMemberDraft {
  return { displayName: member.displayName, email: member.email, role: member.role, active: member.active, password: "" };
}

export function TeamMemberDialog({
  member,
  currentOperatorUserId,
  locations,
  canWrite,
  canDelete,
  pending,
  error,
  onClose,
  onSave,
  onRemove
}: {
  member: OperatorUser;
  currentOperatorUserId: string;
  locations: readonly { locationId: string; locationName: string }[];
  canWrite: boolean;
  canDelete: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (member: OperatorUser, patch: NonNullable<ReturnType<typeof buildTeamMemberUpdate>>) => Promise<boolean>;
  onRemove: (member: OperatorUser) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => getInitialDraft(member));
  const [validationError, setValidationError] = useState<string | null>(null);
  const isSelf = member.operatorUserId === currentOperatorUserId;
  const assignedLocationNames = locations.filter((location) => (member.locationIds ?? [member.locationId]).includes(location.locationId)).map((location) => location.locationName);
  const additionalLocationCount = getAdditionalTeamLocationCount(member, locations);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    let patch: ReturnType<typeof buildTeamMemberUpdate>;
    try {
      patch = buildTeamMemberUpdate(member, draft);
      if (!patch) {
        setValidationError("There are no changes to save.");
        return;
      }
    } catch (saveError) {
      setValidationError(saveError instanceof z.ZodError
        ? saveError.issues[0]?.message ?? "Check the account details and try again."
        : saveError instanceof Error ? saveError.message : "Check the account details and try again.");
      return;
    }
    if (requiresTeamAccessConfirmation(member, draft)) {
      const scope = "across every location assigned to this account";
      if (!window.confirm(`This change reduces operator access ${scope}. Continue?`)) return;
    }
    setValidationError(null);
    if (await onSave(member, patch)) onClose();
  }

  async function remove() {
    if (!canDelete || pending || !window.confirm(`Remove ${member.displayName}'s operator account from every location? This cannot be undone.`)) return;
    if (await onRemove(member)) onClose();
  }

  const editable = canWrite && !pending;
  function updateRole(value: string) {
    if (value === "owner" || value === "manager" || value === "store") {
      setDraft((current) => ({ ...current, role: value }));
    }
  }

  return (
    <DashboardDialog title={canWrite ? "Edit operator access" : "Operator account"} subtitle={`${member.displayName} · ${member.email}`} onClose={onClose} panelClassName="dash-menu-modal__panel--compact dash-team-dialog">
      <form className="dash-team-form" noValidate onSubmit={(event) => { void submit(event); }}>
        {!canWrite ? <p className="dash-team-readonly" role="status">You can review team members, but editing is read-only for your role.</p> : null}
        <div className="dash-team-form__grid">
          <label className="field"><span>Name</span><input autoComplete="name" required disabled={!editable} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label className="field"><span>Email</span><input autoComplete="email" type="email" required disabled={!editable} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="field"><span>Role</span><select disabled={!editable} value={draft.role} onChange={(event) => updateRole(event.target.value)}>
            {member.role === "owner" ? <option value="owner">{getTeamRoleLabel("owner")}</option> : null}
            <option value="manager">{getTeamRoleLabel("manager")}</option><option value="store">{getTeamRoleLabel("store")}</option>
          </select></label>
          <label className="field"><span>Reset password</span><input autoComplete="new-password" type="password" minLength={8} maxLength={128} disabled={!editable} value={draft.password} placeholder="Leave blank to keep current password" onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} /></label>
          <label className="dash-checkbox-row dash-team-active"><input type="checkbox" checked={draft.active} disabled={!editable || isSelf} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Account active</span></label>
          <div className="field dash-team-location-access"><span>Location access</span><div className="dash-team-location-list">{assignedLocationNames.length ? assignedLocationNames.map((name) => <span key={name}>{name}</span>) : <span>Assigned to this location</span>}{additionalLocationCount > 0 ? <span>+{additionalLocationCount} outside your available locations</span> : null}</div><small>Location access cannot be changed from this screen.</small></div>
        </div>
        {validationError || error ? <p className="dash-team-form-error" role="alert">{validationError ?? error}</p> : null}
        <div className="dash-team-dialog__actions">
          {canDelete ? <button className="button button--danger" type="button" disabled={pending} onClick={() => { void remove(); }}>Remove account</button> : null}
          <span className="dash-team-dialog__spacer" />
          <button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Close</button>
          {canWrite ? <button className="button button--primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button> : null}
        </div>
      </form>
    </DashboardDialog>
  );
}
