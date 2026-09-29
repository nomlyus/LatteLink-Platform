import { describe, expect, it } from "vitest";
import type { OperatorNewsCard } from "../src/model";
import { buildNewsCard, getNextNewsCardSortOrder, moveNewsCard, sortNewsCards } from "../src/features/cards/cards-domain";
import { createCardsMutationGate, createCardsRequestLifecycle } from "../src/features/cards/cards-lifecycle";

const card = (cardId: string, sortOrder: number): OperatorNewsCard => ({
  cardId,
  label: `Label ${cardId}`,
  title: `Title ${cardId}`,
  body: `Body ${cardId}`,
  sortOrder,
  visible: true
});

describe("Cards domain behavior", () => {
  it("sorts deterministically and calculates the next available order", () => {
    expect(sortNewsCards([card("b", 2), card("a", 2), card("c", 7)]).map(({ cardId }) => cardId)).toEqual(["a", "b", "c"]);
    expect(getNextNewsCardSortOrder([card("a", 0), card("b", 7)])).toBe(8);
  });

  it("builds normalized canonical card values and validates required content and ordering", () => {
    expect(buildNewsCard({ label: " Spring ", title: " New drink ", body: " Details ", note: "  Limited  ", sortOrder: "4", visible: false }, "spring-1"))
      .toEqual({ cardId: "spring-1", label: "Spring", title: "New drink", body: "Details", note: "Limited", sortOrder: 4, visible: false });
    expect(() => buildNewsCard({ label: " ", title: "", body: "", note: "", sortOrder: "-1", visible: true }, "card-1")).toThrow();
  });

  it("reorders through sortable domain values without mutating its input", () => {
    const input = [card("a", 10), card("b", 20), card("c", 30)];
    const moved = moveNewsCard(input, "c", "up");
    expect(moved.map(({ cardId, sortOrder }) => [cardId, sortOrder])).toEqual([["a", 0], ["c", 1], ["b", 2]]);
    expect(input.map(({ sortOrder }) => sortOrder)).toEqual([10, 20, 30]);
    expect(moveNewsCard(input, "missing", "up")).toEqual(input);
  });
});

describe("Cards lifecycle guards", () => {
  it("aborts superseded and disposed requests and ignores their responses", () => {
    const requests = createCardsRequestLifecycle();
    const first = requests.begin();
    const second = requests.begin();
    expect(first.controller.signal.aborted).toBe(true);
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
    requests.finish(first);
    expect(requests.isCurrent(second)).toBe(true);
    requests.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(requests.isCurrent(second)).toBe(false);
  });

  it("prevents duplicate concurrent card mutations until the active mutation releases", () => {
    const mutations = createCardsMutationGate();
    expect(mutations.begin()).toBe(true);
    expect(mutations.begin()).toBe(false);
    mutations.release();
    expect(mutations.begin()).toBe(true);
    mutations.release();
  });
});
