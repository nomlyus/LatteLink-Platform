"use client";

import React, { useState } from "react";
import type { OperatorUser } from "../../../model";
import type { useTeam } from "../use-team";
import type { useTeamMutations } from "../use-team-mutations";
import { TeamCreateDialog } from "./TeamCreateDialog";
import { TeamMemberDialog } from "./TeamMemberDialog";
import { TeamMemberRow } from "./TeamMemberRow";
import { canDeleteTeamMember } from "../team-domain";

type TeamData = ReturnType<typeof useTeam>;
type TeamMutations = ReturnType<typeof useTeamMutations>;
type TeamEditor = { scopeKey: string; operatorUserId: string } | null;

export function TeamPage({
  members,
  loadStatus,
  loadError,
  scopeKey,
  selectedLocationId,
  selectedLocationName,
  locations,
  currentOperator,
  canWrite,
  mutations,
  onRetry
}: {
  members: TeamData["members"];
  loadStatus: TeamData["status"];
  loadError: string | null;
  scopeKey: string;
  selectedLocationId: string | "all" | null;
  selectedLocationName: string;
  locations: readonly { locationId: string; locationName: string }[];
  currentOperator: OperatorUser;
  canWrite: boolean;
  mutations: TeamMutations;
  onRetry: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editor, setEditor] = useState<TeamEditor>(null);
  const currentMembers = members ?? [];
  const selectedMember = editor?.scopeKey === scopeKey
    ? currentMembers.find((candidate) => candidate.operatorUserId === editor.operatorUserId) ?? null
    : null;
  const activeCount = currentMembers.filter((member) => member.active).length;
  const hasSpecificLocation = Boolean(selectedLocationId && selectedLocationId !== "all");

  function openMember(member: OperatorUser) {
    mutations.clearMessages();
    setEditor({ scopeKey, operatorUserId: member.operatorUserId });
  }

  function closeDialogs() {
    setCreateOpen(false);
    setEditor(null);
    mutations.clearMessages();
  }

  return (
    <section className="dash-section dash-section--team" aria-label="Team management">
      <div className="dash-team-heading">
        <div><span className="dash-team-heading__eyebrow">Operations</span><h1>Team</h1><p>Manage operator accounts and access for each location.</p></div>
        {canWrite && hasSpecificLocation ? <button className="button button--primary" type="button" onClick={() => { mutations.clearMessages(); setCreateOpen(true); }}>+ Add team member</button> : null}
      </div>

      {mutations.error ? <div className="dash-team-message dash-team-message--error" role="alert">{mutations.error}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}
      {mutations.notice ? <div className="dash-team-message" role="status">{mutations.notice}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}

      {!canWrite ? <div className="dash-team-readonly" role="status">You can view team access, but only operators with team-write permission can make changes.</div> : null}

      {selectedLocationId === "all" ? (
        <div className="dash-team-state" role="status"><strong>Choose one location</strong><span>Team accounts are managed one location at a time. Select a location from the dashboard header.</span></div>
      ) : !selectedLocationId ? (
        <div className="dash-team-state" role="status"><strong>No location selected</strong><span>Select an authorized location to review its operator accounts.</span></div>
      ) : loadStatus === "loading" ? (
        <div className="dash-team-list-surface" aria-label="Loading team members" aria-busy="true"><div className="dash-team-skeleton"><span /><span /><span /><span /></div></div>
      ) : loadStatus === "error" ? (
        <div className="dash-team-state dash-team-state--error" role="alert"><span>{loadError ?? "Unable to load team members for this location."}</span><button className="button button--ghost" type="button" onClick={onRetry}>Try again</button></div>
      ) : (
        <article className="dash-team-list-surface">
          <header className="dash-team-list-header"><div><h2>{activeCount} active {activeCount === 1 ? "account" : "accounts"}</h2><p>Showing accounts with access to {selectedLocationName}.</p></div><button className="button button--secondary" type="button" disabled={mutations.isMutating} onClick={onRetry}>Refresh</button></header>
          <p className="dash-team-scope-note">New accounts are assigned to this location. Profile, role, password, and active-state changes apply to the account wherever it has access; location access itself cannot be changed here.</p>
          {currentMembers.length ? (
            <div className="dash-team-table-wrap"><table className="dash-team-table"><thead><tr><th scope="col">OPERATOR</th><th scope="col">ROLE</th><th scope="col">LOCATION ACCESS</th><th scope="col">STATUS</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
              {currentMembers.map((member) => <TeamMemberRow key={member.operatorUserId} member={member} availableLocations={locations} canWrite={canWrite} onOpen={() => openMember(member)} />)}
            </tbody></table></div>
          ) : (
            <div className="dash-team-empty" role="status"><strong>No operator accounts yet</strong><span>Add an operator account to give someone access to this location.</span>{canWrite ? <button className="button button--secondary" type="button" onClick={() => setCreateOpen(true)}>Add first team member</button> : null}</div>
          )}
        </article>
      )}

      {createOpen && canWrite && hasSpecificLocation ? <TeamCreateDialog key={scopeKey} locationName={selectedLocationName} pending={mutations.isMutating} error={mutations.error} onClose={closeDialogs} onCreate={mutations.createMember} /> : null}
      {selectedMember ? <TeamMemberDialog key={`${scopeKey}:${selectedMember.operatorUserId}`} member={selectedMember} currentOperatorUserId={currentOperator.operatorUserId} locations={locations} canWrite={canWrite} canDelete={canDeleteTeamMember(currentOperator, selectedMember)} pending={mutations.isMutating} error={mutations.error} onClose={closeDialogs} onSave={mutations.updateMember} onRemove={mutations.removeMember} /> : null}
    </section>
  );
}
