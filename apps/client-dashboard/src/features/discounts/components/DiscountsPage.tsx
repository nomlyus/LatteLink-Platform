"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { OperatorDiscountCode } from "../../../model";
import type { useDiscountMutations } from "../use-discount-mutations";
import { filterDiscountCodes, type DiscountCodeStatusFilter } from "../discounts-domain";
import type { CreateDiscountCodeInput, UpdateDiscountCodeInput } from "../discounts-domain";
import { DiscountEditorDialog } from "./DiscountEditorDialog";
import { DiscountsList } from "./DiscountsList";

type DiscountsMutations = ReturnType<typeof useDiscountMutations>;
type EditorSelection = { scopeKey: string; discountCodeId: string | null };

const statusOptions: Array<{ value: DiscountCodeStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "upcoming", label: "Upcoming" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Limit reached" }
];

export function DiscountsPage({
  discountCodes,
  loadStatus,
  loadError,
  selectedLocationId,
  scopeKey,
  canWrite,
  mutations,
  onRetry
}: {
  discountCodes: OperatorDiscountCode[] | null;
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;
  selectedLocationId: string | "all" | null;
  scopeKey: string;
  canWrite: boolean;
  mutations: DiscountsMutations;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DiscountCodeStatusFilter>("all");
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const allDiscountCodes = discountCodes ?? [];
  const visibleCodes = useMemo(
    () => filterDiscountCodes(allDiscountCodes, search, statusFilter, nowMs),
    [allDiscountCodes, nowMs, search, statusFilter]
  );
  const editorCodeId = editor?.scopeKey === scopeKey ? editor.discountCodeId : undefined;
  const editingCode = typeof editorCodeId === "string"
    ? allDiscountCodes.find((discountCode) => discountCode.discountCodeId === editorCodeId) ?? null
    : null;
  const isCreating = editorCodeId === null;
  const showEditor = isCreating || (typeof editorCodeId === "string" && editingCode !== null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function openEditor(discountCodeId: string | null) {
    mutations.clearMessages();
    setEditor({ scopeKey, discountCodeId });
  }

  function closeEditor() {
    setEditor(null);
    mutations.clearMessages();
  }

  async function createDiscount(input: CreateDiscountCodeInput) {
    return mutations.createDiscountCode(input);
  }

  async function updateDiscount(inputDiscountCodeId: string, input: UpdateDiscountCodeInput) {
    return mutations.updateDiscountCode(inputDiscountCodeId, input);
  }

  function updateStatusFilter(value: string) {
    const option = statusOptions.find((candidate) => candidate.value === value);
    if (option) setStatusFilter(option.value);
  }

  const hasSpecificLocation = Boolean(selectedLocationId && selectedLocationId !== "all");

  return (
    <section className="dash-section dash-section--discounts" aria-label="Discount code management">
      <div className="dash-discounts-heading">
        <div>
          <span className="dash-discounts-heading__eyebrow">Promotions</span>
          <h1>Discount codes</h1>
          <p>Create checkout codes with redemption caps, customer eligibility, and active windows.</p>
        </div>
        {canWrite && hasSpecificLocation ? (
          <button className="button button--primary" type="button" onClick={() => openEditor(null)}>+ Create code</button>
        ) : null}
      </div>

      {mutations.error ? <div className="dash-discounts-message dash-discounts-message--error" role="alert">{mutations.error}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}
      {mutations.notice ? <div className="dash-discounts-message" role="status">{mutations.notice}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}

      {selectedLocationId === "all" ? (
        <div className="dash-discounts-state" role="status"><strong>Choose one location</strong><span>Discount codes are scoped to a single location and cannot be managed in All Locations.</span></div>
      ) : !selectedLocationId ? (
        <div className="dash-discounts-state" role="status"><strong>No location selected</strong><span>Select an authorized location to view its discount codes.</span></div>
      ) : loadStatus === "loading" ? (
        <div className="dash-discounts-list-surface" aria-label="Loading discount codes" aria-busy="true"><div className="dash-discounts-skeleton"><span /><span /><span /></div></div>
      ) : loadStatus === "error" ? (
        <div className="dash-discounts-state dash-discounts-state--error" role="alert"><span>{loadError ?? "Unable to load discount codes for this location."}</span><button className="button button--ghost" type="button" onClick={onRetry}>Try again</button></div>
      ) : (
        <>
          {!canWrite ? <div className="dash-discounts-readonly" role="status">You can review discount codes, but editing is disabled for your role.</div> : null}
          <article className="dash-discounts-list-surface">
            <div className="dash-discounts-toolbar">
              <label className="field dash-discounts-search" htmlFor="discount-code-search">
                <span>Search codes</span>
                <input id="discount-code-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code or name" />
              </label>
              <label className="field dash-discounts-status-filter" htmlFor="discount-code-status-filter">
                <span>Status</span>
                <select id="discount-code-status-filter" value={statusFilter} onChange={(event) => updateStatusFilter(event.target.value)}>
                  {statusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button className="button button--secondary" type="button" disabled={mutations.isMutating} onClick={onRetry}>Refresh</button>
            </div>
            <div className="dash-discounts-list-header">
              <h2>{search || statusFilter !== "all" ? `${visibleCodes.length} of ${allDiscountCodes.length} codes` : `${allDiscountCodes.length} configured codes`}</h2>
              <p>Reserved codes are held by unpaid checkout attempts and released if payment fails or the order is canceled.</p>
            </div>
            {visibleCodes.length ? (
              <DiscountsList
                discountCodes={visibleCodes}
                canWrite={canWrite}
                pending={mutations.isMutating}
                nowMs={nowMs}
                onOpen={(discountCode) => openEditor(discountCode.discountCodeId)}
              />
            ) : (
              <div className="dash-discounts-empty" role="status">
                <strong>{allDiscountCodes.length ? "No codes match these filters" : "No discount codes yet"}</strong>
                <span>{allDiscountCodes.length ? "Try a different search or status." : "Create a code to offer customers a checkout discount."}</span>
                {!allDiscountCodes.length && canWrite ? <button className="button button--secondary" type="button" onClick={() => openEditor(null)}>Create first code</button> : null}
              </div>
            )}
          </article>
        </>
      )}

      {showEditor ? (
        <DiscountEditorDialog
          key={editingCode?.discountCodeId ?? "new-discount-code"}
          discountCode={editingCode}
          canWrite={canWrite}
          pending={mutations.isMutating}
          error={mutations.error}
          onClose={closeEditor}
          onCreate={createDiscount}
          onUpdate={updateDiscount}
        />
      ) : null}
    </section>
  );
}
