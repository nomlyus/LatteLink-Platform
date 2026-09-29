"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import type { OperatorInviteLookup } from "../invite-api";
import { AuthFrame, AuthMessage } from "../../auth/components/AuthFrame";

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
    onAccept(password, confirmation);
  }

  return (
    <AuthFrame>
      <div className="auth-card__header">
        <p className="eyebrow">{lookup?.operator.role === "owner" ? "Owner invite" : "Team invite"}</p>
        <h1>{ready ? "Set up your account." : status === "loading" ? "Checking your invite." : "Invite unavailable."}</h1>
        <p className="muted-copy">{status === "loading"
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
        <div className="invite-summary">
          <span>{lookup.operator.role === "owner" ? "Owner" : "Team member"}</span>
          <strong>{lookup.operator.displayName}</strong>
          <small>{lookup.operator.email}</small>
        </div>
        <form className="auth-stack" onSubmit={submit}>
          <label className="field"><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a password" required /></label>
          <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" required /></label>
          <button className="button button--primary" type="submit" disabled={status === "accepting"}>
            {status === "accepting" ? <><span className="spinner" />Activating account</> : "Activate account"}
          </button>
        </form>
      </> : null}
      {status === "missing" || status === "invalid" ? <Link className="button button--primary" href="/">Go to sign in</Link> : null}
    </AuthFrame>
  );
}
