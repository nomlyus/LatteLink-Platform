"use client";

import React from "react";
import type { OperatorMenuCategory, OperatorModifierGroup } from "../../../model";
import { getModifierGroupUsage } from "../menu-domain";
import { searchModifierGroups } from "../menu-search";

export function ModifierGroupsPanel({
  groups,
  categories,
  query,
  canWrite,
  onCreate,
  onOpen
}: {
  groups: readonly OperatorModifierGroup[];
  categories: readonly OperatorMenuCategory[];
  query: string;
  canWrite: boolean;
  onCreate: () => void;
  onOpen: (group: OperatorModifierGroup) => void;
}) {
  const usage = getModifierGroupUsage(categories);
  const matchingGroups = searchModifierGroups(groups, query);
  return (
    <>
      {matchingGroups.length ? <div className="dash-menu-management-list" role="list" aria-label="Modifier groups">
        {matchingGroups.map((group) => {
          const usageCount = usage.get(group.id)?.length ?? 0;
          return <div className="dash-menu-management-row" role="listitem" key={group.id}>
            <button className="dash-menu-management-row__main" type="button" onClick={() => onOpen(group)} aria-label={`Edit ${group.label}`}>
              <span className="dash-menu-management-row__name">{group.label}</span>
              <span className="dash-menu-management-row__meta">{usageCount} item{usageCount === 1 ? "" : "s"} · {group.selectionType === "multiple" ? "Multiple selection" : "Single selection"}{group.required ? " · Required" : ""}</span>
            </button>
          </div>;
        })}
      </div> : <div className="dash-menu-empty" role="status"><strong>{groups.length ? "No groups match this search" : "No modifier groups yet"}</strong><span>{groups.length ? "Try another search." : "Create a reusable group such as size, milk, or sweetness."}</span>{canWrite && groups.length === 0 ? <button className="button button--secondary" type="button" onClick={onCreate}>Add modifier group</button> : null}</div>}
    </>
  );
}
