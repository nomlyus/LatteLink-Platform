import React, { type ReactNode } from "react";
import Link from "next/link";
import styles from "./auth-v3.module.css";

export function AuthFrame({ children, variant = "entry" }: { children: ReactNode; variant?: "entry" | "detail" }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" aria-label="Nomly sign in"><span>n</span><span>o</span><span>m</span><span>l</span><span>y</span></Link>
      </header>
      <section className={`${styles.stage}${variant === "detail" ? ` ${styles.detailStage}` : ""}`}>{children}</section>
      <footer className={styles.footer}>© Nomly</footer>
    </main>
  );
}

export function AuthMessage({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "notice" }) {
  return <div className={`${styles.message}${tone === "error" ? ` ${styles.error}` : ""}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
