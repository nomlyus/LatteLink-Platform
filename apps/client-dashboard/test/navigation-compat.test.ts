import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardDestination,
  getDashboardPathOwner,
  getDashboardRouteOwner,
  isLegacyDashboardSection,
  onboardingPath,
  syncLegacySectionPath
} from "../src/lib/navigation/dashboard-navigation";

afterEach(() => vi.unstubAllGlobals());

describe("dashboard route ownership compatibility", () => {
  it("routes migrated dashboard sections to their React-owned destinations", () => {
    for (const [section, path] of [
      ["overview", "/"],
      ["orders", "/orders"],
      ["menu", "/menu"],
      ["cards", "/cards"],
      ["discounts", "/discounts"],
      ["team", "/team"],
      ["store", "/settings"]
    ] as const) {
      expect(getDashboardRouteOwner(section)).toBe("react");
      expect(getDashboardDestination(section)).toEqual({ ownership: "react", href: path });
      expect(isLegacyDashboardSection(section)).toBe(false);
    }
    expect(onboardingPath).toBe("/onboarding");
  });

  it("recognizes React-owned routes and rejects the removed legacy onboarding route", () => {
    for (const path of ["/", "/orders", "/menu", "/cards", "/discounts", "/team", "/settings", "/onboarding"]) {
      expect(getDashboardPathOwner(path)).toBe("react");
    }
    expect(getDashboardPathOwner("/legacy/onboarding")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/not-a-section")).toBe("unknown");
    expect(getDashboardPathOwner("/invites")).toBe("legacy");
  });

  it("keeps the temporary legacy URL aligned with SPA section navigation without adding history entries", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/legacy/orders", search: "?keep=1", hash: "#details" },
      history: { state: { next: true }, replaceState }
    });

    syncLegacySectionPath("menu");

    expect(replaceState).toHaveBeenCalledWith({ next: true }, "", "/legacy/menu?keep=1#details");
  });
});
