import { isOrderTrackingEnabled, isPlatformManagedMenu, isStaffDashboardEnabled } from "@lattelink/contracts-catalog";
import { canAccessCapability, isStoreOperator, type DashboardSection, type OperatorUser } from "../../model";

export const dashboardSectionLabels: Record<DashboardSection, string> = {
  overview: "Home",
  orders: "Orders",
  menu: "Menu",
  cards: "News cards",
  discounts: "Discounts",
  team: "Team",
  store: "Settings"
};

export const dashboardSectionIcons: Record<DashboardSection, string> = {
  overview: "/icons/operator-v3/home.svg",
  orders: "/icons/operator-v3/orders.svg",
  menu: "/icons/operator-v3/menu.svg",
  cards: "/icons/operator-v3/marketing.svg",
  discounts: "/icons/operator-v3/analytics.svg",
  store: "/icons/operator-v3/stores.svg",
  team: "/icons/operator-v3/customers.svg"
};

export function getDashboardSectionLabel(section: DashboardSection) {
  return dashboardSectionLabels[section];
}

export function getDashboardSectionIcon(section: DashboardSection) {
  return dashboardSectionIcons[section];
}

export function getAvailableDashboardSectionsFor(
  operator: Pick<OperatorUser, "capabilities" | "role"> | null | undefined,
  locations: readonly { appConfig: Parameters<typeof isStaffDashboardEnabled>[0] }[]
) {
  if (isStoreOperator(operator)) {
    return canAccessCapability(operator, "orders:read") &&
      locations.some(({ appConfig }) => isStaffDashboardEnabled(appConfig) && isOrderTrackingEnabled(appConfig))
      ? (["orders"] as DashboardSection[])
      : ([] as DashboardSection[]);
  }

  const sections: DashboardSection[] = ["overview"];
  if (
    canAccessCapability(operator, "orders:read") &&
    locations.some(({ appConfig }) => isStaffDashboardEnabled(appConfig) && isOrderTrackingEnabled(appConfig))
  ) sections.push("orders");
  if (canAccessCapability(operator, "menu:read") && locations.some(({ appConfig }) => isPlatformManagedMenu(appConfig))) {
    sections.push("menu");
  }
  if (canAccessCapability(operator, "menu:read")) sections.push("cards", "discounts");
  if (canAccessCapability(operator, "store:read")) sections.push("store");
  if (canAccessCapability(operator, "team:read")) sections.push("team");
  return sections;
}
