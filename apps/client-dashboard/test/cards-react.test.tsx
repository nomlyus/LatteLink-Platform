import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperatorNewsCard } from "../src/model";
import { CardsPage } from "../src/features/cards/components/CardsPage";
import { CardEditorDialog } from "../src/features/cards/components/CardEditorDialog";
import { CardsList } from "../src/features/cards/components/CardsList";
import type { useCardMutations } from "../src/features/cards/use-card-mutations";

const cards: OperatorNewsCard[] = [
  { cardId: "spring-1", label: "SPRING", title: "Spring menu", body: "Try our new seasonal drinks.", note: "While supplies last", sortOrder: 2, visible: true },
  { cardId: "hours-1", label: "UPDATE", title: "Holiday hours", body: "We close early on Sunday.", sortOrder: 4, visible: false }
];

const noop = () => undefined;
const mutations = {
  pendingOperation: null,
  isMutating: false,
  error: null,
  notice: null,
  clearMessages: noop,
  createCard: vi.fn(async () => true),
  saveCard: vi.fn(async () => true),
  setCardVisibility: vi.fn(async () => true),
  deleteCard: vi.fn(async () => true),
  reorderCards: vi.fn(async () => true)
} as unknown as ReturnType<typeof useCardMutations>;

describe("React Cards workspace", () => {
  it("renders the location-specific list, canonical fields, order and visibility actions without exposing IDs", () => {
    const html = renderToStaticMarkup(<CardsPage cards={cards} loadStatus="ready" loadError={null} selectedLocationId="loc-a" scopeKey="operator:loc-a" canWrite canChangeVisibility mutations={mutations} onRetry={noop} />);
    expect(html).toContain('aria-label="Homepage cards"');
    expect(html).not.toContain("Manage the rotating cards");
    expect(html).toContain("Spring menu");
    expect(html).toContain("Try our new seasonal drinks.");
    expect(html).toContain("While supplies last");
    expect(html).toContain("Move Spring menu up");
    expect(html).toContain("Hide Spring menu");
    expect(html).not.toContain("spring-1");
    expect(html).toContain("Add card");
  });

  it("renders loading, empty, error, and all-locations states distinctly", () => {
    expect(renderToStaticMarkup(<CardsPage cards={null} loadStatus="loading" loadError={null} selectedLocationId="loc-a" scopeKey="a" canWrite canChangeVisibility mutations={mutations} onRetry={noop} />)).toContain("Loading homepage cards");
    expect(renderToStaticMarkup(<CardsPage cards={[]} loadStatus="ready" loadError={null} selectedLocationId="loc-a" scopeKey="a" canWrite={false} canChangeVisibility={false} mutations={mutations} onRetry={noop} />)).toContain("No homepage cards yet");
    expect(renderToStaticMarkup(<CardsPage cards={null} loadStatus="error" loadError="API unavailable" selectedLocationId="loc-a" scopeKey="a" canWrite canChangeVisibility mutations={mutations} onRetry={noop} />)).toContain("API unavailable");
    expect(renderToStaticMarkup(<CardsPage cards={[]} loadStatus="ready" loadError={null} selectedLocationId="all" scopeKey="a:all" canWrite canChangeVisibility mutations={mutations} onRetry={noop} />)).toContain("Choose one location");
  });

  it("uses 15-row pagination and searches before pagination", () => {
    const manyCards = Array.from({ length: 20 }, (_, index) => ({ ...cards[0]!, cardId: `card-${index}`, title: `Card ${index}`, sortOrder: index }));
    const props = { cards: manyCards, loadStatus: "ready" as const, loadError: null, selectedLocationId: "loc-a", scopeKey: "operator:loc-a", canWrite: true, canChangeVisibility: true, mutations, onRetry: noop };
    const html = renderToStaticMarkup(<CardsPage {...props} />);
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(15);
    expect(html).toContain("1–15 of 20");
    expect(html).toContain('aria-label="News cards pagination"');
    const filtered = renderToStaticMarkup(<CardsPage {...props} query="Card 19" />);
    expect(filtered.match(/aria-haspopup="dialog"/g)).toHaveLength(1);
    expect(filtered).toContain("Card 19");
    expect(renderToStaticMarkup(<CardsPage {...props} query="missing" />)).toContain("No cards match this search");
  });

  it("preserves full-list reorder boundaries when search hides neighboring cards", () => {
    const html = renderToStaticMarkup(<CardsList cards={[cards[1]!]} orderedCards={cards} canWrite pending={false} canChangeVisibility={false} onOpen={noop} onVisibilityChange={noop} onMove={noop} />);
    expect(html).toContain('aria-label="Move Holiday hours up"');
    expect(html).not.toContain('aria-label="Move Holiday hours up" disabled');
    expect(html).toContain('aria-label="Move Holiday hours down" disabled');
  });

  it("keeps visibility-only controls available while withholding content editing", () => {
    const html = renderToStaticMarkup(<CardsPage cards={cards} loadStatus="ready" loadError={null} selectedLocationId="loc-a" scopeKey="operator:loc-a" canWrite={false} canChangeVisibility mutations={mutations} onRetry={noop} />);
    expect(html).toContain(">View</button>");
    expect(html).toContain("Hide Spring menu");
    expect(html).not.toContain("Move Spring menu up");
    expect(html).not.toContain("+ Add card</button>");
  });

  it("renders an editable dialog with supported fields and a read-only view without mutation controls", () => {
    const editable = renderToStaticMarkup(<CardEditorDialog card={cards[0]!} nextSortOrder={5} canWrite pending={false} error={null} onClose={noop} onSave={async () => true} onDelete={async () => true} />);
    expect(editable).toContain("Label");
    expect(editable).toContain("Title");
    expect(editable).toContain("Body");
    expect(editable).toContain("Sort order");
    expect(editable).toContain("Visible in the app");
    expect(editable).toContain("Save changes");
    expect(editable).toContain("Remove");

    const readOnly = renderToStaticMarkup(<CardEditorDialog card={cards[0]!} nextSortOrder={5} canWrite={false} pending={false} error={null} onClose={noop} onSave={async () => false} />);
    expect(readOnly).toContain('disabled=""');
    expect(readOnly).not.toContain("Save changes");
    expect(readOnly).not.toContain(">Remove</button>");
  });

  it("exposes accessible ordering fallback controls for operators without relying on drag and drop", () => {
    const html = renderToStaticMarkup(<CardsList cards={cards} canWrite pending={false} canChangeVisibility={false} onOpen={noop} onVisibilityChange={noop} onMove={noop} />);
    expect(html).toContain('aria-label="Move Spring menu up"');
    expect(html).toContain('aria-label="Move Holiday hours down"');
    expect(html).toContain('disabled=""');
  });
});
