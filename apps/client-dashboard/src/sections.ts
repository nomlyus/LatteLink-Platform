import { isStoreOperator } from "./model";
import { state } from "./state";
import { persistSection } from "./storage";
import { getAvailableDashboardSectionsFor } from "./lib/navigation/dashboard-sections";
export { dashboardSectionLabels, getDashboardSectionLabel } from "./lib/navigation/dashboard-sections";

export { getAvailableDashboardSectionsFor } from "./lib/navigation/dashboard-sections";

export function getAvailableDashboardSections() {
  const locations = state.availableLocations.length > 0
    ? state.availableLocations
    : state.appConfig
      ? [{ appConfig: state.appConfig }]
      : [];
  return getAvailableDashboardSectionsFor(state.session?.operator, locations);
}

export function ensureSectionIsAvailable() {
  if (state.availableLocations.length === 0 && !state.appConfig && state.lastRefreshedAt === null) {
    return;
  }

  const availableSections = getAvailableDashboardSections();
  if (!availableSections.includes(state.section)) {
    state.section = availableSections[0] ?? (isStoreOperator(state.session?.operator ?? null) ? "orders" : "overview");
    persistSection(state.section);
  }
}
