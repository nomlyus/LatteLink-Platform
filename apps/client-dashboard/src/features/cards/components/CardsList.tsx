"use client";

import React from "react";
import type { OperatorNewsCard } from "../../../model";

export function CardsList({
  cards,
  canWrite,
  canChangeVisibility,
  pending,
  onOpen,
  onVisibilityChange,
  onMove
}: {
  cards: readonly OperatorNewsCard[];
  canWrite: boolean;
  canChangeVisibility: boolean;
  pending: boolean;
  onOpen: (card: OperatorNewsCard) => void;
  onVisibilityChange: (cardId: string, visible: boolean) => void;
  onMove: (cardId: string, direction: "up" | "down") => void;
}) {
  return (
    <div className="dash-cards-list" aria-label="Homepage cards">
      {cards.map((card, index) => (
        <article className="dash-cards-row" key={card.cardId}>
          <div className="dash-cards-row__copy">
            <div className="dash-cards-row__meta">
              <span className="dash-cards-row__position">{index + 1}</span>
              <span className="dash-cards-row__label">{card.label}</span>
              <span className={`dash-cards-row__visibility${card.visible ? " dash-cards-row__visibility--visible" : ""}`}>
                {card.visible ? "Visible" : "Hidden"}
              </span>
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.note ? <span className="dash-cards-row__note">{card.note}</span> : null}
          </div>
          <div className="dash-cards-row__actions">
            {canWrite ? (
              <div className="dash-cards-order" aria-label={`Order for ${card.title}`}>
                <button type="button" className="dash-cards-order__button" aria-label={`Move ${card.title} up`} disabled={pending || index === 0} onClick={() => onMove(card.cardId, "up")}>↑</button>
                <button type="button" className="dash-cards-order__button" aria-label={`Move ${card.title} down`} disabled={pending || index === cards.length - 1} onClick={() => onMove(card.cardId, "down")}>↓</button>
              </div>
            ) : null}
            <button className="button button--ghost" type="button" disabled={pending} onClick={() => onOpen(card)}>{canWrite ? "Edit" : "View"}</button>
            {canChangeVisibility ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={pending}
                aria-label={`${card.visible ? "Hide" : "Show"} ${card.title}`}
                onClick={() => onVisibilityChange(card.cardId, !card.visible)}
              >
                {card.visible ? "Hide" : "Show"}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
