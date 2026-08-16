import { afterEach, describe, expect, it } from "vitest";
import { state } from "../src/state";
import { renderAuthScreen } from "../src/views/auth";

describe("operator auth view", () => {
  afterEach(() => {
    state.ownerInvite = null;
    state.launchEntryIntent = false;
    state.authEmail = "";
    state.authPassword = "";
    state.authProviders = null;
    state.signingIn = false;
    state.launchRequest = {
      submitting: false,
      submitted: false,
      ownerEmail: null
    };
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

  it("renders launch setup copy when merchants arrive from nomly.us", () => {
    state.launchEntryIntent = true;
    state.authProviders = { google: { configured: false } };

    const html = renderAuthScreen();

    expect(html).toContain("App launch");
    expect(html).toContain("Start your branded app setup.");
    expect(html).toContain("configure store details, payments, menu, and the app builder");
    expect(html).toContain('data-form="merchant-launch"');
    expect(html).toContain("Create your app workspace");
    expect(html).toContain("Business name");
  });

  it("renders launch request confirmation after workspace creation", () => {
    state.launchEntryIntent = true;
    state.launchRequest = {
      submitting: false,
      submitted: true,
      ownerEmail: "owner@rawaq.example"
    };

    const html = renderAuthScreen();

    expect(html).toContain("Check your email.");
    expect(html).toContain("owner@rawaq.example");
    expect(html).not.toContain("Create workspace");
  });
});
