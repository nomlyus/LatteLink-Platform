"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { OperatorDiscountCode } from "../../../model";
import type { useDiscountMutations } from "../use-discount-mutations";
import { filterDiscountCodes } from "../discounts-domain";
import { paginateTableRows } from "../../../components/dashboard/table-page";
import { TablePagination } from "../../../components/dashboard/TablePagination";
import type { CreateDiscountCodeInput, UpdateDiscountCodeInput } from "../discounts-domain";
import { DiscountEditorDialog } from "./DiscountEditorDialog";
import { DiscountsList } from "./DiscountsList";

type DiscountsMutations = ReturnType<typeof useDiscountMutations>;
type EditorSelection = { scopeKey: string; discountCodeId: string | null };

export function DiscountsPage({
  discountCodes,
  query = "",
  loadStatus,
  loadError,
  selectedLocationId,
  scopeKey,
  canWrite,
  mutations,
  onRetry
}: {
  discountCodes: OperatorDiscountCode[] | null;
  query?: string;
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;
  selectedLocationId: string | "all" | null;
  scopeKey: string;
  canWrite: boolean;
  mutations: DiscountsMutations;
  onRetry: () => void;
}) {
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const allDiscountCodes = discountCodes ?? [];
  const visibleCodes = useMemo(
    () => filterDiscountCodes(allDiscountCodes, query, "all", nowMs),
    [allDiscountCodes, nowMs, query]
  );
  const paginated = paginateTableRows(visibleCodes, page);
  useEffect(() => { setPage(1); }, [query, scopeKey]);
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

  const hasSpecificLocation = Boolean(selectedLocationId && selectedLocationId !== "all");

  return (
    <section className="dash-section dash-section--discounts dash-section--management-table" aria-label="Discount code management" id="discounts-results">
      <div className="dash-management-toolbar">
        {canWrite && hasSpecificLocation ? (
          <button className="button button--secondary dash-menu-create-button" type="button" disabled={mutations.isMutating} onClick={() => openEditor(null)}>Create code</button>
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
          <article className="dash-discounts-list-surface dash-management-table-surface">
            {visibleCodes.length ? (
              <DiscountsList
                discountCodes={paginated.items}
                canWrite={canWrite}
                pending={mutations.isMutating}
                nowMs={nowMs}
                onOpen={(discountCode) => openEditor(discountCode.discountCodeId)}
              />
            ) : (
              <div className="dash-discounts-empty" role="status">
                <strong>{query.trim() ? "No codes match this search" : "No discount codes yet"}</strong>
                <span>{query.trim() ? "Try another search." : "Create a code to offer customers a checkout discount."}</span>
                {!allDiscountCodes.length && canWrite && !query.trim() ? <button className="button button--secondary" type="button" onClick={() => openEditor(null)}>Create first code</button> : null}
              </div>
            )}
          </article>
          <TablePagination label="Discounts pagination" {...paginated} onPage={setPage} />
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
