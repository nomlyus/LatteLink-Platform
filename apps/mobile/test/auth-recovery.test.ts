import { describe, expect, it } from "vitest";
import {
  getAccountRecoveryCopy,
  getAuthScreenRecoveryCopy,
  getCheckoutRecoveryActionLabel,
  getOrdersRecoveryCopy,
  getSessionRecoveryCopy,
  getSettingsRecoveryCopy
} from "../src/auth/recovery";

describe("auth recovery copy", () => {
  it("uses explicit re-auth copy when a session expires", () => {
    expect(getAuthScreenRecoveryCopy("expired")).toEqual({
      title: "Session expired.",
      body: "Sign in again to restore your orders, rewards, and checkout access on this device.",
      actionLabel: "Sign In Again"
    });

    expect(getOrdersRecoveryCopy("expired").actionLabel).toBe("Sign In Again");
    expect(getSettingsRecoveryCopy("expired").title).toBe("Your session expired.");
    expect(getSessionRecoveryCopy("expired").body).toContain("Sign in again");
    expect(getCheckoutRecoveryActionLabel("expired")).toBe("Sign In Again to Checkout");
  });

  it("uses default sign-in copy when there is no expired session", () => {
    expect(getAuthScreenRecoveryCopy("idle").title).toBe("Sign in.");
    expect(getAccountRecoveryCopy("idle", "LatteLink Flagship").body).toContain("LatteLink Flagship");
    expect(getOrdersRecoveryCopy("idle").actionLabel).toBe("Sign In");
    expect(getCheckoutRecoveryActionLabel("idle")).toBe("Sign In to Checkout");
  });
});
