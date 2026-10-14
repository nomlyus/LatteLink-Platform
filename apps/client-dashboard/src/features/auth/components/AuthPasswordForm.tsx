"use client";
import React from "react";
import styles from "./auth-v3.module.css";

export function AuthPasswordForm({ email, pending, onSignIn, onChangeEmail }: {
  email: string;
  pending: boolean;
  onSignIn: (password: string) => void;
  onChangeEmail: () => void;
}) {
  return <form className={styles.passwordForm} onSubmit={(event) => {
    event.preventDefault();
    if (!pending) onSignIn(String(new FormData(event.currentTarget).get("password") ?? ""));
  }}>
    <input type="hidden" name="email" value={email} />
    <label className={styles.field}><span className={styles.label}>Password</span><input className={styles.input} name="password" type="password" autoComplete="current-password" placeholder="••••••••••••" disabled={pending} required autoFocus /></label>
    <div className={styles.passwordActions}>
      <button className={`${styles.action} ${styles.actionLight}`} type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <button className={styles.action} type="button" disabled title="Password recovery for operator accounts is not available yet. Contact Nomly.">Forgot password?</button>
    </div>
    <p className={styles.utility}>{email} · <button type="button" disabled={pending} onClick={onChangeEmail}>Change email</button></p>
  </form>;
}
