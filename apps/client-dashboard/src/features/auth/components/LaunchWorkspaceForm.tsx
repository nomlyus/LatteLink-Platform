"use client";
import React, { useState } from "react";
import styles from "./auth-v3.module.css";

export type LaunchWorkspaceValues = { businessName: string; locationName: string; marketLabel: string; ownerName: string; ownerEmail: string };

// Retain the existing explicit launch-query entry without placing a signup form
// on the default invitation-led sign-in screen.
export function LaunchWorkspaceForm({ pending, resultEmail, onSubmit }: {
  pending: boolean;
  resultEmail: string | null;
  onSubmit: (values: LaunchWorkspaceValues) => void;
}) {
  const [values, setValues] = useState<LaunchWorkspaceValues>({ businessName: "", locationName: "", marketLabel: "", ownerName: "", ownerEmail: "" });
  if (resultEmail) return <p role="status" className={styles.message}>Check your email. We sent the owner setup link to {resultEmail}.</p>;
  return <form className={`${styles.stack} ${styles.passwordForm}`} onSubmit={(event) => { event.preventDefault(); if (!pending) onSubmit(values); }}>
    {([
      ["businessName", "Business name", "organization"], ["locationName", "Location name", "off"],
      ["marketLabel", "Market", "off"], ["ownerName", "Owner name", "name"], ["ownerEmail", "Owner email", "email"]
    ] as const).map(([name, label, autoComplete]) => <label className={styles.field} key={name}><span className={styles.label}>{label}</span><input className={styles.input} name={name} type={name === "ownerEmail" ? "email" : "text"} autoComplete={autoComplete} value={values[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} disabled={pending} required /></label>)}
    <button className={`${styles.action} ${styles.actionLight}`} disabled={pending} type="submit">{pending ? "Creating workspace…" : "Create workspace"}</button>
  </form>;
}
