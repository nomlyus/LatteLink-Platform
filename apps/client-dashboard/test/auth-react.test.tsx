import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignInPage } from "../src/features/auth/components/SignInPage";

const handlers = {
  onEmailChange: vi.fn(), onSignIn: vi.fn(), onGoogleSignIn: vi.fn(), onLaunchWorkspace: vi.fn(), onApiBaseUrlChange: vi.fn()
};

function renderSignIn(overrides: Partial<Parameters<typeof SignInPage>[0]> = {}) {
  return renderToStaticMarkup(<SignInPage
    email="owner@example.test"
    error={null}
    pending={false}
    googleConfigured
    googleLoading={false}
    launchEntry={false}
    launchPending={false}
    launchResultEmail={null}
    localApiBaseUrl="https://api-dev.example.test/v1"
    showApiBaseUrl={false}
    {...handlers}
    {...overrides}
  />);
}

describe("React sign-in presentation", () => {
  it("renders the existing email/password and configured Google choices", () => {
    const html = renderSignIn();
    expect(html).toContain("Sign in to your dashboard.");
    expect(html).toContain('name="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Sign in with Google");
  });

  it("renders pending, error, and launch-workspace states declaratively", () => {
    const pending = renderSignIn({ pending: true, googleConfigured: false, error: "Unable to sign in." });
    expect(pending).toContain("Signing in");
    expect(pending).toContain('role="alert"');
    expect(pending).toContain("Unavailable for this environment");

    const launch = renderSignIn({ launchEntry: true });
    expect(launch).toContain("Start your branded app setup.");
    expect(launch).toContain('name="businessName"');
    expect(launch).toContain('name="ownerEmail"');
  });
});
