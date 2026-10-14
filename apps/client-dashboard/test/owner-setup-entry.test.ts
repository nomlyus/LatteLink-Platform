import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";
vi.mock("../src/features/onboarding/onboarding-api", () => ({ fetchOperatorOnboardingSummary: vi.fn() }));
import { fetchOperatorOnboardingSummary } from "../src/features/onboarding/onboarding-api";
import { resolveOwnerSetupSignInDestination } from "../src/features/onboarding/owner-setup-entry";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";
const session = { operator: { role: "owner", locationId: "location" } } as OperatorSession;
const summary = onboardingSummarySchema.parse({ tenantId: "tenant", brandId: "brand", brandName: "Coffee", locationId: "location", locationName: "Main", marketLabel: "Test", status: "draft", readyForReview: false, ownerSetupRequired: true, checklist: [] });
beforeEach(() => { vi.clearAllMocks(); });
describe("first sign-in setup entry", () => {
  it("routes a new owner to the first-time modal even when signing in through a deep link", async () => {
    vi.mocked(fetchOperatorOnboardingSummary).mockResolvedValue(summary);
    expect(await resolveOwnerSetupSignInDestination(session, "/menu")).toBe("/");
  });
  it("preserves an existing owner's deep link after permanent completion", async () => {
    vi.mocked(fetchOperatorOnboardingSummary).mockResolvedValue({ ...summary, ownerSetupRequired: false });
    expect(await resolveOwnerSetupSignInDestination(session, "/settings")).toBe("/settings");
  });
  it("does not fetch store configuration for managers or store users", async () => {
    for (const role of ["manager", "store"] as const) expect(await resolveOwnerSetupSignInDestination({ ...session, operator: { ...session.operator, role } }, "/orders")).toBe("/orders");
    expect(fetchOperatorOnboardingSummary).not.toHaveBeenCalled();
  });
  it("keeps successful authentication separate from a failed setup lookup", async () => {
    vi.mocked(fetchOperatorOnboardingSummary).mockRejectedValue(new Error("Unavailable"));
    expect(await resolveOwnerSetupSignInDestination(session, "/menu")).toBe("/");
  });
  it("ignores a disposed sign-in lookup", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetchOperatorOnboardingSummary).mockRejectedValue(new Error("Aborted"));
    await expect(resolveOwnerSetupSignInDestination(session, "/menu", controller.signal)).rejects.toThrow("Aborted");
  });
});
