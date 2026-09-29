"use client";

import React from "react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminMenuCategoryCreate, AdminMenuCategoryUpdate } from "@lattelink/contracts-catalog";
import type { OperatorMenuCategory } from "../../../model";
import { getUniqueMenuItems } from "../../../menu-page-model";
import { MenuDialog } from "./MenuDialog";

export function MenuCategoryEditor({
  category,
  categories,
  canWrite,
  pending,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onReorderItem
}: {
  category: OperatorMenuCategory | null;
  categories: readonly OperatorMenuCategory[];
  canWrite: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: AdminMenuCategoryCreate) => Promise<unknown>;
  onSave: (input: AdminMenuCategoryUpdate, memberItemIds: readonly string[]) => Promise<unknown>;
  onDelete: (category: OperatorMenuCategory) => void;
  onReorderItem: (categoryId: string, itemId: string, direction: "up" | "down") => void;
}) {
  const allItems = useMemo(() => getUniqueMenuItems(categories), [categories]);
  const [title, setTitle] = useState(category?.title ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [visible, setVisible] = useState(category?.visible ?? true);
  const [memberIds, setMemberIds] = useState<string[]>(() => category?.items.map((item) => item.itemId) ?? []);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(category?.title ?? "");
    setDescription(category?.description ?? "");
    setVisible(category?.visible ?? true);
    setMemberIds(category?.items.map((item) => item.itemId) ?? []);
    setError(null);
  }, [category]);

  const memberSet = new Set(memberIds);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const sortedItems = [
    ...allItems.filter((item) => memberSet.has(item.itemId)),
    ...allItems.filter((item) => !memberSet.has(item.itemId)).sort((left, right) => left.name.localeCompare(right.name))
  ].filter((item) => !normalizedSearch || item.name.toLocaleLowerCase().includes(normalizedSearch));
  const orderedPrimaryItems = category?.items.filter((item) => item.categoryId === category.categoryId).sort((left, right) => left.sortOrder - right.sortOrder) ?? [];

  function toggleMembership(itemId: string, selected: boolean) {
    setMemberIds((current) => selected ? [...current, itemId] : current.filter((id) => id !== itemId));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    if (!title.trim()) {
      setError("Category name is required.");
      return;
    }
    setError(null);
    if (!category) {
      await onCreate({ title: title.trim(), description: description.trim(), visible, sortOrder: categories.length });
      return;
    }
    await onSave({ categoryId: category.categoryId, title: title.trim(), description: description.trim(), visible, sortOrder: category.sortOrder }, memberIds);
  }

  const canEdit = canWrite && !pending;
  return <MenuDialog title={category ? category.title : "Add category"} subtitle={category ? `${category.items.length} item${category.items.length === 1 ? "" : "s"} in this category` : "Create a place to organize menu items."} onClose={onClose}>
    <form className="dash-menu-modal__body dash-menu-category-editor" onSubmit={(event) => { void submit(event); }}>
      {error ? <div className="dash-menu-error" role="alert">{error}</div> : null}
      <section className="dash-menu-editor-section">
        <h4>Category details</h4>
        <div className="dash-menu-editor-fields"><label className="field"><span>Name</span><input value={title} maxLength={120} required disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Description</span><textarea rows={3} maxLength={1000} disabled={!canEdit} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="dash-menu-toggle"><input type="checkbox" checked={visible} disabled={!canEdit} onChange={(event) => setVisible(event.target.checked)} /><span>Visible to customers</span></label></div>
      </section>
      {category ? <section className="dash-menu-editor-section">
        <div className="dash-menu-section-heading"><div><h4>Items</h4><p className="dash-menu-section-help">Add items to this category or remove their membership. Removing a category membership keeps the item itself.</p></div><label className="field dash-menu-membership-search"><span className="visually-hidden">Search items</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items…" /></label></div>
        <div className="dash-menu-category-item-list">{sortedItems.map((item) => {
          const itemCategoryIds = item.categoryIds.length ? item.categoryIds : [item.categoryId];
          const isMember = memberSet.has(item.itemId);
          const isPrimary = item.categoryId === category.categoryId;
          const membershipLocked = isMember && itemCategoryIds.length <= 1;
          const orderIndex = orderedPrimaryItems.findIndex((entry) => entry.itemId === item.itemId);
          return <div className="dash-menu-category-item" key={item.itemId}>
            <label className="dash-menu-check-row" title={membershipLocked ? "Items must stay in at least one category." : undefined}><input type="checkbox" checked={isMember} disabled={!canEdit || membershipLocked} onChange={(event) => toggleMembership(item.itemId, event.target.checked)} /><span>{item.name}{isPrimary ? <small className="dash-menu-primary-note">Primary category</small> : null}</span></label>
            {isMember && isPrimary && canWrite ? <div className="dash-menu-order-controls"><button type="button" disabled={pending || orderIndex <= 0} aria-label={`Move ${item.name} up in this category`} onClick={() => onReorderItem(category.categoryId, item.itemId, "up")}>Up</button><button type="button" disabled={pending || orderIndex < 0 || orderIndex >= orderedPrimaryItems.length - 1} aria-label={`Move ${item.name} down in this category`} onClick={() => onReorderItem(category.categoryId, item.itemId, "down")}>Down</button></div> : isMember ? <span className="dash-menu-primary-note">Order follows primary category</span> : null}
          </div>;
        })}</div>
        <p className="dash-menu-section-help">Items must belong to at least one category. Reordering is available from an item’s primary category.</p>
        <p className="dash-menu-section-help dash-menu-delete-note">Deleting this category removes its memberships, not the underlying items.</p>
      </section> : null}
      {canWrite ? <footer className="dash-menu-editor-footer">{category ? <button className="button button--ghost dash-menu-delete-action" type="button" disabled={pending} onClick={() => onDelete(category)}>Delete category</button> : <span />}<span /><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="button button--secondary" type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Save category" : "Create category"}</button></footer> : <div className="dash-menu-readonly-note">This menu is read only for your account.</div>}
    </form>
  </MenuDialog>;
}
