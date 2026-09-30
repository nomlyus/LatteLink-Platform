import React from "react";
import type { OperatorUser } from "../../../model";
import { getAdditionalTeamLocationCount, getTeamMemberLocationNames, getTeamRoleLabel } from "../team-domain";

export function TeamMemberRow({
  member,
  availableLocations,
  canWrite,
  onOpen
}: {
  member: OperatorUser;
  availableLocations: readonly { locationId: string; locationName: string }[];
  canWrite: boolean;
  onOpen: () => void;
}) {
  const locationNames = getTeamMemberLocationNames(member, availableLocations);
  const additionalLocationCount = getAdditionalTeamLocationCount(member, availableLocations);
  const visibleLocations = locationNames.slice(0, 2);

  return (
    <tr>
      <td>
        <button className="dash-team-member-link" type="button" onClick={onOpen}>
          <span className="dash-avatar">{member.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}</span>
          <span className="dash-team-member-link__copy">
            <strong>{member.displayName}</strong>
            <span>{member.email}</span>
          </span>
        </button>
      </td>
      <td><span className={`dash-team-role dash-team-role--${member.role}`}>{getTeamRoleLabel(member.role)}</span></td>
      <td>
        <span className="dash-team-locations">
          {visibleLocations.length ? visibleLocations.join(", ") : "Assigned location"}
          {locationNames.length > 2 ? ` +${locationNames.length - 2}` : ""}
          {additionalLocationCount > 0 ? ` +${additionalLocationCount}` : ""}
        </span>
      </td>
      <td><span className={`dash-team-status ${member.active ? "is-active" : "is-inactive"}`}>{member.active ? "Active" : "Inactive"}</span></td>
      <td className="dash-team-table__actions">
        <button className="button button--secondary" type="button" onClick={onOpen} aria-label={`${canWrite ? "Edit" : "View"} ${member.displayName}`}>
          {canWrite ? "Edit" : "View"}
        </button>
      </td>
    </tr>
  );
}
