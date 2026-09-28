import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardDestination,
  getDashboardPathOwner,
  getDashboardRouteOwner,
  isLegacyDashboardSection,
  syncLegacySectionPath
} from "../src/lib/navigation/dashboard-navigation";
afterEach(() => vi.unstubAllGlobals());

describe("dashboard route ownership compatibility", () => {
  it("keeps all unmigrated product sections on the explicit legacy host", () => {
    for (const section of ["overview", "orders", "menu", "cards", "discounts", "experience", "store", "team"] as const) {
      expect(getDashboardRouteOwner(section)).toBe("legacy");
      expect(getDashboardDestination(section)).toEqual({ ownership: "legacy", href: `/legacy/${section}` });
      expect(isLegacyDashboardSection(section)).toBe(true);
    }
  });

  it("does not treat an unknown section as a valid legacy route", () => {
    expect(isLegacyDashboardSection("not-a-section")).toBe(false);
  });

  it("marks the root as the React-owned entry while invite and legacy hosts retain compatibility ownership", () => {
    expect(getDashboardPathOwner("/")).toBe("react");
    expect(getDashboardPathOwner("/invites")).toBe("legacy");
    expect(getDashboardPathOwner("/legacy/orders")).toBe("legacy");
    expect(getDashboardPathOwner("/legacy/not-a-section")).toBe("unknown");
    expect(getDashboardPathOwner("/orders")).toBe("unknown");
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
