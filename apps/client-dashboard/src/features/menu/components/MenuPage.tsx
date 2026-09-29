"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import type { AdminMenuItemCreate, AdminMenuItemUpdate, AdminModifierGroupCreate } from "@lattelink/contracts-catalog";
import type { AdminMenuCategoryCreate } from "@lattelink/contracts-catalog";
import type { OperatorMenuItem, OperatorModifierGroup, OperatorMenuResponse } from "../../../model";
import { canCreateMenuItems, canToggleMenuItemVisibility } from "../../../model";
import { filterMenuItems, getModifierGroupUsage, getUniqueMenuItems } from "../../../menu-page-model";
import { buildMenuItemUpdatePayload } from "../menu-domain";
import type { useMenuMutations } from "../use-menu-mutations";
import { useDashboardSession } from "../../auth/session-provider";
import { useDashboardLocation } from "../../location/location-provider";
import { MenuCategoriesPanel } from "./MenuCategoriesPanel";
import { MenuCategoryEditor } from "./MenuCategoryEditor";
import { MenuItemCreateDialog } from "./MenuItemCreateDialog";
import { MenuItemEditor } from "./MenuItemEditor";
import { MenuItemsPanel } from "./MenuItemsPanel";
import { ModifierGroupEditor } from "./ModifierGroupEditor";
import { ModifierGroupsPanel } from "./ModifierGroupsPanel";

type MenuTab = "items" | "categories" | "modifier-groups";
type MenuDialogState = { kind: "create-item" } | { kind: "item"; id: string } | { kind: "create-category" } | { kind: "category"; id: string } | { kind: "create-group" } | { kind: "group"; id: string };

export function MenuPage({
  menu,
  loadStatus,
  loadError,
  selectedLocationId,
  scopeKey,
  externalSync,
  mutations,
  onRetry
}: {
  menu: OperatorMenuResponse | null;
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;
  selectedLocationId: string | "all" | null;
  scopeKey: string;
  externalSync: boolean;
  mutations: ReturnType<typeof useMenuMutations>;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<MenuTab>("items");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "sold-out">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "visible" | "hidden">("all");
  const [modifierGroupSearch, setModifierGroupSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<MenuDialogState | null>(null);
  const { session } = useDashboardSession();
  const location = useDashboardLocation();

  useEffect(() => {
    setDialog(null);
    setPage(1);
    setCategoryFilter("all");
  }, [scopeKey]);

  const categories = menu?.categories ?? [];
  const groups = menu?.modifierGroups ?? [];
  const items = useMemo(() => getUniqueMenuItems(categories), [categories]);
  const filteredItems = useMemo(() => filterMenuItems(items, categories, groups, {
    search,
    categoryId: categoryFilter,
    availability: availabilityFilter,
    visibility: visibilityFilter
  }), [availabilityFilter, categories, categoryFilter, groups, items, search, visibilityFilter]);

  const selectedItem = dialog?.kind === "item" ? items.find((item) => item.itemId === dialog.id) ?? null : null;
  const selectedCategory = dialog?.kind === "category" ? categories.find((category) => category.categoryId === dialog.id) ?? null : null;
  const selectedGroup = dialog?.kind === "group" ? groups.find((group) => group.id === dialog.id) ?? null : null;
  const canWrite = canCreateMenuItems(session?.operator, location.selectedLocation?.appConfig);
  const canVisibility = canToggleMenuItemVisibility(session?.operator, location.selectedLocation?.appConfig);
  const itemBusyId = mutations.pendingItemId;

  function setItemFilter<K extends "search" | "category" | "availability" | "visibility">(key: K, value: string) {
    setPage(1);
    if (key === "search") setSearch(value);
    if (key === "category") setCategoryFilter(value);
    if (key === "availability" && (value === "all" || value === "available" || value === "sold-out")) setAvailabilityFilter(value);
    if (key === "visibility" && (value === "all" || value === "visible" || value === "hidden")) setVisibilityFilter(value);
  }

  function requestItemDelete(item: OperatorMenuItem) {
    if (!window.confirm(`Delete “${item.name}” from this menu? This removes the item and all of its category memberships.`)) return;
    void mutations.deleteItem(item.itemId).then((result) => {
      if (result) setDialog(null);
    });
  }

  function requestCategoryDelete(category: NonNullable<typeof selectedCategory>) {
    const orphanedCount = category.items.filter((item) => (item.categoryIds?.length ?? 1) <= 1).length;
    if (orphanedCount > 0) {
      mutations.reportError(`Move ${orphanedCount} item${orphanedCount === 1 ? "" : "s"} to another category first. Deleting this category never deletes the underlying items.`);
      return;
    }
    if (!window.confirm(`Delete “${category.title}”? This removes the category and its memberships, but does not delete the underlying items.`)) return;
    void mutations.deleteCategory(category.categoryId).then((result) => {
      if (result) setDialog(null);
    });
  }

  function requestGroupDelete(group: OperatorModifierGroup) {
    if (!window.confirm(`Delete “${group.label}”? Groups still assigned to items cannot be deleted. Remove assignments first.`)) return;
    void mutations.deleteModifierGroup(group.id).then((result) => {
      if (result) setDialog(null);
    });
  }

  async function createItem(input: AdminMenuItemCreate) {
    const created = await mutations.createItem(input);
    if (created) setDialog({ kind: "item", id: created.itemId });
    return created;
  }

  async function saveItem(item: OperatorMenuItem, payload: AdminMenuItemUpdate, imageChange?: { file?: File | null; remove?: boolean }) {
    return mutations.saveItem(item, payload, imageChange);
  }

  async function saveGroup(group: OperatorModifierGroup | null, input: AdminModifierGroupCreate) {
    if (group) return mutations.saveModifierGroup(group.id, input);
    const created = await mutations.createModifierGroup(input);
    if (created) setDialog({ kind: "group", id: created.id });
    return created;
  }

  async function createCategory(input: AdminMenuCategoryCreate) {
    const result = await mutations.createCategory(input);
    if (result) setDialog(null);
    return result;
  }

  const itemDeleteHandler = selectedItem ? requestItemDelete : () => undefined;
  return (
    <section className="dash-section dash-section--menu" aria-label="Menu management">
      <div className="dash-menu-tabs" role="tablist" aria-label="Menu management" onKeyDown={(event) => {
        const tabs: MenuTab[] = ["items", "categories", "modifier-groups"];
        const index = tabs.indexOf(tab);
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); const nextTab = tabs[next]!; setTab(nextTab); document.getElementById(`menu-tab-${nextTab}`)?.focus(); }
      }}>
        {([ ["items", "Items"], ["categories", "Categories"], ["modifier-groups", "Modifier Groups"] ] as const).map(([id, label]) => <button key={id} className={`dash-menu-tab${tab === id ? " dash-menu-tab--active" : ""}`} id={`menu-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`menu-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {externalSync ? <div className="dash-menu-readonly-note" role="status"><span>Managed by connected source</span><span>Menu changes are made in the connected system.</span></div> : selectedLocationId && selectedLocationId !== "all" && !canWrite && !canVisibility ? <div className="dash-menu-readonly-note" role="status">This menu is read only for your account.</div> : null}
      {selectedLocationId === "all" || !selectedLocationId ? <div className="dash-menu-empty" role="status"><strong>Choose one location</strong><span>Menu items, category membership, pricing, and modifier assignments are managed per location.</span></div> : loadStatus === "error" ? <div className="dash-menu-error" role="alert"><span>{loadError ?? "Unable to load this location’s menu."}</span><button className="button button--ghost" type="button" onClick={onRetry}>Try again</button></div> : null}
      {mutations.error ? <div className="dash-menu-error" role="alert">{mutations.error}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}
      {mutations.notice ? <div className="dash-menu-readonly-note" role="status">{mutations.notice}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}

      <div id="menu-panel-items" className="dash-menu-panel" role="tabpanel" aria-labelledby="menu-tab-items" hidden={tab !== "items"}>
        {selectedLocationId && selectedLocationId !== "all" && loadStatus !== "error" ? <MenuItemsPanel items={filteredItems} categories={categories} modifierGroups={groups} query={search} categoryFilter={categoryFilter} availabilityFilter={availabilityFilter} visibilityFilter={visibilityFilter} page={page} loading={loadStatus === "loading"} canWrite={canWrite} canToggleVisibility={canVisibility} pendingItemId={itemBusyId} onQueryChange={(value) => setItemFilter("search", value)} onCategoryFilterChange={(value) => setItemFilter("category", value)} onAvailabilityFilterChange={(value) => setItemFilter("availability", value)} onVisibilityFilterChange={(value) => setItemFilter("visibility", value)} onPageChange={setPage} onAddItem={() => setDialog({ kind: "create-item" })} onEdit={(item) => setDialog({ kind: "item", id: item.itemId })} onAvailabilityChange={(item, available) => void mutations.saveItem(item, buildMenuItemUpdatePayload(item, { available }))} onVisibilityChange={(item, visible) => void mutations.setItemVisibility(item.itemId, visible)} onDelete={requestItemDelete} /> : null}
      </div>
      <div id="menu-panel-categories" className="dash-menu-panel" role="tabpanel" aria-labelledby="menu-tab-categories" hidden={tab !== "categories"}>
        {selectedLocationId && selectedLocationId !== "all" && loadStatus === "loading" ? <MenuListSkeleton /> : selectedLocationId && selectedLocationId !== "all" && loadStatus !== "error" ? <MenuCategoriesPanel categories={categories} canWrite={canWrite} pending={mutations.isMutating} onCreate={() => setDialog({ kind: "create-category" })} onOpen={(category) => setDialog({ kind: "category", id: category.categoryId })} onReorder={(categoryId, direction) => { const ids = categories.map((category) => category.categoryId); const index = ids.indexOf(categoryId); const nextIndex = index + (direction === "up" ? -1 : 1); if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return; [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!]; void mutations.reorderCategories(ids); }} onDelete={requestCategoryDelete} /> : null}
      </div>
      <div id="menu-panel-modifier-groups" className="dash-menu-panel" role="tabpanel" aria-labelledby="menu-tab-modifier-groups" hidden={tab !== "modifier-groups"}>
        {selectedLocationId && selectedLocationId !== "all" && loadStatus === "loading" ? <MenuListSkeleton /> : selectedLocationId && selectedLocationId !== "all" && loadStatus !== "error" ? <ModifierGroupsPanel groups={groups} categories={categories} query={modifierGroupSearch} canWrite={canWrite} onQueryChange={setModifierGroupSearch} onCreate={() => setDialog({ kind: "create-group" })} onOpen={(group) => setDialog({ kind: "group", id: group.id })} /> : null}
      </div>

      {dialog?.kind === "create-item" ? <MenuItemCreateDialog categories={categories} canWrite={canWrite} canToggleVisibility={canVisibility} pending={mutations.isMutating} onClose={() => setDialog(null)} onCreate={createItem} /> : null}
      {dialog?.kind === "item" && selectedItem ? <MenuItemEditor item={selectedItem} categories={categories} groups={groups} canWrite={canWrite} canToggleVisibility={canVisibility} pending={mutations.isMutating} onClose={() => setDialog(null)} onSave={saveItem} onVisibilityChange={(itemId, visible) => { void mutations.setItemVisibility(itemId, visible); }} onDelete={itemDeleteHandler} onCreateModifierGroup={(input) => mutations.createModifierGroup(input)} /> : null}
      {(dialog?.kind === "create-category" || dialog?.kind === "category") ? <MenuCategoryEditor category={selectedCategory} categories={categories} canWrite={canWrite} pending={mutations.isMutating} onClose={() => setDialog(null)} onCreate={createCategory} onSave={(input, memberIds) => selectedCategory ? mutations.saveCategory(selectedCategory.categoryId, input, memberIds) : Promise.resolve(null)} onDelete={requestCategoryDelete} onReorderItem={(categoryId, itemId, direction) => void mutations.reorderCategoryItem(categoryId, itemId, direction)} /> : null}
      {(dialog?.kind === "create-group" || dialog?.kind === "group") ? <ModifierGroupEditor group={selectedGroup} canWrite={canWrite} pending={mutations.isMutating} usedBy={selectedGroup ? getModifierGroupUsage(categories).get(selectedGroup.id) ?? [] : []} onClose={() => setDialog(null)} onSave={(input) => saveGroup(selectedGroup, input)} onDelete={requestGroupDelete} onOpenItem={(item) => setDialog({ kind: "item", id: item.itemId })} /> : null}
    </section>
  );
}

function MenuListSkeleton() {
  return <div className="dash-menu-table-skeleton" aria-label="Loading menu" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <span className="dash-menu-table-skeleton__row" key={index} />)}</div>;
}
