import { adminStoreConfigSchema } from "@lattelink/contracts-catalog";
import { requestJson, type OperatorSession } from "../../api";
import { normalizeStoreSettingsForm } from "./store-settings-domain";

function requireStoreLocation(locationId: string | "all" | null) {
  if (!locationId || locationId === "all") {
    throw new Error("Choose one location before updating store settings.");
  }
  return locationId;
}

export function updateOperatorStoreConfig(
  session: OperatorSession,
  locationId: string | "all" | null,
  input: unknown
) {
  const selectedLocationId = requireStoreLocation(locationId);
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/store/config",
    query: { locationId: selectedLocationId },
    method: "PUT",
    body: normalizeStoreSettingsForm(input),
    schema: adminStoreConfigSchema
  });
}
