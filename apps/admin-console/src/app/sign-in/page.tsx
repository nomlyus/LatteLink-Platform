import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions";
import { getAdminConsoleAuthStatus, getAdminSession } from "@/lib/auth";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getAdminSession();
  if (session) {
    redirect("/clients");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const authStatus = getAdminConsoleAuthStatus();

  return (
    <main className="auth-page">
      <div className="auth-header">
        <span className="eyebrow">LatteLink Internal</span>
        <h1>Admin Console</h1>
        <p>Internal access for client onboarding, readiness checks, and owner handoff.</p>
      </div>

      <section className="auth-card">
        <div className="section-heading">
          <span className="eyebrow">Sign In</span>
          <h2>Secure internal access</h2>
        </div>

        {error ? <p className="inline-message inline-message-error">{error}</p> : null}
        {!authStatus.configured ? (
          <p className="inline-message inline-message-warning">
            Configure `ADMIN_CONSOLE_ALLOWED_EMAILS`, `ADMIN_CONSOLE_SHARED_PASSWORD`, and
            `ADMIN_CONSOLE_SESSION_SECRET` before using this app.
          </p>
        ) : null}

        <form action={signInAction} className="stack-form">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" placeholder="founder@example.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" placeholder="••••••••••••" required />
          </label>
          <button className="primary-button" type="submit">
            Sign In
          </button>
        </form>

        <div className="auth-footnote">
          <span>Allowed accounts:</span>
          <strong>{authStatus.allowedEmails.length || 0}</strong>
        </div>
      </section>
    </main>
  );
}
