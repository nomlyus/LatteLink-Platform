import { describe, expect, it } from "vitest";
import { resolveDashboardEntryPlan, stripLaunchEntryParams } from "../src/lib/navigation/dashboard-entry";

const owner = { role: "owner" } as const;
const manager = { role: "manager" } as const;
const store = { role: "store" } as const;

describe("React dashboard root ownership", () => {
  it("assigns signed-out users to the React-owned sign-in experience", () => {
    expect(resolveDashboardEntryPlan("signed-out", null, "?campaign=spring")).toEqual({ kind: "auth" });
  });

  it("preserves the Google callback for the React auth handler", () => {
    expect(resolveDashboardEntryPlan("signed-out", null, "?google_auth_callback=1&state=abc")).toEqual({ kind: "google-callback" });
  });

  it("holds the React-owned root while the existing session is being restored", () => {
    expect(resolveDashboardEntryPlan("loading", null, "")).toEqual({ kind: "loading" });
    expect(resolveDashboardEntryPlan("signed-out", null, "")).toEqual({ kind: "auth" });
  });

  it("routes Stripe return query parameters to React Onboarding", () => {
    expect(resolveDashboardEntryPlan("authenticated", owner, "?stripeReturn=1&session_id=cs_test&keep=1")).toEqual({
      kind: "redirect",
      href: "/onboarding?stripeReturn=1&session_id=cs_test&keep=1"
    });
  });

  it("retains store-user Orders landing and unrelated query parameters", () => {
    expect(resolveDashboardEntryPlan("authenticated", store, "?source=tablet")).toEqual({
      kind: "redirect",
      href: "/orders?source=tablet"
    });
  });

  it("routes owner app-launch behavior to React Onboarding", () => {
    expect(resolveDashboardEntryPlan("authenticated", owner, "?intent=launch&keep=1")).toEqual({
      kind: "redirect",
      href: "/onboarding?intent=launch&keep=1"
    });
  });

  it("shows the established owner-only launch notice to a non-owner and strips only launch parameters", () => {
    expect(resolveDashboardEntryPlan("authenticated", manager, "?start=app&keep=1")).toEqual({
      kind: "dashboard",
      launchNotice: "Sign in to create and launch your branded app.",
      stripLaunchParams: true
    });
    expect(stripLaunchEntryParams("/", "?start=app&keep=1", "#home")).toBe("/?keep=1#home");
  });

  it("leaves ordinary authenticated entry and unrelated query values on Home", () => {
    expect(resolveDashboardEntryPlan("authenticated", owner, "?utm_source=direct")).toEqual({
      kind: "dashboard",
      launchNotice: null,
      stripLaunchParams: false
    });
  });

  it("shows the completion notice after onboarding returns the owner to Home", () => {
    expect(resolveDashboardEntryPlan("authenticated", owner, "?launchComplete=1&keep=1")).toEqual({
      kind: "dashboard",
      launchNotice: "Your workspace is ready.",
      stripLaunchParams: true
    });
    expect(stripLaunchEntryParams("/", "?launchComplete=1&keep=1", "#home")).toBe("/?keep=1#home");
  });
});
