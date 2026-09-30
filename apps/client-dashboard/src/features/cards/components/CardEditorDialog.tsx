"use client";

import React from "react";
import { useState, type FormEvent } from "react";
import type { OperatorNewsCard } from "../../../model";
import { DashboardDialog } from "../../../components/dashboard/DashboardDialog";
import { buildNewsCard, type NewsCardDraft } from "../cards-domain";

function initialDraft(card: OperatorNewsCard | null, nextSortOrder: number): NewsCardDraft {
  return {
    label: card?.label ?? "",
    title: card?.title ?? "",
    body: card?.body ?? "",
    note: card?.note ?? "",
    sortOrder: String(card?.sortOrder ?? nextSortOrder),
    visible: card?.visible ?? true
  };
}

export function CardEditorDialog({
  card,
  nextSortOrder,
  canWrite,
  pending,
  error,
  onClose,
  onSave,
  onDelete
}: {
  card: OperatorNewsCard | null;
  nextSortOrder: number;
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: NewsCardDraft) => Promise<boolean>;
  onDelete?: (cardId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => initialDraft(card, nextSortOrder));
  const [validationError, setValidationError] = useState<string | null>(null);
  const readOnly = !canWrite;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    try {
      buildNewsCard(draft, card?.cardId ?? "draft-card");
      if (await onSave(draft)) onClose();
    } catch (saveError) {
      setValidationError(saveError instanceof Error ? saveError.message : "Check the card details and try again.");
    }
  }

  async function removeCard() {
    if (!card || !onDelete || !window.confirm("Remove this homepage card?")) return;
    if (await onDelete(card.cardId)) onClose();
  }

  return (
    <DashboardDialog
      title={card ? (readOnly ? card.title : "Edit card") : "Add a homepage card"}
      subtitle={card ? card.label : "Manage the card shown on the mobile home page."}
      panelClassName="dash-menu-modal__panel--compact dash-cards-editor-panel"
      onClose={onClose}
    >
      <div className="dash-menu-modal__body dash-cards-editor-body">
        <form className="dash-cards-editor-form" onSubmit={(event) => { void submit(event); }}>
          <div className="dash-cards-editor-grid">
            <label className="field">
              <span>Label</span>
              <input value={draft.label} required disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={draft.title} required disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="field dash-cards-editor-grid__full">
              <span>Body</span>
              <textarea value={draft.body} required rows={4} disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} />
            </label>
            <label className="field dash-cards-editor-grid__full">
              <span>Note <span className="muted-copy">Optional</span></span>
              <textarea value={draft.note} rows={2} disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} />
            </label>
            <label className="field">
              <span>Sort order</span>
              <input type="number" min="0" step="1" value={draft.sortOrder} required disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} />
            </label>
            <label className="dash-checkbox-row dash-cards-editor-visibility">
              <input type="checkbox" checked={draft.visible} disabled={readOnly || pending} onChange={(event) => setDraft((current) => ({ ...current, visible: event.target.checked }))} />
              <span>Visible in the app</span>
            </label>
          </div>
          {validationError || error ? <p className="dash-cards-form-error" role="alert">{validationError ?? error}</p> : null}
          {!readOnly ? (
            <div className="dash-cards-editor-actions">
              {card && onDelete ? <button className="button button--ghost dash-cards-editor-actions__delete" type="button" disabled={pending} onClick={() => { void removeCard(); }}>Remove</button> : null}
              <button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={pending}>{pending ? "Saving…" : card ? "Save changes" : "Create card"}</button>
            </div>
          ) : null}
        </form>
      </div>
    </DashboardDialog>
  );
}
