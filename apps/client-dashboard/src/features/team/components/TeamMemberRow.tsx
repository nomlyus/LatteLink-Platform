import React from "react";
import type { OperatorUser } from "../../../model";
import { getAdditionalTeamLocationCount, getTeamMemberLocationNames, getTeamRoleLabel } from "../team-domain";

export function TeamMemberRow({
  member,
  availableLocations,
  canWrite,
  pending = false,
  onOpen
}: {
  member: OperatorUser;
  availableLocations: readonly { locationId: string; locationName: string }[];
  canWrite: boolean;
  pending?: boolean;
  onOpen: () => void;
}) {
  const locationNames = getTeamMemberLocationNames(member, availableLocations);
  const additionalLocationCount = getAdditionalTeamLocationCount(member, availableLocations);
  const extraLocations = Math.max(0, locationNames.length - 1) + additionalLocationCount;

  return (
    <tr className="dash-order-table__row" tabIndex={pending ? -1 : 0} aria-label={`${canWrite ? "Edit" : "View"} ${member.displayName}`} aria-haspopup="dialog"
      onClick={() => { if (!pending) onOpen(); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && !pending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}>
      <td>
        <strong title={member.displayName}>{member.displayName}</strong>
      </td>
      <td title={member.email}>{member.email}</td>
      <td><span className={`dash-team-role dash-team-role--${member.role}`}>{getTeamRoleLabel(member.role)}</span></td>
      <td>
        <span className="dash-team-locations" title={[...locationNames, ...(additionalLocationCount ? [`${additionalLocationCount} outside your available locations`] : [])].join(", ")}>
          {locationNames[0] ?? "Assigned location"}
          {extraLocations ? ` +${extraLocations}` : ""}
        </span>
      </td>
      <td><span className={`dash-team-status ${member.active ? "is-active" : "is-inactive"}`}>{member.active ? "Active" : "Inactive"}</span></td>
      <td className="dash-management-table__actions" onClick={(event) => event.stopPropagation()}>
        <button className="dash-order-table__details-button" type="button" disabled={pending} onClick={onOpen} aria-label={`${canWrite ? "Edit" : "View"} ${member.displayName}`}>
          View
        </button>
      </td>
    </tr>
  );
}
