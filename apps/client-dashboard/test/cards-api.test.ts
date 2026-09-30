import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorNewsCard } from "../src/model";
import type { OperatorSession } from "../src/api";
import { fetchOperatorNewsCards, replaceOperatorNewsCards, updateOperatorNewsCardVisibility } from "../src/features/cards/cards-api";

const session = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "test-access-token"
} as OperatorSession;
const cards: OperatorNewsCard[] = [{ cardId: "spring", label: "Spring", title: "New drink", body: "Try it", sortOrder: 0, visible: true }];

afterEach(() => vi.unstubAllGlobals());

describe("Cards API boundary", () => {
  it("loads location-scoped cards with request cancellation", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ locationId: "loc-a", cards }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new AbortController();

    await fetchOperatorNewsCards(session, "loc-a", controller.signal);

    expect(fetchSpy).toHaveBeenCalledWith("https://api-dev.nomly.us/v1/admin/cards?locationId=loc-a", expect.objectContaining({ signal: controller.signal }));
  });

  it("replaces the authoritative collection and preserves the canonical payload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ locationId: "loc-a", cards }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await replaceOperatorNewsCards(session, "loc-a", cards);

    expect(fetchSpy).toHaveBeenCalledWith("https://api-dev.nomly.us/v1/admin/cards?locationId=loc-a", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ locationId: "loc-a", cards })
    }));
  });

  it("uses the capability-scoped visibility endpoint and rejects missing location scope", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...cards[0], visible: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await updateOperatorNewsCardVisibility(session, "loc-a", "spring", false);
    expect(fetchSpy).toHaveBeenCalledWith("https://api-dev.nomly.us/v1/admin/cards/spring/visibility?locationId=loc-a", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ visible: false }) }));
    expect(() => fetchOperatorNewsCards(session, null)).toThrow("Choose one location");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
