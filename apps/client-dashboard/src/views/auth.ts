import { state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { renderBanner } from "./common.js";

function isLocalDevAccessEnabled() {
  if (import.meta.env.DEV) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function isGoogleSignInConfigured() {
  return state.authProviders?.google.configured === true;
}

export function renderAuthScreen() {
  const showApiField = isLocalDevAccessEnabled();
  const googleSsoConfigured = isGoogleSignInConfigured();
  const googleButtonHint =
    state.authProviders === null
      ? "Checking availability"
      : googleSsoConfigured
        ? "Use your store Google account"
        : "Unavailable for this environment";

  return `
    <div class="auth-page">
      <header class="auth-nav">
        <div class="auth-nav__shell">
          <div class="brand-lockup">
            <span class="brand-wordmark">LatteLink<span> by Nomly</span></span>
          </div>
          <span class="auth-nav__tag">Operator Dashboard</span>
        </div>
      </header>

      <main class="auth-stage">
        <section class="auth-card">
          <div class="auth-card__header">
            <p class="eyebrow">Store access</p>
            <h1>Sign in to your dashboard.</h1>
            <p class="muted-copy">Use the email and password assigned to your store account.</p>
          </div>

          ${renderBanner()}

          <form class="auth-stack" data-form="auth-sign-in">
            <label class="field">
              <span>Work email</span>
              <input name="email" type="email" value="${escapeHtml(state.authEmail)}" placeholder="owner@store.com" required />
            </label>

            <label class="field">
              <span>Password</span>
              <input name="password" type="password" value="${escapeHtml(state.authPassword)}" placeholder="Enter your password" required />
            </label>

            ${
              showApiField
                ? `
                  <label class="field field--compact">
                    <span>Gateway API</span>
                    <input name="apiBaseUrl" type="url" value="${escapeHtml(state.authApiBaseUrl)}" placeholder="http://127.0.0.1:8080/v1" required />
                  </label>
                `
                : ""
            }

            <button class="button button--primary" type="submit" ${state.signingIn ? "disabled" : ""}>
              ${state.signingIn ? '<span class="spinner"></span>' : "Sign in"}
            </button>
          </form>

          <div class="auth-divider"><span>or continue with SSO</span></div>

          <div class="sso-stack">
            <button class="sso-button" type="button" disabled>
              <span class="sso-button__icon">A</span>
              <span class="sso-button__meta">
                <strong>Sign in with Apple</strong>
                <small>Coming soon</small>
              </span>
            </button>
            <button
              class="sso-button"
              type="button"
              data-action="start-google-sign-in"
              ${state.signingIn || !googleSsoConfigured ? "disabled" : ""}
            >
              <span class="sso-button__icon">G</span>
              <span class="sso-button__meta">
                <strong>Sign in with Google</strong>
                <small>${escapeHtml(googleButtonHint)}</small>
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  `;
}
