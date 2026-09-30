import {
  homeNewsCardSchema,
  type HomeNewsCard
} from "@lattelink/contracts-catalog";
import type { OperatorNewsCard } from "../../model";

export type NewsCardDraft = {
  label: string;
  title: string;
  body: string;
  note: string;
  sortOrder: string;
  visible: boolean;
};

export function sortNewsCards(cards: readonly OperatorNewsCard[]) {
  return [...cards].sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
}

export function getNextNewsCardSortOrder(cards: readonly OperatorNewsCard[]) {
  return cards.reduce((highest, card) => Math.max(highest, card.sortOrder), -1) + 1;
}

export function createNewsCardId(title: string, suffix = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 8)) {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "card"}-${suffix}`;
}

export function buildNewsCard(draft: NewsCardDraft, cardId: string): HomeNewsCard {
  const sortOrder = Number(draft.sortOrder);
  return homeNewsCardSchema.parse({
    cardId,
    label: draft.label.trim(),
    title: draft.title.trim(),
    body: draft.body.trim(),
    note: draft.note.trim() || undefined,
    sortOrder,
    visible: draft.visible
  });
}

export function moveNewsCard(
  cards: readonly OperatorNewsCard[],
  cardId: string,
  direction: "up" | "down"
) {
  const ordered = sortNewsCards(cards);
  const index = ordered.findIndex((card) => card.cardId === cardId);
  const nextIndex = index + (direction === "up" ? -1 : 1);
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return ordered;
  [ordered[index], ordered[nextIndex]] = [ordered[nextIndex]!, ordered[index]!];
  return ordered.map((card, sortOrder) => ({ ...card, sortOrder }));
}
