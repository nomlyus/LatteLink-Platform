"use client";

import React, { useState, type FormEvent } from "react";
import { DashboardDialog } from "../../../components/dashboard/DashboardDialog";
import { getTeamRoleLabel, validateTeamCreateDraft, type TeamCreateDraft, type TeamCreateInput } from "../team-domain";

export function TeamCreateDialog({
  locationName,
  pending,
  error,
  onClose,
  onCreate
}: {
  locationName: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: TeamCreateInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<TeamCreateDraft>({ displayName: "", email: "", role: "manager", password: "" });
  const [validationError, setValidationError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validation = validateTeamCreateDraft(draft);
    if (!validation.success) {
      setValidationError(validation.error.issues[0]?.message ?? "Check the account details and try again.");
      return;
    }
    setValidationError(null);
    if (await onCreate(validation.data)) onClose();
  }

  function updateRole(value: string) {
    if (value === "manager" || value === "store") {
      setDraft((current) => ({ ...current, role: value }));
    }
  }

  return (
    <DashboardDialog title="Add a team member" subtitle={`Creates an operator account for ${locationName}.`} onClose={onClose} panelClassName="dash-menu-modal__panel--compact dash-team-dialog">
      <form className="dash-team-form" noValidate onSubmit={(event) => { void submit(event); }}>
        <p className="dash-team-scope-note">This creates an account immediately; it does not send an invitation. The new account is assigned to this location.</p>
        <div className="dash-team-form__grid">
          <label className="field"><span>Name</span><input autoComplete="name" required value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label className="field"><span>Email</span><input autoComplete="email" type="email" required value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="field"><span>Role</span><select value={draft.role} onChange={(event) => updateRole(event.target.value)}><option value="manager">{getTeamRoleLabel("manager")}</option><option value="store">{getTeamRoleLabel("store")}</option></select></label>
          <label className="field"><span>Temporary password</span><input autoComplete="new-password" type="password" minLength={8} maxLength={128} required value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} /><small>At least 8 characters.</small></label>
        </div>
        {validationError || error ? <p className="dash-team-form-error" role="alert">{validationError ?? error}</p> : null}
        <div className="dash-team-dialog__actions"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</button></div>
      </form>
    </DashboardDialog>
  );
}
