import type { OperatorDashboardSnapshot } from "../../api";
import { matchesDashboardSearch } from "../../components/dashboard/search-text";

type StoreConfig = NonNullable<OperatorDashboardSnapshot["storeConfig"]>;

const searchableFields = [
  ["storeName", "Store name"], ["locationName", "Location name"], ["hours", "Hours"],
  ["taxRateBasisPoints", "Tax rate basis points"], ["pickupInstructions", "Pickup instructions"]
] as const;

export function getMatchingStoreSettings(config: StoreConfig, query: string) {
  return new Set(searchableFields.filter(([key, label]) => matchesDashboardSearch(query, [label, String(config[key])])).map(([key]) => key));
}
