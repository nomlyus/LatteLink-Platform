import { isOrderTrackingEnabled, isPlatformManagedMenu, isStaffDashboardEnabled } from "@lattelink/contracts-catalog";
import {
  canAccessCapability,
  isStoreOperator,
  type DashboardSection
} from "./model";
import { state } from "./state";
import { persistSection } from "./storage";

export const dashboardSectionLabels: Record<DashboardSection, string> = {
  overview: "Home",
  orders: "Orders",
  menu: "Menu",
  cards: "News cards",
  discounts: "Discounts",
  experience: "App builder",
  team: "Team",
  store: "Settings"
};

export function getDashboardSectionLabel(section: DashboardSection) {
  return dashboardSectionLabels[section];
}

export function getAvailableDashboardSections() {
  if (isStoreOperator(state.session?.operator ?? null)) {
    const locationConfigs =
      state.availableLocations.length > 0
        ? state.availableLocations.map((location) => location.appConfig)
        : state.appConfig
          ? [state.appConfig]
          : [];

    return canAccessCapability(state.session?.operator ?? null, "orders:read") &&
      locationConfigs.some((config) => isStaffDashboardEnabled(config) && isOrderTrackingEnabled(config))
      ? (["orders"] as DashboardSection[])
      : ([] as DashboardSection[]);
  }

  const sections: DashboardSection[] = ["overview"];
  const locationConfigs =
    state.availableLocations.length > 0
      ? state.availableLocations.map((location) => location.appConfig)
      : state.appConfig
        ? [state.appConfig]
        : [];

  if (
    canAccessCapability(state.session?.operator ?? null, "orders:read") &&
    locationConfigs.some((config) => isStaffDashboardEnabled(config) && isOrderTrackingEnabled(config))
  ) {
    sections.push("orders");
  }

  if (
    canAccessCapability(state.session?.operator ?? null, "menu:read") &&
    locationConfigs.some((config) => isPlatformManagedMenu(config))
  ) {
    sections.push("menu");
  }

  if (canAccessCapability(state.session?.operator ?? null, "menu:read")) {
    sections.push("cards");
  }

  if (canAccessCapability(state.session?.operator ?? null, "menu:read")) {
    sections.push("discounts");
  }

  if (canAccessCapability(state.session?.operator ?? null, "store:read")) {
    sections.push("experience");
    sections.push("store");
  }

  if (canAccessCapability(state.session?.operator ?? null, "team:read")) {
    sections.push("team");
  }

  return sections;
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
