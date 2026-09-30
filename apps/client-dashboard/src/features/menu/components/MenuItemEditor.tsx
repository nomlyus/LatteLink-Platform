"use client";

import React from "react";
import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminModifierGroupCreate } from "@lattelink/contracts-catalog";
import type { OperatorMenuCategory, OperatorMenuItem, OperatorModifierGroup } from "../../../model";
import { buildItemModifierGroupAssignments, buildMenuItemUpdatePayload, parseMenuPriceCents } from "../menu-domain";
import { MenuDialog } from "./MenuDialog";
import { ModifierGroupEditor } from "./ModifierGroupEditor";

type ItemDraft = {
  name: string;
  description: string;
  price: string;
  visible: boolean;
  available: boolean;
  featured: boolean;
  badgeCodes: string;
  categoryIds: string[];
  primaryCategoryId: string;
  modifierGroupIds: string[];
  imageFile: File | null;
  removeImage: boolean;
};

function createItemDraft(item: OperatorMenuItem): ItemDraft {
  const categoryIds = item.categoryIds.length ? item.categoryIds : [item.categoryId];
  return {
    name: item.name,
    description: item.description ?? "",
    price: (item.priceCents / 100).toFixed(2),
    visible: item.visible,
    available: item.available,
    featured: item.featured,
    badgeCodes: item.badgeCodes.join(", "),
    categoryIds,
    primaryCategoryId: categoryIds[0] ?? item.categoryId,
    modifierGroupIds: [...item.modifierGroupAssignments].sort((left, right) => left.sortOrder - right.sortOrder).map((assignment) => assignment.modifierGroupId),
    imageFile: null,
    removeImage: false
  };
}

export function MenuItemEditor({
  item,
  categories,
  groups,
  canWrite,
  canToggleVisibility,
  pending,
  onClose,
  onSave,
  onVisibilityChange,
  onDelete,
  onCreateModifierGroup
}: {
  item: OperatorMenuItem;
  categories: readonly OperatorMenuCategory[];
  groups: readonly OperatorModifierGroup[];
  canWrite: boolean;
  canToggleVisibility: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (item: OperatorMenuItem, payload: ReturnType<typeof buildMenuItemUpdatePayload>, imageChange: { file?: File | null; remove?: boolean }) => Promise<unknown>;
  onVisibilityChange: (itemId: string, visible: boolean) => void;
  onDelete: (item: OperatorMenuItem) => void;
  onCreateModifierGroup: (input: AdminModifierGroupCreate) => Promise<OperatorModifierGroup | null>;
}) {
  const [draft, setDraft] = useState(() => createItemDraft(item));
  const [error, setError] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => setDraft(createItemDraft(item)), [item]);
  useEffect(() => {
    if (!draft.imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(draft.imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.imageFile]);

  const assignedGroups = useMemo(() => draft.modifierGroupIds.map((id) => groups.find((group) => group.id === id)).filter((group): group is OperatorModifierGroup => Boolean(group)), [draft.modifierGroupIds, groups]);
  const assignmentsByGroupId = useMemo(() => new Map(item.modifierGroupAssignments.map((assignment) => [assignment.modifierGroupId, assignment])), [item.modifierGroupAssignments]);
  const unresolvedGroupIds = draft.modifierGroupIds.filter((id) => !groups.some((group) => group.id === id));
  const unassignedGroups = useMemo(() => {
    const assignedIds = new Set(draft.modifierGroupIds);
    const query = groupSearch.trim().toLocaleLowerCase();
    return groups.filter((group) => !assignedIds.has(group.id) && (!query || `${group.label} ${group.description} ${group.selectionType}`.toLocaleLowerCase().includes(query)));
  }, [draft.modifierGroupIds, groupSearch, groups]);

  function updateDraft<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleCategory(categoryId: string, selected: boolean) {
    setDraft((current) => {
      const nextIds = selected ? [...current.categoryIds, categoryId] : current.categoryIds.filter((id) => id !== categoryId);
      if (nextIds.length === 0) {
        setError("Every item must remain in at least one category.");
        return current;
      }
      setError(null);
      return { ...current, categoryIds: nextIds, primaryCategoryId: selected ? current.primaryCategoryId || categoryId : current.primaryCategoryId === categoryId ? nextIds[0]! : current.primaryCategoryId };
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    try {
      if (!draft.name.trim()) throw new Error("Item name is required.");
      if (!draft.categoryIds.includes(draft.primaryCategoryId)) throw new Error("Choose a primary category for this item.");
      const orderedCategoryIds = [draft.primaryCategoryId, ...draft.categoryIds.filter((id) => id !== draft.primaryCategoryId)];
      const badgeCodes = draft.badgeCodes.split(",").map((badge) => badge.trim()).filter(Boolean);
      const modifierGroupAssignments = buildItemModifierGroupAssignments(item.modifierGroupAssignments, draft.modifierGroupIds);
      const payload = buildMenuItemUpdatePayload(item, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        priceCents: parseMenuPriceCents(draft.price, "Base price"),
        visible: canToggleVisibility ? draft.visible : item.visible,
        available: draft.available,
        featured: draft.featured,
        badgeCodes,
        categoryIds: orderedCategoryIds,
        modifierGroupAssignments,
        imageUrl: draft.removeImage ? null : item.imageUrl
      });
      setError(null);
      await onSave(item, payload, { file: draft.imageFile, remove: draft.removeImage });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Check the item details and try again.");
    }
  }

  async function createModifierGroup(input: AdminModifierGroupCreate) {
    const created = await onCreateModifierGroup(input);
    if (!created) return null;
    setDraft((current) => current.modifierGroupIds.includes(created.id) ? current : { ...current, modifierGroupIds: [...current.modifierGroupIds, created.id] });
    setShowNewGroup(false);
    return created;
  }

  function moveAssignment(index: number, direction: "up" | "down") {
    const next = [...draft.modifierGroupIds];
    const destination = index + (direction === "up" ? -1 : 1);
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    updateDraft("modifierGroupIds", next);
  }

  const fieldDisabled = !canWrite || pending;
  const visibilityDisabled = !canWrite || !canToggleVisibility || pending;

  return <>
    <MenuDialog title={item.name} subtitle={item.categoryTitle} onClose={onClose}>
      <div className="dash-menu-modal__body dash-menu-editor-body">
        {error ? <div className="dash-menu-error" role="alert">{error}</div> : null}
        <form className="dash-menu-editor-form" onSubmit={(event) => { void save(event); }}>
          <section className="dash-menu-editor-section">
            <h4>General</h4>
            <div className="dash-menu-editor-grid">
              <div className="dash-menu-image-editor">
                <div className="dash-menu-image-preview">{previewUrl || item.imageUrl ? <Image src={previewUrl ?? item.imageUrl!} width={640} height={360} unoptimized alt={`${item.name} preview`} /> : <div className="dash-menu-image-preview__empty">No image</div>}</div>
                <label className="field"><span>{item.imageUrl ? "Replace image" : "Image"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={fieldDisabled} onChange={(event) => { updateDraft("imageFile", event.currentTarget.files?.[0] ?? null); updateDraft("removeImage", false); }} /></label>
                {item.imageUrl && canWrite ? <label className="dash-menu-toggle"><input type="checkbox" checked={draft.removeImage} disabled={pending} onChange={(event) => { updateDraft("removeImage", event.target.checked); if (event.target.checked) updateDraft("imageFile", null); }} /><span>Remove current image</span></label> : null}
              </div>
              <div className="dash-menu-editor-fields">
                <label className="field"><span>Name</span><input value={draft.name} maxLength={160} required disabled={fieldDisabled} onChange={(event) => updateDraft("name", event.target.value)} /></label>
                <label className="field"><span>Description</span><textarea rows={3} maxLength={2000} disabled={fieldDisabled} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} /></label>
                <label className="field"><span>Badges</span><input value={draft.badgeCodes} placeholder="New, popular" disabled={fieldDisabled} onChange={(event) => updateDraft("badgeCodes", event.target.value)} /></label>
                <label className="dash-menu-toggle"><input type="checkbox" checked={draft.featured} disabled={fieldDisabled} onChange={(event) => updateDraft("featured", event.target.checked)} /><span>Featured on the customer menu</span></label>
              </div>
            </div>
          </section>
          <section className="dash-menu-editor-section"><h4>Pricing</h4><label className="field dash-menu-price-field"><span>Base price</span><span className="dash-menu-price-input"><span>$</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} required disabled={fieldDisabled} onChange={(event) => updateDraft("price", event.target.value)} /></span></label></section>
          <section className="dash-menu-editor-section">
            <h4>Availability</h4>
            <div className="dash-menu-toggle-grid">
              <label className="dash-menu-toggle"><input type="checkbox" checked={draft.available} disabled={fieldDisabled} onChange={(event) => updateDraft("available", event.target.checked)} /><span>Available to order</span></label>
              <label className="dash-menu-toggle"><input type="checkbox" checked={draft.visible} disabled={visibilityDisabled} onChange={(event) => updateDraft("visible", event.target.checked)} /><span>Visible in customer menu</span></label>
            </div>
            {!canWrite && canToggleVisibility ? <div className="dash-menu-editor-inline-action"><span>Visibility can be changed separately.</span><button className="button button--ghost" type="button" disabled={pending} onClick={() => onVisibilityChange(item.itemId, !item.visible)}>{item.visible ? "Hide item" : "Show item"}</button></div> : null}
          </section>
          <section className="dash-menu-editor-section">
            <h4>Categories</h4>
            <p className="dash-menu-section-help">An item can appear in more than one category. Choose which category appears first on the customer menu.</p>
            <div className="dash-menu-check-list">{categories.map((category) => <label className="dash-menu-check-row" key={category.categoryId}><input type="checkbox" checked={draft.categoryIds.includes(category.categoryId)} disabled={fieldDisabled} onChange={(event) => toggleCategory(category.categoryId, event.target.checked)} /><span>{category.title}</span></label>)}</div>
            <label className="field dash-menu-primary-category"><span>Primary category</span><select value={draft.primaryCategoryId} required disabled={fieldDisabled} onChange={(event) => updateDraft("primaryCategoryId", event.target.value)}>{categories.filter((category) => draft.categoryIds.includes(category.categoryId)).map((category) => <option key={category.categoryId} value={category.categoryId}>{category.title}</option>)}</select></label>
          </section>
          <section className="dash-menu-editor-section">
            <h4>Modifier Groups</h4><p className="dash-menu-section-help">Use reusable groups. Selection rules and option prices stay with each group.</p>
            <div className="dash-menu-assignment-list">
              {assignedGroups.length ? assignedGroups.map((group, index) => {
                const assignment = assignmentsByGroupId.get(group.id);
                const required = assignment?.requiredOverride ?? group.required;
                const minSelections = assignment?.minSelectionsOverride ?? group.minSelections;
                const maxSelections = assignment?.maxSelectionsOverride ?? group.maxSelections;
                return <div className="dash-menu-assignment-row" key={group.id}><div className="dash-menu-assignment-row__name"><strong>{group.label}</strong><span>{group.selectionType === "multiple" ? `Multiple · ${minSelections}–${maxSelections}` : "Single"}{required ? " · Required" : " · Optional"}</span></div><div className="dash-menu-order-controls"><button type="button" disabled={fieldDisabled || index === 0} onClick={() => moveAssignment(index, "up")} aria-label={`Move ${group.label} up`}>Up</button><button type="button" disabled={fieldDisabled || index === assignedGroups.length - 1} onClick={() => moveAssignment(index, "down")} aria-label={`Move ${group.label} down`}>Down</button>{canWrite ? <button className="dash-menu-remove-assignment" type="button" disabled={pending} onClick={() => updateDraft("modifierGroupIds", draft.modifierGroupIds.filter((id) => id !== group.id))} aria-label={`Remove ${group.label} from ${item.name}`}>Remove</button> : null}</div></div>;
              }) : <p className="dash-menu-empty-inline">No modifier groups assigned.</p>}
              {unresolvedGroupIds.length ? <p className="dash-menu-section-help" role="status">{unresolvedGroupIds.length} assigned modifier group{unresolvedGroupIds.length === 1 ? " is" : "s are"} unavailable in the current menu response. Existing assignments will be preserved.</p> : null}
            </div>
            {canWrite ? <details className="dash-menu-group-picker"><summary>Add existing modifier group</summary><div className="dash-menu-group-picker__body"><label className="field"><span>Search groups</span><input type="search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search modifier groups…" /></label><div className="dash-menu-group-picker__options">{unassignedGroups.length ? unassignedGroups.map((group) => <div className="dash-menu-group-picker__option" key={group.id}><span><strong>{group.label}</strong><small>{group.selectionType === "multiple" ? "Multiple" : "Single"}{group.required ? " · Required" : " · Optional"}</small></span><button className="button button--ghost" type="button" onClick={() => updateDraft("modifierGroupIds", [...draft.modifierGroupIds, group.id])}>Add</button></div>) : <p className="dash-menu-empty-inline">{groups.length ? "All modifier groups are already assigned." : "Create your first reusable modifier group."}</p>}</div><button className="dash-menu-create-group-link" type="button" onClick={() => setShowNewGroup(true)}>Create new modifier group</button></div></details> : null}
          </section>
          {canWrite ? <footer className="dash-menu-editor-footer"><button className="button button--ghost dash-menu-delete-action" type="button" disabled={pending} onClick={() => onDelete(item)}>Delete item</button><span /><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Close</button><button className="button button--secondary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></footer> : <div className="dash-menu-readonly-note">This menu is read only for your account.</div>}
        </form>
      </div>
    </MenuDialog>
    {showNewGroup && canWrite ? <ModifierGroupEditor group={null} canWrite pending={pending} nested onClose={() => setShowNewGroup(false)} onSave={createModifierGroup} onDelete={() => undefined} onOpenItem={() => undefined} /> : null}
  </>;
}
