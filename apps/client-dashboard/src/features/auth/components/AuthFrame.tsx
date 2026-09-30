import React, { type ReactNode } from "react";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <header className="auth-nav">
        <div className="auth-nav__shell">
          <div className="brand-lockup">
            <span className="brand-wordmark">LatteLink<span> by nomly</span></span>
          </div>
          <span className="auth-nav__tag">Operator Dashboard</span>
        </div>
      </header>
      <div className="auth-stage"><section className="auth-card">{children}</section></div>
    </main>
  );
}

export function AuthMessage({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "notice" }) {
  return <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
