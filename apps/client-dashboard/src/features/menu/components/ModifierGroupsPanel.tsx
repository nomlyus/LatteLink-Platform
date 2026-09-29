"use client";

import React from "react";
import type { OperatorMenuCategory, OperatorModifierGroup } from "../../../model";
import { getModifierGroupUsage } from "../../../menu-page-model";

export function ModifierGroupsPanel({
  groups,
  categories,
  query,
  canWrite,
  onQueryChange,
  onCreate,
  onOpen
}: {
  groups: readonly OperatorModifierGroup[];
  categories: readonly OperatorMenuCategory[];
  query: string;
  canWrite: boolean;
  onQueryChange: (query: string) => void;
  onCreate: () => void;
  onOpen: (group: OperatorModifierGroup) => void;
}) {
  const usage = getModifierGroupUsage(categories);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingGroups = groups.filter((group) => !normalizedQuery || `${group.label} ${group.description} ${group.selectionType}`.toLocaleLowerCase().includes(normalizedQuery));
  return (
    <>
      <div className="dash-menu-list-toolbar"><div><h3>Modifier Groups</h3><p>Define reusable choices once, then assign them to items.</p></div><div className="dash-menu-list-toolbar__actions"><label className="field dash-menu-search"><span className="visually-hidden">Search modifier groups</span><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search groups…" /></label>{canWrite ? <button className="button button--secondary" type="button" onClick={onCreate}>Add modifier group</button> : null}</div></div>
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
