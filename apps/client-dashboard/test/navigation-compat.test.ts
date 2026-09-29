import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardDestination,
  getDashboardPathOwner,
  getDashboardRouteOwner,
  isLegacyDashboardSection,
  shouldAutoOpenOwnerOnboarding,
  syncLegacySectionPath
} from "../src/lib/navigation/dashboard-navigation";
afterEach(() => vi.unstubAllGlobals());

describe("dashboard route ownership compatibility", () => {
  it("routes migrated dashboard sections to React and keeps onboarding on its explicit legacy route", () => {
    expect(getDashboardRouteOwner("overview")).toBe("react");
    expect(getDashboardDestination("overview")).toEqual({ ownership: "react", href: "/" });
    expect(isLegacyDashboardSection("overview")).toBe(false);
    expect(getDashboardRouteOwner("orders")).toBe("react");
    expect(getDashboardDestination("orders")).toEqual({ ownership: "react", href: "/orders" });
    expect(isLegacyDashboardSection("orders")).toBe(false);
    expect(getDashboardRouteOwner("menu")).toBe("react");
    expect(getDashboardDestination("menu")).toEqual({ ownership: "react", href: "/menu" });
    expect(isLegacyDashboardSection("menu")).toBe(false);
    expect(getDashboardRouteOwner("cards")).toBe("react");
    expect(getDashboardDestination("cards")).toEqual({ ownership: "react", href: "/cards" });
    expect(isLegacyDashboardSection("cards")).toBe(false);
    expect(getDashboardRouteOwner("discounts")).toBe("react");
    expect(getDashboardDestination("discounts")).toEqual({ ownership: "react", href: "/discounts" });
    expect(isLegacyDashboardSection("discounts")).toBe(false);
    expect(getDashboardRouteOwner("team")).toBe("react");
    expect(getDashboardDestination("team")).toEqual({ ownership: "react", href: "/team" });
    expect(isLegacyDashboardSection("team")).toBe(false);

    expect(getDashboardRouteOwner("store")).toBe("react");
    expect(getDashboardDestination("store")).toEqual({ ownership: "react", href: "/settings" });
    expect(isLegacyDashboardSection("store")).toBe(false);
  });

  it("does not treat an unknown section as a valid legacy route", () => {
    expect(isLegacyDashboardSection("not-a-section")).toBe(false);
  });

  it("marks the root as the React-owned entry while invite and legacy hosts retain compatibility ownership", () => {
    expect(getDashboardPathOwner("/")).toBe("react");
    expect(getDashboardPathOwner("/orders")).toBe("react");
    expect(getDashboardPathOwner("/menu")).toBe("react");
    expect(getDashboardPathOwner("/cards")).toBe("react");
    expect(getDashboardPathOwner("/discounts")).toBe("react");
    expect(getDashboardPathOwner("/team")).toBe("react");
    expect(getDashboardPathOwner("/settings")).toBe("react");
    expect(getDashboardPathOwner("/legacy/onboarding")).toBe("legacy");
    expect(getDashboardPathOwner("/invites")).toBe("legacy");
    expect(getDashboardPathOwner("/legacy/orders")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/menu")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/cards")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/discounts")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/team")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/store")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/experience")).toBe("unknown");
    expect(isLegacyDashboardSection("experience")).toBe(false);
    expect(getDashboardPathOwner("/legacy/not-a-section")).toBe("unknown");
  });

  it("does not let automatic owner setup override an explicit legacy destination", () => {
    expect(shouldAutoOpenOwnerOnboarding("/")).toBe(true);
    expect(shouldAutoOpenOwnerOnboarding("/orders")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/legacy/orders")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/cards")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/discounts")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/legacy/store")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/legacy/onboarding")).toBe(false);
    expect(shouldAutoOpenOwnerOnboarding("/invites")).toBe(false);
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
