"use client";

import React from "react";
import { useState, type FormEvent } from "react";
import type { AdminMenuItemCreate } from "@lattelink/contracts-catalog";
import type { OperatorMenuCategory, OperatorMenuItem } from "../../../model";
import { parseMenuPriceCents } from "../menu-domain";
import { MenuDialog } from "./MenuDialog";

export function MenuItemCreateDialog({
  categories,
  canWrite,
  canToggleVisibility,
  pending,
  onClose,
  onCreate
}: {
  categories: readonly OperatorMenuCategory[];
  canWrite: boolean;
  canToggleVisibility: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: AdminMenuItemCreate) => Promise<OperatorMenuItem | null>;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.categoryId ?? "");
  const [price, setPrice] = useState("");
  const [visible, setVisible] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    try {
      if (!name.trim()) throw new Error("Item name is required.");
      if (!categoryId) throw new Error("Every item needs at least one category.");
      const input = {
        categoryId,
        categoryIds: [categoryId],
        name: name.trim(),
        description: "",
        priceCents: parseMenuPriceCents(price, "Base price"),
        badgeCodes: [],
        visible: canToggleVisibility ? visible : true,
        available,
        featured: false,
        modifierGroupAssignments: []
      } satisfies AdminMenuItemCreate;
      setError(null);
      await onCreate(input);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Check the item details and try again.");
    }
  }

  return <MenuDialog title="Add item" subtitle="Start with the basics. Add an image and modifier groups in the item editor." panelClassName="dash-menu-modal__panel--compact" onClose={onClose}>
    <form className="dash-menu-modal__body" onSubmit={(event) => { void submit(event); }}>
      {error ? <div className="dash-menu-error" role="alert">{error}</div> : null}
      {categories.length ? <>
        <label className="field"><span>Name</span><input value={name} maxLength={160} autoComplete="off" required disabled={!canWrite || pending} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field"><span>Category</span><select value={categoryId} required disabled={!canWrite || pending} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.title}</option>)}</select></label>
        <label className="field"><span>Base price</span><input type="number" min="0" step="0.01" inputMode="decimal" value={price} required disabled={!canWrite || pending} onChange={(event) => setPrice(event.target.value)} /></label>
        <div className="dash-menu-toggle-grid"><label className="dash-menu-toggle"><input type="checkbox" checked={visible} disabled={!canToggleVisibility || pending} onChange={(event) => setVisible(event.target.checked)} /><span>Visible</span></label><label className="dash-menu-toggle"><input type="checkbox" checked={available} disabled={!canWrite || pending} onChange={(event) => setAvailable(event.target.checked)} /><span>Available</span></label></div>
        <footer className="dash-menu-modal__footer"><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="button button--secondary" type="submit" disabled={!canWrite || pending}>{pending ? "Creating…" : "Create and edit"}</button></footer>
      </> : <div className="dash-menu-empty"><strong>Create a category first</strong><span>Every item needs at least one category.</span></div>}
    </form>
  </MenuDialog>;
}
