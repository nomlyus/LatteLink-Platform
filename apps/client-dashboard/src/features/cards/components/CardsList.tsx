"use client";

import React from "react";
import type { OperatorNewsCard } from "../../../model";

export function CardsList({
  cards,
  orderedCards = cards,
  canWrite,
  canChangeVisibility,
  pending,
  onOpen,
  onVisibilityChange,
  onMove
}: {
  cards: readonly OperatorNewsCard[];
  orderedCards?: readonly OperatorNewsCard[];
  canWrite: boolean;
  canChangeVisibility: boolean;
  pending: boolean;
  onOpen: (card: OperatorNewsCard) => void;
  onVisibilityChange: (cardId: string, visible: boolean) => void;
  onMove: (cardId: string, direction: "up" | "down") => void;
}) {
  // Reordering follows the authoritative list, not a filtered/paginated subset.
  const positions = new Map(orderedCards.map((card, index) => [card.cardId, index]));
  return <table className="dash-order-table dash-management-table dash-cards-table" aria-label="Homepage cards">
    <thead><tr><th scope="col">Card</th><th scope="col">Label</th><th scope="col">Message</th><th scope="col">Visibility</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
    <tbody>{cards.map((card) => <tr key={card.cardId} className="dash-order-table__row" tabIndex={pending ? -1 : 0}
      aria-label={`${canWrite ? "Edit" : "View"} ${card.title}`} aria-haspopup="dialog"
      onClick={() => { if (!pending) onOpen(card); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && !pending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(card); } }}>
      <td><strong title={card.title}>{card.title}</strong></td>
      <td title={card.label}>{card.label}</td>
      <td title={[card.body, card.note].filter(Boolean).join(" · ")}>{card.body}</td>
      <td><span className="dash-menu-state">{card.visible ? "Visible" : "Hidden"}</span></td>
      <td className="dash-management-table__actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <details className="dash-menu-row-actions">
          <summary aria-label={`Actions for ${card.title}`}>⋯</summary>
          <div className="dash-menu-row-actions__popover" role="group" aria-label={`${card.title} actions`}>
            <button type="button" disabled={pending} onClick={() => onOpen(card)}>{canWrite ? "Edit" : "View"}</button>
            {canWrite ? <>
              <button type="button" aria-label={`Move ${card.title} up`} disabled={pending || positions.get(card.cardId) === 0} onClick={() => onMove(card.cardId, "up")}>Move up</button>
              <button type="button" aria-label={`Move ${card.title} down`} disabled={pending || positions.get(card.cardId) === orderedCards.length - 1} onClick={() => onMove(card.cardId, "down")}>Move down</button>
            </> : null}
            {canChangeVisibility ? <button type="button" disabled={pending} aria-label={`${card.visible ? "Hide" : "Show"} ${card.title}`} onClick={() => onVisibilityChange(card.cardId, !card.visible)}>{card.visible ? "Hide" : "Show"}</button> : null}
          </div>
        </details>
      </td>
    </tr>)}</tbody>
  </table>;
}
