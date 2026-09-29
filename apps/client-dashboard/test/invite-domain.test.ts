import { describe, expect, it } from "vitest";
import { getInviteAcceptanceError, readInviteTokenFromHash, unavailableInviteMessage } from "../src/features/invites/invite-domain";

describe("React invite domain", () => {
  it("reads the opaque invite value only from the URL fragment", () => {
    expect(readInviteTokenFromHash("")).toBeNull();
    expect(readInviteTokenFromHash("#sample%20opaque%20value")).toBe("sample opaque value");
    expect(readInviteTokenFromHash("#raw%value")).toBe("raw%value");
  });

  it("validates password confirmation before calling the existing invite contract", () => {
    expect(getInviteAcceptanceError("", "")).toBe("Choose a password to activate your account.");
    expect(getInviteAcceptanceError("short", "short")).toBe("Use a password between 8 and 128 characters.");
    expect(getInviteAcceptanceError("long-enough", "different-password")).toBe("Passwords do not match.");
    expect(getInviteAcceptanceError("long-enough", "long-enough")).toBeNull();
    expect(unavailableInviteMessage).not.toContain("token");
  });
});
