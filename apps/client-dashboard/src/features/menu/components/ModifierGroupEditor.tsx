"use client";

import React from "react";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminModifierGroupCreate } from "@lattelink/contracts-catalog";
import type { OperatorMenuItem, OperatorModifierGroup } from "../../../model";
import { buildModifierGroupPayload, type ModifierGroupDraft, type ModifierOptionDraft } from "../menu-domain";
import { MenuDialog } from "./MenuDialog";

function createGroupDraft(group: OperatorModifierGroup | null): ModifierGroupDraft {
  return {
    label: group?.label ?? "",
    description: group?.description ?? "",
    selectionType: group?.selectionType ?? "single",
    required: group?.required ?? false,
    minSelections: String(group?.minSelections ?? 0),
    maxSelections: String(group?.maxSelections ?? 1),
    options: group?.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      priceDelta: (option.priceDeltaCents / 100).toFixed(2),
      default: option.default,
      available: option.available,
      ...(option.displayStyle ? { displayStyle: option.displayStyle } : {})
    })) ?? [{ id: "", label: "", description: "", priceDelta: "0.00", default: false, available: true }]
  };
}

export function ModifierGroupEditor({
  group,
  canWrite,
  pending,
  usedBy = [],
  nested = false,
  onClose,
  onSave,
  onDelete,
  onOpenItem
}: {
  group: OperatorModifierGroup | null;
  canWrite: boolean;
  pending: boolean;
  usedBy?: readonly OperatorMenuItem[];
  nested?: boolean;
  onClose: () => void;
  onSave: (input: AdminModifierGroupCreate) => Promise<OperatorModifierGroup | null>;
  onDelete: (group: OperatorModifierGroup) => void;
  onOpenItem: (item: OperatorMenuItem) => void;
}) {
  const [draft, setDraft] = useState(() => createGroupDraft(group));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(createGroupDraft(group));
    setError(null);
  }, [group]);

  function updateOption(index: number, patch: Partial<ModifierOptionDraft>) {
    setDraft((current) => ({ ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }));
  }

  function moveOption(index: number, direction: "up" | "down") {
    const options = [...draft.options];
    const nextIndex = index + (direction === "up" ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= options.length) return;
    [options[index], options[nextIndex]] = [options[nextIndex]!, options[index]!];
    setDraft((current) => ({ ...current, options }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    try {
      const input = buildModifierGroupPayload(draft, group, group?.sortOrder ?? 0, () => globalThis.crypto.randomUUID());
      setError(null);
      await onSave(input);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Check the modifier group details and options.");
    }
  }

  const title = group ? group.label : "Add modifier group";
  return <MenuDialog title={title} subtitle={group ? `${usedBy.length} item${usedBy.length === 1 ? "" : "s"} use this group` : "Create a reusable set of customer choices."} onClose={onClose} panelClassName={nested ? "dash-menu-modal__panel--group" : "dash-menu-modal__panel--wide"} nested={nested}>
    <div className="dash-menu-modal__body">
      {error ? <div className="dash-menu-error" role="alert">{error}</div> : null}
      <form className="dash-menu-modifier-form" onSubmit={(event) => { void submit(event); }}>
        <section className="dash-menu-editor-section">
          <h4>Group details</h4>
          <div className="dash-menu-editor-grid dash-menu-editor-grid--modifier">
            <label className="field"><span>Name</span><input value={draft.label} required disabled={!canWrite || pending} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></label>
            <label className="field"><span>Description</span><input value={draft.description} disabled={!canWrite || pending} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="field"><span>Selection type</span><select value={draft.selectionType} disabled={!canWrite || pending} onChange={(event) => { const selectionType = event.target.value === "multiple" ? "multiple" : "single"; setDraft((current) => ({ ...current, selectionType, maxSelections: selectionType === "single" ? "1" : current.maxSelections })); }}><option value="single">Single</option><option value="multiple">Multiple</option></select></label>
            <label className="dash-menu-toggle"><input type="checkbox" checked={draft.required} disabled={!canWrite || pending} onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))} /><span>Required</span></label>
            <label className="field"><span>Minimum selections</span><input type="number" min="0" step="1" value={draft.minSelections} disabled={!canWrite || pending} onChange={(event) => setDraft((current) => ({ ...current, minSelections: event.target.value }))} /></label>
            <label className="field"><span>Maximum selections</span><input type="number" min="1" step="1" value={draft.selectionType === "single" ? "1" : draft.maxSelections} disabled={!canWrite || pending || draft.selectionType === "single"} onChange={(event) => setDraft((current) => ({ ...current, maxSelections: event.target.value }))} /></label>
          </div>
          <p className="dash-menu-section-help">Single groups allow one choice. Multiple groups use the minimum and maximum you set.</p>
        </section>
        <section className="dash-menu-editor-section">
          <div className="dash-menu-section-heading"><div><h4>Options</h4><p className="dash-menu-section-help">Price changes may be positive, zero, or negative.</p></div>{canWrite ? <button className="button button--ghost" type="button" disabled={pending} onClick={() => setDraft((current) => ({ ...current, options: [...current.options, { id: "", label: "", description: "", priceDelta: "0.00", default: false, available: true }] }))}>Add option</button> : null}</div>
          <div className="dash-menu-option-list">{draft.options.map((option, index) => <div className="dash-menu-option-editor" key={option.id || `new-option-${index}`}>
            <label className="field"><span>Option</span><input value={option.label} required disabled={!canWrite || pending} onChange={(event) => updateOption(index, { label: event.target.value })} /></label>
            <label className="field"><span>Description</span><input value={option.description} disabled={!canWrite || pending} onChange={(event) => updateOption(index, { description: event.target.value })} /></label>
            <label className="field"><span>Price change</span><span className="dash-menu-price-input"><span>$</span><input type="number" step="0.01" inputMode="decimal" value={option.priceDelta} disabled={!canWrite || pending} onChange={(event) => updateOption(index, { priceDelta: event.target.value })} /></span></label>
            <div className="dash-menu-option-editor__toggles"><label className="dash-menu-toggle"><input type="checkbox" checked={option.default} disabled={!canWrite || pending} onChange={(event) => updateOption(index, { default: event.target.checked })} /><span>Default</span></label><label className="dash-menu-toggle"><input type="checkbox" checked={option.available} disabled={!canWrite || pending} onChange={(event) => updateOption(index, { available: event.target.checked })} /><span>Available</span></label></div>
            {canWrite ? <div className="dash-menu-order-controls"><button type="button" disabled={pending || index === 0} onClick={() => moveOption(index, "up")} aria-label={`Move ${option.label || "option"} up`}>Up</button><button type="button" disabled={pending || index === draft.options.length - 1} onClick={() => moveOption(index, "down")} aria-label={`Move ${option.label || "option"} down`}>Down</button><button className="dash-menu-remove-assignment" type="button" disabled={pending || draft.options.length <= 1} onClick={() => setDraft((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }))} aria-label={`Remove ${option.label || "option"}`}>Remove</button></div> : null}
          </div>)}</div>
        </section>
        {group ? <section className="dash-menu-used-by"><h4>Used by</h4>{usedBy.length ? <div className="dash-menu-used-by__items">{usedBy.map((item) => <button key={item.itemId} type="button" onClick={() => onOpenItem(item)}>{item.name}</button>)}</div> : <p className="dash-menu-section-help">Not assigned to any items.</p>}</section> : null}
        {canWrite ? <footer className="dash-menu-editor-footer">{group && !nested ? <button className="button button--ghost dash-menu-delete-action" type="button" disabled={pending} onClick={() => onDelete(group)}>Delete group</button> : <span />}<span /><button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="button button--secondary" type="submit" disabled={pending}>{pending ? "Saving…" : group ? "Save group" : "Create group"}</button></footer> : <p className="dash-menu-readonly-note">This modifier group is read only for your account.</p>}
      </form>
    </div>
  </MenuDialog>;
}
