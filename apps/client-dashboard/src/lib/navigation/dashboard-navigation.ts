import type { DashboardSection } from "../../model";

export type DashboardRouteOwner = "react" | "legacy";
export type DashboardPathOwner = DashboardRouteOwner | "unknown";

const sectionOwners: Record<DashboardSection, DashboardRouteOwner> = {
  overview: "react",
  orders: "react",
  menu: "react",
  cards: "react",
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
  return { ownership, href: section === "overview" ? "/" : ownership === "react" ? `/${section}` : `/legacy/${section}` } as const;
}

export function isLegacyDashboardSection(value: string): value is DashboardSection {
  return isDashboardSection(value) && getDashboardRouteOwner(value) === "legacy";
}

export function getDashboardPathOwner(pathname: string): DashboardPathOwner {
  if (pathname === "/") return "react";
  if (pathname === "/invites") return "legacy";
  if (["/orders", "/orders/", "/menu", "/menu/", "/cards", "/cards/"].includes(pathname)) return "react";
  const legacySection = pathname.match(/^\/legacy\/([^/]+)\/?$/)?.[1];
  if (legacySection && isLegacyDashboardSection(legacySection)) return "legacy";
  return "unknown";
}

export function shouldAutoOpenOwnerOnboarding(pathname: string) {
  return pathname === "/";
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
