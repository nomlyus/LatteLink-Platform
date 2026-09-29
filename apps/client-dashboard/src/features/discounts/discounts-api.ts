import {
  createDiscountCodeRequestSchema,
  discountCodeListResponseSchema,
  discountCodeSchema,
  updateDiscountCodeRequestSchema
} from "@lattelink/contracts-orders";
import { requestJson, type OperatorSession } from "../../api";
import type { OperatorDiscountCode } from "../../model";
import type { CreateDiscountCodeInput, UpdateDiscountCodeInput } from "./discounts-domain";

function requireDiscountLocationId(locationId: string | null) {
  if (!locationId || locationId === "all") {
    throw new Error("Choose one location before managing discount codes.");
  }
  return locationId;
}

export async function fetchOperatorDiscountCodes(
  session: OperatorSession,
  locationId: string | null,
  signal?: AbortSignal
): Promise<OperatorDiscountCode[]> {
  const selectedLocationId = requireDiscountLocationId(locationId);
  const response = await requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/discount-codes",
    query: { locationId: selectedLocationId },
    signal,
    schema: discountCodeListResponseSchema
  });
  return response.discountCodes;
}

export function createOperatorDiscountCode(
  session: OperatorSession,
  locationId: string | null,
  input: CreateDiscountCodeInput
) {
  const selectedLocationId = requireDiscountLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/discount-codes",
    query: { locationId: selectedLocationId },
    method: "POST",
    body: createDiscountCodeRequestSchema.parse({ locationId: selectedLocationId, ...input }),
    schema: discountCodeSchema
  });
}

export function updateOperatorDiscountCode(
  session: OperatorSession,
  locationId: string | null,
  discountCodeId: string,
  input: UpdateDiscountCodeInput
) {
  const selectedLocationId = requireDiscountLocationId(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/discount-codes/${encodeURIComponent(discountCodeId)}`,
    query: { locationId: selectedLocationId },
    method: "PATCH",
    body: updateDiscountCodeRequestSchema.parse({ locationId: selectedLocationId, ...input }),
    schema: discountCodeSchema
  });
}
