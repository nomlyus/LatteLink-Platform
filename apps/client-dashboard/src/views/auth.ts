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

function renderApiBaseUrlField() {
  if (!isLocalDevAccessEnabled()) {
    return "";
  }

  return `
    <label class="field field--compact">
      <span>Gateway API</span>
      <input name="apiBaseUrl" type="url" value="${escapeHtml(state.authApiBaseUrl)}" placeholder="http://127.0.0.1:8080/v1" required />
    </label>
  `;
}

function renderAuthShell(content: string) {
  return `
    <div class="auth-page">
      <header class="auth-nav">
        <div class="auth-nav__shell">
          <div class="brand-lockup">
            <span class="brand-wordmark">LatteLink<span> by nomly</span></span>
          </div>
          <span class="auth-nav__tag">Operator Dashboard</span>
        </div>
      </header>

      <main class="auth-stage">
        <section class="auth-card">
          ${content}
        </section>
      </main>
    </div>
  `;
}

function renderOwnerInviteScreen() {
  const inviteState = state.ownerInvite;
  const lookup = inviteState?.lookup ?? null;
  const loading = inviteState?.status === "loading";
  const ready = inviteState?.status === "ready" && lookup;
  const accepting = inviteState?.accepting === true;
  const accepted = inviteState?.status === "accepted";

  return renderAuthShell(`
    <div class="auth-card__header">
      <p class="eyebrow">Owner invite</p>
      <h1>${accepted ? "Owner account ready." : "Set up your owner account."}</h1>
      <p class="muted-copy">${
        loading
          ? "Checking this one-time invite link."
          : ready
            ? `Create a password for ${escapeHtml(lookup.operator.email)}.`
            : accepted
              ? "Your password was set. Sign in with your owner email to continue."
              : "This invite cannot be used. Ask Nomly or your launch contact to resend the owner invite."
      }</p>
    </div>

    ${renderBanner()}

    ${
      loading
        ? `<div class="auth-loading"><span class="spinner"></span><span>Validating invite</span></div>`
        : ready
          ? `
            <div class="invite-summary">
              <span>Owner</span>
              <strong>${escapeHtml(lookup.operator.displayName)}</strong>
              <small>${escapeHtml(lookup.operator.email)}</small>
            </div>
            <form class="auth-stack" data-form="owner-invite-accept">
              <label class="field">
                <span>Password</span>
                <input name="password" type="password" autocomplete="new-password" placeholder="Choose a password" required />
              </label>
              <label class="field">
                <span>Confirm password</span>
                <input name="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat your password" required />
              </label>
              ${renderApiBaseUrlField()}
              <button class="button button--primary" type="submit" ${accepting ? "disabled" : ""}>
                ${accepting ? '<span class="spinner"></span>' : "Activate account"}
              </button>
            </form>
          `
          : `<button class="button button--primary" type="button" data-action="show-sign-in">Go to sign in</button>`
    }
  `);
}

export function renderAuthScreen() {
  if (state.ownerInvite) {
    return renderOwnerInviteScreen();
  }

  const googleSsoConfigured = isGoogleSignInConfigured();
  const googleButtonHint =
    state.authProviders === null
      ? "Checking availability"
      : googleSsoConfigured
        ? "Use your store Google account"
        : "Unavailable for this environment";

  return renderAuthShell(`
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

            ${renderApiBaseUrlField()}

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
  `);
}
