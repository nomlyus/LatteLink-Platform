import {
  homeNewsCardSchema,
  homeNewsCardVisibilityUpdateSchema,
  homeNewsCardsResponseSchema
} from "@lattelink/contracts-catalog";
import { requestJson, type OperatorSession } from "../../api";
import type { OperatorNewsCard } from "../../model";

function requireLocationId(locationId: string | null) {
  if (!locationId) throw new Error("Choose one location before managing cards.");
  return locationId;
}

export function fetchOperatorNewsCards(session: OperatorSession, locationId: string | null, signal?: AbortSignal) {
  const selectedLocationId = requireLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/cards",
    query: { locationId: selectedLocationId },
    signal,
    schema: homeNewsCardsResponseSchema
  });
}

export function replaceOperatorNewsCards(session: OperatorSession, locationId: string | null, cards: OperatorNewsCard[]) {
  const selectedLocationId = requireLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/cards",
    query: { locationId: selectedLocationId },
    method: "PUT",
    body: homeNewsCardsResponseSchema.parse({ locationId: selectedLocationId, cards }),
    schema: homeNewsCardsResponseSchema
  });
}

export function updateOperatorNewsCardVisibility(
  session: OperatorSession,
  locationId: string | null,
  cardId: string,
  visible: boolean
) {
  const selectedLocationId = requireLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/cards/${encodeURIComponent(cardId)}/visibility`,
    query: { locationId: selectedLocationId },
    method: "PATCH",
    body: homeNewsCardVisibilityUpdateSchema.parse({ visible }),
    schema: homeNewsCardSchema
  });
}
