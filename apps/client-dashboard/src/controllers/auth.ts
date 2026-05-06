import {
  acceptOperatorInvite,
  exchangeOperatorGoogleCode,
  fetchOperatorAuthProviders,
  lookupOperatorInvite,
  resolveDefaultApiBaseUrl,
  signInOperatorWithPassword,
  startOperatorGoogleSignIn
} from "../api.js";
import { setError, state } from "../state.js";
import { clearStoredSession, persistApiBaseUrl } from "../storage.js";
import { applyVerifiedSession } from "../lifecycle.js";
import { render } from "../render.js";
import {
  clearGoogleCallbackParams,
  getGoogleCallbackRedirectUri,
  readGoogleCallbackParams
} from "../google-callback.js";

function isGoogleSignInConfigured() {
  return state.authProviders?.google.configured === true;
}

export function readOwnerInviteTokenFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const inviteQueryToken =
    window.location.search.length > 0
      ? new URLSearchParams(window.location.search).get("inviteToken") ??
        new URLSearchParams(window.location.search).get("invite")
      : null;
  if (inviteQueryToken?.trim()) {
    return inviteQueryToken.trim();
  }

  const match = window.location.pathname.match(/^\/invites\/([^/?#]+)\/?$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

function clearInviteUrl() {
  if (typeof window === "undefined") {
    return;
  }
  window.history.replaceState({}, document.title, "/");
}

export function showSignInScreen() {
  state.ownerInvite = null;
  state.authPassword = "";
  setError(null);
  clearInviteUrl();
  render();
}

export async function loadAuthProviders() {
  const apiBaseUrl = state.authApiBaseUrl || resolveDefaultApiBaseUrl();
  try {
    state.authProviders = await fetchOperatorAuthProviders({ apiBaseUrl });
  } catch {
    state.authProviders = { google: { configured: false } };
  } finally {
    if (!state.session) {
      render();
    }
  }
}

export async function handleOwnerInviteFromUrl() {
  const token = readOwnerInviteTokenFromUrl();
  if (!token) {
    return false;
  }

  clearStoredSession();
  state.session = null;
  state.ownerInvite = {
    token,
    status: "loading",
    lookup: null,
    accepting: false
  };
  state.authPassword = "";
  setError(null);
  render();

  try {
    const apiBaseUrl = state.authApiBaseUrl || resolveDefaultApiBaseUrl();
    state.authApiBaseUrl = apiBaseUrl;
    persistApiBaseUrl(apiBaseUrl);
    const lookup = await lookupOperatorInvite({ apiBaseUrl, token });
    state.ownerInvite = {
      token,
      status: "ready",
      lookup,
      accepting: false
    };
    state.authEmail = lookup.operator.email;
    setError(null);
  } catch (error) {
    state.ownerInvite = {
      token,
      status: "error",
      lookup: null,
      accepting: false
    };
    setError(error instanceof Error ? error.message : "This invite link is no longer valid.");
  } finally {
    render();
  }

  return true;
}

export async function handlePasswordSignIn(form: HTMLFormElement) {
  const formData = new FormData(form);
  const apiBaseUrl = String(formData.get("apiBaseUrl") ?? resolveDefaultApiBaseUrl());
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    setError("A work email is required.");
    render();
    return;
  }
  if (!password) {
    setError("A password is required.");
    render();
    return;
  }

  try {
    state.signingIn = true;
    state.authApiBaseUrl = apiBaseUrl;
    state.authEmail = email;
    state.authPassword = password;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();
    const session = await signInOperatorWithPassword({ apiBaseUrl, email, password });
    await applyVerifiedSession(session, "");
  } catch (error) {
    setError(error instanceof Error ? error.message : "Unable to sign in.");
  } finally {
    state.signingIn = false;
    render();
  }
}

export async function handleOwnerInviteAccept(form: HTMLFormElement) {
  const inviteState = state.ownerInvite;
  if (!inviteState || inviteState.status !== "ready" || !inviteState.lookup) {
    setError("This invite link is not ready. Ask Nomly to resend the owner invite.");
    render();
    return;
  }

  const formData = new FormData(form);
  const apiBaseUrl = String(formData.get("apiBaseUrl") ?? state.authApiBaseUrl ?? resolveDefaultApiBaseUrl());
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password) {
    setError("Choose a password to activate your owner account.");
    render();
    return;
  }
  if (password !== confirmPassword) {
    setError("Passwords do not match.");
    render();
    return;
  }

  try {
    state.ownerInvite = {
      ...inviteState,
      accepting: true
    };
    state.authApiBaseUrl = apiBaseUrl;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();

    await acceptOperatorInvite({
      apiBaseUrl,
      token: inviteState.token,
      password
    });

    try {
      const session = await signInOperatorWithPassword({
        apiBaseUrl,
        email: inviteState.lookup.operator.email,
        password
      });
      state.ownerInvite = null;
      clearInviteUrl();
      await applyVerifiedSession(session, "Your owner account is ready.");
    } catch (signInError) {
      state.ownerInvite = null;
      state.authEmail = inviteState.lookup.operator.email;
      state.authPassword = "";
      clearInviteUrl();
      setError(null);
      render();
      throw signInError;
    }
  } catch (error) {
    if (state.ownerInvite) {
      state.ownerInvite = {
        ...state.ownerInvite,
        accepting: false
      };
    }
    setError(error instanceof Error ? error.message : "Unable to activate this owner invite.");
    render();
  }
}

export async function handleGoogleSignInStart() {
  if (!isGoogleSignInConfigured()) {
    setError("Google Sign-In is not configured for this environment.");
    render();
    return;
  }

  const apiBaseUrl = state.authApiBaseUrl || resolveDefaultApiBaseUrl();

  try {
    state.signingIn = true;
    state.authApiBaseUrl = apiBaseUrl;
    persistApiBaseUrl(apiBaseUrl);
    setError(null);
    render();

    const start = await startOperatorGoogleSignIn({
      apiBaseUrl,
      redirectUri: getGoogleCallbackRedirectUri()
    });

    if (typeof window !== "undefined") {
      window.location.assign(start.authorizeUrl);
      return;
    }
  } catch (error) {
    state.signingIn = false;
    setError(error instanceof Error ? error.message : "Unable to start Google sign-in.");
    render();
  }
}

export async function handleGoogleCallback() {
  const callback = readGoogleCallbackParams();
  if (!callback) {
    return false;
  }

  state.signingIn = true;
  setError(null);
  render();

  if (callback.error) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError("Google sign-in was canceled or could not be completed.");
    render();
    return true;
  }

  if (!callback.code || !callback.state) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError("Google sign-in returned incomplete callback data.");
    render();
    return true;
  }

  try {
    const session = await exchangeOperatorGoogleCode({
      apiBaseUrl: state.authApiBaseUrl || resolveDefaultApiBaseUrl(),
      code: callback.code,
      state: callback.state,
      redirectUri: callback.redirectUri
    });
    clearGoogleCallbackParams();
    state.signingIn = false;
    await applyVerifiedSession(session, "");
  } catch (error) {
    clearGoogleCallbackParams();
    state.signingIn = false;
    setError(error instanceof Error ? error.message : "Unable to complete Google sign-in.");
    render();
  }

  return true;
}
