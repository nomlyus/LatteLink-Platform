"use client";

import React, { useState, type FormEvent } from "react";
import { AuthFrame, AuthMessage } from "./AuthFrame";

export type LaunchWorkspaceValues = {
  businessName: string;
  locationName: string;
  marketLabel: string;
  ownerName: string;
  ownerEmail: string;
};

export type SignInPageProps = {
  email: string;
  onEmailChange: (email: string) => void;
  error: string | null;
  notice?: string | null;
  pending: boolean;
  googleConfigured: boolean;
  googleLoading: boolean;
  localApiBaseUrl?: string;
  onApiBaseUrlChange: (apiBaseUrl: string) => void;
  showApiBaseUrl?: boolean;
  launchEntry: boolean;
  launchPending: boolean;
  launchResultEmail: string | null;
  onSignIn: (email: string, password: string, apiBaseUrl: string) => void;
  onGoogleSignIn: () => void;
  onLaunchWorkspace: (values: LaunchWorkspaceValues, apiBaseUrl: string) => void;
};

export function SignInPage({
  email,
  onEmailChange,
  error,
  notice,
  pending,
  googleConfigured,
  googleLoading,
  localApiBaseUrl = "",
  onApiBaseUrlChange,
  showApiBaseUrl = false,
  launchEntry,
  launchPending,
  launchResultEmail,
  onSignIn,
  onGoogleSignIn,
  onLaunchWorkspace
}: SignInPageProps) {
  const [launchValues, setLaunchValues] = useState<LaunchWorkspaceValues>({
    businessName: "", locationName: "", marketLabel: "", ownerName: "", ownerEmail: ""
  });

  function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSignIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""), localApiBaseUrl);
  }

  function submitLaunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLaunchWorkspace(launchValues, localApiBaseUrl);
  }

  return (
    <AuthFrame>
      <div className="auth-card__header">
        <p className="eyebrow">{launchEntry ? "App launch" : "Store access"}</p>
        <h1>{launchEntry ? "Start your branded app setup." : "Sign in to your dashboard."}</h1>
        <p className="muted-copy">{launchEntry
          ? "Use your owner account to configure store details, payments, and menu in one guided flow."
          : "Use the email and password assigned to your store account."}</p>
      </div>
      {notice ? <AuthMessage tone="notice">{notice}</AuthMessage> : null}
      {error ? <AuthMessage>{error}</AuthMessage> : null}

      {launchEntry ? (
        <form className="auth-stack launch-request" onSubmit={submitLaunch}>
          <div className="auth-subsection">
            <span>New merchant</span>
            <strong>{launchResultEmail ? "Check your email." : "Create your app workspace"}</strong>
            <small>{launchResultEmail
              ? `We sent the owner setup link to ${launchResultEmail}.`
              : "Nomly will create your draft workspace and send the owner setup link."}</small>
          </div>
          {!launchResultEmail ? <>
            <label className="field"><span>Business name</span><input name="businessName" value={launchValues.businessName} onChange={(event) => setLaunchValues((current) => ({ ...current, businessName: event.target.value }))} autoComplete="organization" required /></label>
            <label className="field"><span>Location name</span><input name="locationName" value={launchValues.locationName} onChange={(event) => setLaunchValues((current) => ({ ...current, locationName: event.target.value }))} required /></label>
            <label className="field"><span>Market</span><input name="marketLabel" value={launchValues.marketLabel} onChange={(event) => setLaunchValues((current) => ({ ...current, marketLabel: event.target.value }))} placeholder="Detroit, MI" required /></label>
            <label className="field"><span>Owner name</span><input name="ownerName" value={launchValues.ownerName} onChange={(event) => setLaunchValues((current) => ({ ...current, ownerName: event.target.value }))} autoComplete="name" required /></label>
            <label className="field"><span>Owner email</span><input name="ownerEmail" type="email" value={launchValues.ownerEmail} onChange={(event) => setLaunchValues((current) => ({ ...current, ownerEmail: event.target.value }))} autoComplete="email" required /></label>
            {showApiBaseUrl ? <label className="field field--compact"><span>Gateway API</span><input type="url" value={localApiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} required /></label> : null}
            <button className="button button--primary" type="submit" disabled={launchPending}>{launchPending ? <><span className="spinner" />Creating workspace</> : "Create workspace"}</button>
          </> : null}
        </form>
      ) : null}

      {launchEntry ? <div className="auth-divider"><span>or sign in</span></div> : null}
      <form className="auth-stack" onSubmit={submitSignIn}>
        <label className="field"><span>Work email</span><input name="email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="username" placeholder="owner@store.com" required /></label>
        <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></label>
        {showApiBaseUrl ? <label className="field field--compact"><span>Gateway API</span><input type="url" value={localApiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} required /></label> : null}
        <button className="button button--primary" type="submit" disabled={pending}>{pending ? <><span className="spinner" />Signing in</> : "Sign in"}</button>
      </form>
      <div className="auth-divider"><span>or continue with SSO</span></div>
      <div className="sso-stack">
        <button className="sso-button" type="button" onClick={onGoogleSignIn} disabled={pending || googleLoading || !googleConfigured}>
          <span className="sso-button__icon" aria-hidden="true">G</span>
          <span className="sso-button__meta"><strong>Sign in with Google</strong><small>{googleLoading ? "Checking availability" : googleConfigured ? "Use your store Google account" : "Unavailable for this environment"}</small></span>
        </button>
      </div>
    </AuthFrame>
  );
}
