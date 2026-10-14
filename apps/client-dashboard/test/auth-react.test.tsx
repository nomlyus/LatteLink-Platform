import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignInPage } from "../src/features/auth/components/SignInPage";
import { AuthPasswordForm } from "../src/features/auth/components/AuthPasswordForm";

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
  it("renders the V3 provider/email entry without prematurely showing password fields", () => {
    const html = renderSignIn();
    expect(html).toContain("Welcome.");
    expect(html).toContain('name="email"');
    expect(html).not.toContain('autoComplete="current-password"');
    expect(html).toContain("Sign in with Google");
    expect(html).toContain("Continue with email");
    expect(html).toContain("Apple sign-in is not available for operator accounts yet");
    expect(html).toContain("/icons/auth-v3/google.svg");
  });

  it("renders pending, error, and launch-workspace states declaratively", () => {
    const pending = renderSignIn({ pending: true, googleConfigured: false, error: "Unable to sign in." });
    expect(pending).toContain('disabled=""');
    expect(pending).toContain('role="alert"');
    expect(pending).toContain("Unavailable for this environment");

    const launch = renderSignIn({ launchEntry: true });
    expect(launch).toContain("Start your branded app setup.");
    expect(launch).toContain('name="businessName"');
    expect(launch).toContain('name="ownerEmail"');
  });
  it("preserves the password sign-in form and exposes unavailable recovery honestly", () => {
    const html = renderToStaticMarkup(<AuthPasswordForm email="owner@example.test" pending={false} onSignIn={vi.fn()} onChangeEmail={vi.fn()} />);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Forgot password?");
    expect(html).toContain("not available yet");
    expect(html).toContain("Change email");
    expect(renderToStaticMarkup(<AuthPasswordForm email="owner@example.test" pending onSignIn={vi.fn()} onChangeEmail={vi.fn()} />)).toContain("Signing in…");
  });
});
