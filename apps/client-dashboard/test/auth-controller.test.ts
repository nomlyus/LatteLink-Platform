import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOwnerInviteUrl, readOwnerInviteTokenFromUrl } from "../src/controllers/invite-url";

describe("owner invite URL handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setLocation(pathname: string, search = "", hash = "") {
    vi.stubGlobal("window", { location: { pathname, search, hash } });
  }

  it("reads the invite token only from the fragment on the token-free invite path", () => {
    setLocation("/invites/", "", "#synthetic-secret");
    expect(readOwnerInviteTokenFromUrl()).toBe("synthetic-secret");
  });

  it("preserves the deployed /invites/#token entry and removes the fragment from the address bar", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("document", { title: "Operator Dashboard" });
    vi.stubGlobal("window", {
      location: { pathname: "/invites", search: "", hash: "#invite-token" },
      history: { replaceState }
    });

    expect(readOwnerInviteTokenFromUrl()).toBe("invite-token");
    clearOwnerInviteUrl();
    expect(replaceState).toHaveBeenCalledWith({}, "Operator Dashboard", "/");
  });

  it("does not accept tokens carried in path or query strings", () => {
    setLocation("/invites/synthetic-secret");
    expect(readOwnerInviteTokenFromUrl()).toBeNull();
    setLocation("/invites/", "?inviteToken=synthetic-secret");
    expect(readOwnerInviteTokenFromUrl()).toBeNull();
  });
});
