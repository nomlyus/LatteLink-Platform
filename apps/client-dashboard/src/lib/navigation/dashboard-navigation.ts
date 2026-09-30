import type { DashboardSection } from "./dashboard-sections";

export type DashboardPathOwner = "react" | "unknown";

export const onboardingPath = "/onboarding";

export function getDashboardDestination(section: DashboardSection) {
  const href = section === "overview"
    ? "/"
    : section === "store"
      ? "/settings"
      : `/${section}`;
  return { ownership: "react" as const, href };
}

export function getDashboardPathOwner(pathname: string): DashboardPathOwner {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return new Set(["/", "/orders", "/menu", "/cards", "/discounts", "/team", "/settings", onboardingPath, "/invites"]).has(normalized)
    ? "react"
    : "unknown";
}
