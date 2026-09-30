import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardDestination,
  getDashboardPathOwner,
  onboardingPath
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
      expect(getDashboardDestination(section)).toEqual({ ownership: "react", href: path });
    }
    expect(onboardingPath).toBe("/onboarding");
  });

  it("recognizes React-owned routes and rejects the removed legacy onboarding route", () => {
    for (const path of ["/", "/orders", "/menu", "/cards", "/discounts", "/team", "/settings", "/onboarding"]) {
      expect(getDashboardPathOwner(path)).toBe("react");
    }
    expect(getDashboardPathOwner("/legacy/onboarding")).toBe("unknown");
    expect(getDashboardPathOwner("/legacy/not-a-section")).toBe("unknown");
    expect(getDashboardPathOwner("/invites")).toBe("react");
    expect(getDashboardPathOwner("/legacy/orders")).toBe("unknown");
  });
});
