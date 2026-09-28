import type { DashboardSection } from "../../model";

export type DashboardRouteOwner = "react" | "legacy";
export type DashboardPathOwner = DashboardRouteOwner | "unknown";

const sectionOwners: Record<DashboardSection, DashboardRouteOwner> = {
  overview: "legacy",
  orders: "legacy",
  menu: "legacy",
  cards: "legacy",
  discounts: "legacy",
  experience: "legacy",
  store: "legacy",
  team: "legacy"
};

export function isDashboardSection(value: string): value is DashboardSection {
  return Object.hasOwn(sectionOwners, value);
}

export function getDashboardRouteOwner(section: DashboardSection): DashboardRouteOwner {
  return sectionOwners[section];
}

export function getDashboardDestination(section: DashboardSection) {
  const ownership = getDashboardRouteOwner(section);
  return {
    ownership,
    href: ownership === "legacy" ? `/legacy/${section}` : `/${section}`
  } as const;
}

export function isLegacyDashboardSection(value: string): value is DashboardSection {
  return isDashboardSection(value) && getDashboardRouteOwner(value) === "legacy";
}

export function getDashboardPathOwner(pathname: string): DashboardPathOwner {
  if (pathname === "/") return "react";
  if (pathname === "/invites") return "legacy";
  const legacySection = pathname.match(/^\/legacy\/([^/]+)\/?$/)?.[1];
  if (legacySection && isLegacyDashboardSection(legacySection)) return "legacy";
  const directSection = pathname.match(/^\/([^/]+)\/?$/)?.[1];
  if (directSection && isDashboardSection(directSection) && getDashboardRouteOwner(directSection) === "react") return "react";
  return "unknown";
}

export function navigateToDashboardSection(section: DashboardSection) {
  if (typeof window !== "undefined") {
    window.location.assign(getDashboardDestination(section).href);
  }
}

export function syncLegacySectionPath(section: DashboardSection) {
  if (typeof window === "undefined" || !/^\/legacy\/[^/]+\/?$/.test(window.location.pathname)) return;
  const nextPath = `/legacy/${section}${window.location.search}${window.location.hash}`;
  if (window.location.pathname !== `/legacy/${section}`) {
    window.history.replaceState(window.history.state, "", nextPath);
  }
}
