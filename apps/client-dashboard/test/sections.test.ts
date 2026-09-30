import { describe, expect, it } from "vitest";
import { getAvailableDashboardSectionsFor } from "../src/lib/navigation/dashboard-sections";
import type { OperatorSession } from "../src/api";

const owner: OperatorSession["operator"] = {
  operatorUserId: "11111111-1111-4111-8111-111111111111",
  displayName: "Pilot Owner",
  email: "owner@example.com",
  role: "owner",
  locationId: "location-a",
  locationIds: ["location-a"],
  active: true,
  capabilities: ["store:read", "store:write", "team:read"],
  createdAt: "2026-05-06T12:00:00.000Z",
  updatedAt: "2026-05-06T12:00:00.000Z"
};

describe("React dashboard navigation permissions", () => {
  it("keeps launch readiness out of legacy section navigation", () => {
    const sections = getAvailableDashboardSectionsFor(owner, []);
    expect(sections).toContain("store");
    expect(sections).toContain("team");
    expect(sections).not.toContain("onboarding");
  });

  it("keeps store operators pinned to Orders rather than exposing setup sections", () => {
    const storeOperator: OperatorSession["operator"] = { ...owner, role: "store", capabilities: ["orders:read"] };
    const sections = getAvailableDashboardSectionsFor(storeOperator, [{ appConfig: null }]);
    expect(sections).not.toContain("store");
    expect(sections).not.toContain("onboarding");
  });
});
