"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import type { OperatorNewsCard } from "../../../model";
import type { useCardMutations } from "../use-card-mutations";
import { getNextNewsCardSortOrder } from "../cards-domain";
import { CardEditorDialog } from "./CardEditorDialog";
import { CardsList } from "./CardsList";

type CardsMutations = ReturnType<typeof useCardMutations>;

export function CardsPage({
  cards,
  loadStatus,
  loadError,
  selectedLocationId,
  scopeKey,
  canWrite,
  canChangeVisibility,
  mutations,
  onRetry
}: {
  cards: OperatorNewsCard[] | null;
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;
  selectedLocationId: string | "all" | null;
  scopeKey: string;
  canWrite: boolean;
  canChangeVisibility: boolean;
  mutations: CardsMutations;
  onRetry: () => void;
}) {
  const [editor, setEditor] = useState<"create" | string | null>(null);
  const orderedCards = useMemo(() => cards ?? [], [cards]);
  const editingCard = typeof editor === "string" ? orderedCards.find((card) => card.cardId === editor) ?? null : null;

  useEffect(() => setEditor(null), [scopeKey]);

  async function saveCard(cardDraft: Parameters<CardsMutations["saveCard"]>[1]) {
    if (editor === "create") return mutations.createCard(cardDraft);
    if (typeof editor === "string") return mutations.saveCard(editor, cardDraft);
    return false;
  }

  async function deleteCard(cardId: string) {
    return mutations.deleteCard(cardId);
  }

  return (
    <section className="dash-section dash-section--cards" aria-label="Cards management">
      <div className="dash-cards-heading">
        <div>
          <span className="dash-cards-heading__eyebrow">Mobile app</span>
          <h1>News cards</h1>
          <p>Manage the rotating cards shown on the mobile home page.</p>
        </div>
        {canWrite && selectedLocationId !== "all" && selectedLocationId ? (
          <button className="button button--primary" type="button" onClick={() => setEditor("create")}>+ Add card</button>
        ) : null}
      </div>

      {mutations.error ? <div className="dash-cards-message dash-cards-message--error" role="alert">{mutations.error}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}
      {mutations.notice ? <div className="dash-cards-notice" role="status">{mutations.notice}<button className="button button--ghost" type="button" onClick={mutations.clearMessages}>Dismiss</button></div> : null}

      {selectedLocationId === "all" ? (
        <div className="dash-cards-message" role="status"><strong>Choose one location</strong><span>Homepage cards are managed per location because announcements can vary by store.</span></div>
      ) : !selectedLocationId ? (
        <div className="dash-cards-message" role="status"><strong>No location selected</strong><span>Select an authorized location to view its homepage cards.</span></div>
      ) : loadStatus === "loading" ? (
        <CardsLoadingState />
      ) : loadStatus === "error" ? (
        <div className="dash-cards-message dash-cards-message--error" role="alert"><span>{loadError ?? "Unable to load cards for this location."}</span><button className="button button--ghost" type="button" onClick={onRetry}>Try again</button></div>
      ) : (
        <>
          {!canWrite ? <div className="dash-cards-readonly" role="status">You can review homepage cards, but editing is disabled for this role.</div> : null}
          <div className="dash-cards-list-surface">
            {orderedCards.length ? (
              <CardsList
                cards={orderedCards}
                canWrite={canWrite}
                canChangeVisibility={canChangeVisibility}
                pending={mutations.isMutating}
                onOpen={(card) => setEditor(card.cardId)}
                onVisibilityChange={(cardId, visible) => { void mutations.setCardVisibility(cardId, visible); }}
                onMove={(cardId, direction) => { void mutations.reorderCards(cardId, direction); }}
              />
            ) : (
              <div className="dash-cards-empty">
                <strong>No homepage cards yet</strong>
                <span>Add a card to share a short update with customers in the mobile app.</span>
                {canWrite ? <button className="button button--secondary" type="button" onClick={() => setEditor("create")}>Add first card</button> : null}
              </div>
            )}
          </div>
        </>
      )}

      {editor !== null && (editor === "create" || editingCard) ? (
        <CardEditorDialog
          key={editor}
          card={editingCard}
          nextSortOrder={getNextNewsCardSortOrder(orderedCards)}
          canWrite={canWrite}
          pending={mutations.isMutating}
          error={mutations.error}
          onClose={() => setEditor(null)}
          onSave={saveCard}
          onDelete={editingCard && canWrite ? deleteCard : undefined}
        />
      ) : null}
    </section>
  );
}

function CardsLoadingState() {
  return <div className="dash-cards-list-surface" aria-label="Loading homepage cards" aria-busy="true"><div className="dash-cards-skeleton">{Array.from({ length: 4 }, (_, index) => <span className="dash-cards-skeleton__row" key={index} />)}</div></div>;
}
