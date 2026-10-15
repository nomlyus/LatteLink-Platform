import { describe, expect, it } from "vitest";
import {
  resolveReturnToPath,
  resolveAppleSignInErrorMessage,
  resolveDevAccessErrorMessage
} from "../src/auth/presentation";

describe("authentication presentation", () => {
  it("preserves the return destination allowlist and first-value semantics", () => {
    expect(resolveReturnToPath(["cart", "/(tabs)/orders"])).toBe("cart");
    expect(resolveReturnToPath("/(tabs)/account")).toBe("/(tabs)/account");
    expect(resolveReturnToPath("https://nomly.us")).toBeNull();
    expect(resolveReturnToPath("/account/settings")).toBeNull();
    expect(resolveReturnToPath([])).toBeNull();
  });
  it("keeps explicit Apple and dev sign-in recovery copy", () => {
    expect(resolveAppleSignInErrorMessage(new Error("INVALID_APPLE_IDENTITY"))).toBe(
      "Apple could not verify this sign-in response. Try again."
    );
    expect(resolveDevAccessErrorMessage(new Error("DEV_CUSTOMER_ACCESS_DISABLED"))).toBe(
      "Dev sign in is disabled on the backend for this environment."
    );
    expect(
      resolveAppleSignInErrorMessage(
        new Error('Request failed (401): {"code":"DENIED","message":" Try later ","requestId":"r1"}')
      )
    ).toBe("DENIED: Try later (request r1)");
  });
});
