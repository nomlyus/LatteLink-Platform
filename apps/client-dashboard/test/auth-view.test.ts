import { afterEach, describe, expect, it } from "vitest";
import { state } from "../src/state";
import { renderAuthScreen } from "../src/views/auth";

describe("operator auth view", () => {
  afterEach(() => {
    state.ownerInvite = null;
    state.authEmail = "";
    state.authPassword = "";
    state.authProviders = null;
    state.signingIn = false;
  });

  it("renders email/password and Google sign-in without the removed provider placeholder", () => {
    state.authProviders = { google: { configured: true } };

    const html = renderAuthScreen();
    const removedProviderLabel = "Sign in with Ap" + "ple";
    const removedProviderHint = "Coming " + "soon";

    expect(html).toContain('data-form="auth-sign-in"');
    expect(html).toContain("Work email");
    expect(html).toContain("Password");
    expect(html).toContain("Sign in with Google");
    expect(html).toContain("Use your store Google account");
    expect(html).not.toContain(removedProviderLabel);
    expect(html).not.toContain(removedProviderHint);
  });
});
