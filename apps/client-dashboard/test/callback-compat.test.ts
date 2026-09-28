import { afterEach, describe, expect, it, vi } from "vitest";

describe("root callback URL compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps Google OAuth callback routing at root and retains the established redirect URI", async () => {
    vi.stubGlobal("window", { location: { href: "https://dashboard.example.com/legacy/orders?stripeReturn=1#old" } });
    const { getGoogleCallbackRedirectUri, readGoogleCallbackParams } = await import("../src/google-callback");

    expect(getGoogleCallbackRedirectUri()).toBe("https://dashboard.example.com/?google_auth_callback=1");
    vi.stubGlobal("window", { location: { href: "https://dashboard.example.com/?google_auth_callback=1&code=oauth-code&state=csrf-state" } });
    expect(readGoogleCallbackParams()).toMatchObject({ code: "oauth-code", state: "csrf-state" });
  });

  it("cleans only Google callback parameters and preserves other root query and fragment values", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("document", { title: "Operator Dashboard" });
    vi.stubGlobal("window", {
      location: { href: "https://dashboard.example.com/?google_auth_callback=1&code=one&stripeReturn=1&keep=yes#invite" },
      history: { replaceState }
    });
    const { clearGoogleCallbackParams } = await import("../src/google-callback");

    clearGoogleCallbackParams();

    expect(replaceState).toHaveBeenCalledWith({}, "Operator Dashboard", "/?stripeReturn=1&keep=yes#invite");
  });

  it("preserves Stripe return/refresh flags while clearing them without dropping unrelated query values", async () => {
    const { readStripeReturnParams, stripStripeReturnParams } = await import("../src/lib/navigation/route-callbacks");

    expect(readStripeReturnParams("?stripeReturn=1&keep=value")).toEqual({ returned: true, refreshRequested: false });
    expect(readStripeReturnParams("?stripeRefresh=1")).toEqual({ returned: false, refreshRequested: true });
    expect(stripStripeReturnParams("/", "?stripeReturn=1&stripeRefresh=1&keep=value")).toBe("/?keep=value");
    expect(stripStripeReturnParams("/", "?keep=value")).toBe("/?keep=value");
  });
});
