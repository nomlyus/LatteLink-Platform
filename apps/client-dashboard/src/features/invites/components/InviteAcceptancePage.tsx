"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import type { OperatorInviteLookup } from "../invite-api";
import { AuthFrame, AuthMessage } from "../../auth/components/AuthFrame";
import styles from "../../auth/components/auth-v3.module.css";

export function InviteAcceptancePage({
  status,
  lookup,
  error,
  onAccept
}: {
  status: "missing" | "loading" | "invalid" | "ready" | "accepting";
  lookup: OperatorInviteLookup | null;
  error: string | null;
  onAccept: (password: string, confirmation: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const ready = (status === "ready" || status === "accepting") && lookup;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "ready" || !lookup) return;
    onAccept(password, confirmation);
  }

  return (
    <AuthFrame variant="detail">
      <div>
        <h1 className={styles.heading}>{ready ? "Join your team." : status === "loading" ? "Checking your invite." : "Invite unavailable."}</h1>
        <p className={ready ? styles.visuallyHidden : styles.utility}>{status === "loading"
          ? "Checking this one-time invite link."
          : ready
            ? `Create a password for ${lookup.operator.email}.`
            : status === "missing"
              ? "Open the complete invite link from your email to continue."
              : "This invite cannot be used. Ask your administrator to send a new invite."}</p>
      </div>
      {error ? <AuthMessage>{error}</AuthMessage> : null}
      {status === "loading" ? <div className="auth-loading" role="status"><span className="spinner" /><span>Validating invite</span></div> : null}
      {ready ? <>
        <form className={`${styles.stack} ${styles.passwordForm} ${styles.invitationForm}`} onSubmit={submit}>
          <label className={styles.field}><span className={styles.label}>Name</span><input className={styles.input} autoComplete="name" value={lookup.operator.displayName} readOnly aria-describedby="invite-name-context" /></label>
          <span id="invite-name-context" className={styles.visuallyHidden}>Your account was provisioned by Nomly.</span>
          <label className={styles.field}><span className={styles.label}>Password</span><input className={styles.input} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a password" disabled={status === "accepting"} required /></label>
          <label className={styles.field}><span className={styles.label}>Confirm password</span><input className={styles.input} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" disabled={status === "accepting"} required /></label>
          <button className={`${styles.action} ${styles.actionLight}`} type="submit" disabled={status === "accepting"}>
            {status === "accepting" ? "Activating account…" : "Accept invitation"}
          </button>
        </form>
      </> : null}
      {status === "missing" || status === "invalid" ? <Link className={styles.action} href="/">Go to sign in</Link> : null}
    </AuthFrame>
  );
}
