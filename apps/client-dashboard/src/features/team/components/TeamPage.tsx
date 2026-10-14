"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { OperatorUser } from "../../../model";
import type { useTeam } from "../use-team";
import type { useTeamMutations } from "../use-team-mutations";
import { TeamCreateDialog } from "./TeamCreateDialog";
import { TeamMemberDialog } from "./TeamMemberDialog";
import { TeamMemberRow } from "./TeamMemberRow";
import { canDeleteTeamMember, searchTeamMembers } from "../team-domain";
import { TablePagination } from "../../../components/dashboard/TablePagination";
import { paginateTableRows } from "../../../components/dashboard/table-page";

type TeamData = ReturnType<typeof useTeam>;
type TeamMutations = ReturnType<typeof useTeamMutations>;
type TeamEditor = { scopeKey: string; operatorUserId: string } | null;

export function TeamPage({
  members,
  query = "",
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
  query?: string;
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
  const [page, setPage] = useState(1);
  const currentMembers = members ?? [];
  const matchingMembers = useMemo(() => searchTeamMembers(currentMembers, locations, query), [currentMembers, locations, query]);
  const paginated = paginateTableRows(matchingMembers, page);
  useEffect(() => { setPage(1); }, [query, scopeKey]);
  const selectedMember = editor?.scopeKey === scopeKey
    ? currentMembers.find((candidate) => candidate.operatorUserId === editor.operatorUserId) ?? null
    : null;
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
    <section className="dash-section dash-section--team dash-section--management-table" aria-label="Team management" id="team-results">
      <div className="dash-management-toolbar">
        {canWrite && hasSpecificLocation ? <button className="button button--secondary dash-menu-create-button" type="button" disabled={mutations.isMutating} onClick={() => { mutations.clearMessages(); setCreateOpen(true); }}>Add team member</button> : null}
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
        <>
        <article className="dash-team-list-surface dash-management-table-surface">
          {matchingMembers.length ? (
            <table className="dash-order-table dash-management-table dash-team-compact-table" aria-label="Team members"><thead><tr><th scope="col">Operator</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Location access</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Details</span></th></tr></thead><tbody>
              {paginated.items.map((member) => <TeamMemberRow key={member.operatorUserId} member={member} availableLocations={locations} canWrite={canWrite} pending={mutations.isMutating} onOpen={() => openMember(member)} />)}
            </tbody></table>
          ) : (
            <div className="dash-team-empty" role="status"><strong>{query.trim() ? "No team members match this search" : "No operator accounts yet"}</strong><span>{query.trim() ? "Try another search." : "Add an operator account to give someone access to this location."}</span>{canWrite && !query.trim() ? <button className="button button--secondary" type="button" onClick={() => setCreateOpen(true)}>Add first team member</button> : null}</div>
          )}
        </article>
        <TablePagination label="Team pagination" {...paginated} onPage={setPage} />
        </>
      )}

      {createOpen && canWrite && hasSpecificLocation ? <TeamCreateDialog key={scopeKey} locationName={selectedLocationName} pending={mutations.isMutating} error={mutations.error} onClose={closeDialogs} onCreate={mutations.createMember} /> : null}
      {selectedMember ? <TeamMemberDialog key={`${scopeKey}:${selectedMember.operatorUserId}`} member={selectedMember} currentOperatorUserId={currentOperator.operatorUserId} locations={locations} canWrite={canWrite} canDelete={canDeleteTeamMember(currentOperator, selectedMember)} pending={mutations.isMutating} error={mutations.error} onClose={closeDialogs} onSave={mutations.updateMember} onRemove={mutations.removeMember} /> : null}
    </section>
  );
}
