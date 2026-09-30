import { describe, expect, it } from "vitest";
import { getPostSignInPath, isLaunchEntry, safeAuthError, validateSignIn } from "../src/features/auth/auth-domain";
import type { OperatorSession } from "../src/features/auth/auth-types";

const session = (role: "owner" | "manager" | "store") => ({
  operator: { role }
}) as OperatorSession;

describe("React auth domain", () => {
  it("validates required credentials without echoing their contents", () => {
    expect(validateSignIn("  ", "unused-secret")).toBe("A work email is required.");
    expect(validateSignIn("owner@example.com", "")).toBe("A password is required.");
    expect(validateSignIn("owner@example.com", "non-empty")).toBeNull();
    expect(safeAuthError(new Error("Rejected value non-empty"), "Unable to sign in.", ["non-empty"])).toBe("Unable to sign in.");
  });

  it("preserves protected deep-link destinations while pinning store users to Orders", () => {
    expect(getPostSignInPath("/menu", session("owner"))).toBe("/menu");
    expect(getPostSignInPath("/settings", session("manager"))).toBe("/settings");
    expect(getPostSignInPath("/menu", session("store"))).toBe("/orders");
    expect(getPostSignInPath("/", session("owner"))).toBeNull();
    expect(getPostSignInPath("/legacy/orders", session("owner"))).toBeNull();
  });

  it("detects both supported launch-entry query forms", () => {
    expect(isLaunchEntry("intent=launch&keep=1")).toBe(true);
    expect(isLaunchEntry("start=app")).toBe(true);
    expect(isLaunchEntry("campaign=spring")).toBe(false);
  });
});
