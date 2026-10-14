"use client";

import React, { useState, useId } from "react";
import Image from "next/image";
import { AuthFrame, AuthMessage } from "./AuthFrame";
import { AuthPasswordForm } from "./AuthPasswordForm";
import { LaunchWorkspaceForm, type LaunchWorkspaceValues } from "./LaunchWorkspaceForm";
import styles from "./auth-v3.module.css";
export type { LaunchWorkspaceValues } from "./LaunchWorkspaceForm";

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
  email, onEmailChange, error, notice, pending, googleConfigured, googleLoading,
  localApiBaseUrl = "", onApiBaseUrlChange, showApiBaseUrl = false,
  launchEntry, launchPending, launchResultEmail, onSignIn, onGoogleSignIn, onLaunchWorkspace
}: SignInPageProps) {
  const [passwordStep, setPasswordStep] = useState(false);
  const appleUnavailableId = useId();
  return <AuthFrame variant={passwordStep ? "detail" : "entry"}>
    <h1 className={styles.heading}>{launchEntry ? "Start your branded app setup." : passwordStep ? "Welcome back." : "Welcome."}</h1>
    {notice ? <AuthMessage tone="notice">{notice}</AuthMessage> : null}
    {error ? <AuthMessage>{error}</AuthMessage> : null}
    {launchEntry ? <>
      <LaunchWorkspaceForm pending={launchPending} resultEmail={launchResultEmail} onSubmit={(values) => onLaunchWorkspace(values, localApiBaseUrl)} />
      <p className={styles.utility}>Already have an account? Continue below.</p>
    </> : null}
    {passwordStep ? <AuthPasswordForm email={email} pending={pending} onChangeEmail={() => setPasswordStep(false)} onSignIn={(password) => onSignIn(email, password, localApiBaseUrl)} /> : <>
      <div className={styles.providers}>
        <button className={styles.provider} type="button" disabled aria-describedby={appleUnavailableId} title="Apple sign-in is not available for operator accounts yet.">
          <span className={styles.providerIcon} aria-hidden="true"></span>Sign in with Apple
        </button>
        <span id={appleUnavailableId} className={styles.visuallyHidden}>Apple sign-in is not available for operator accounts yet.</span>
        <button className={`${styles.provider} ${styles.providerGoogle}`} type="button" disabled={pending || googleLoading || !googleConfigured} onClick={onGoogleSignIn} title={googleConfigured ? "Sign in with Google" : "Unavailable for this environment"}>
          <span className={styles.providerIcon}><Image src="/icons/auth-v3/google.svg" width={20} height={20} alt="" unoptimized /></span>
          {googleLoading ? "Checking Google availability…" : "Sign in with Google"}
        </button>
      </div>
      <div className={styles.divider} aria-hidden="true">
        {[0, 1].map((side) => <span key={side} className={styles.dividerLine}><Image className={styles.desktopDivider} src="/icons/auth-v3/divider-desktop.svg" width={188} height={1} alt="" unoptimized /><Image className={styles.mobileDivider} src="/icons/auth-v3/divider-mobile.svg" width={171} height={1} alt="" unoptimized /></span>)}
        <span className={styles.dividerLabel}>or</span>
      </div>
      <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); if (!pending && email.trim()) setPasswordStep(true); }}>
        <label className={styles.field}><span className={styles.visuallyHidden}>Work email</span><input className={styles.input} name="email" type="email" autoComplete="username" placeholder="you@business.com" value={email} onChange={(event) => onEmailChange(event.target.value)} disabled={pending} required /></label>
        <button className={styles.action} type="submit" disabled={pending}>Continue with email</button>
      </form>
    </>}
    {showApiBaseUrl ? <details className={styles.development}><summary>Development connection</summary><label className={styles.field}><span className={styles.label}>Gateway API</span><input className={styles.input} type="url" value={localApiBaseUrl} disabled={pending || launchPending} onChange={(event) => onApiBaseUrlChange(event.target.value)} required /></label></details> : null}
  </AuthFrame>;
}
