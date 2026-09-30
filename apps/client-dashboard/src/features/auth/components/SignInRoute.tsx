"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadStoredApiBaseUrl, persistApiBaseUrl } from "../../../storage";
import { getDefaultAuthApiBaseUrl, fetchOperatorAuthProviders, startOperatorGoogleSignIn, exchangeOperatorGoogleCode, signInOperatorWithPassword, createMerchantLaunch } from "../auth-api";
import { getGoogleCallbackRedirectUri, readGoogleCallbackParams, stripGoogleCallbackParams } from "../google-callback";
import { getPostSignInPath, isLaunchEntry, safeAuthError, validateSignIn } from "../auth-domain";
import { useDashboardSession } from "../session-provider";
import { DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { SignInPage, type LaunchWorkspaceValues } from "./SignInPage";

function localApiOverrideAllowed() {
  return process.env.NODE_ENV === "development" && typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
}

function withCurrentSearchAndHash(path: string) {
  return `${path}${window.location.search}${window.location.hash}`;
}

export function SignInRoute({ initialEmail = "", initialMessage = null, destinationOverride }: {
  initialEmail?: string;
  initialMessage?: string | null;
  destinationOverride?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { status, session, establishSession, authNotice } = useDashboardSession();
  const [email, setEmail] = useState(initialEmail);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => loadStoredApiBaseUrl() || getDefaultAuthApiBaseUrl());
  const [providersConfigured, setProvidersConfigured] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [launchPending, setLaunchPending] = useState(false);
  const [launchResultEmail, setLaunchResultEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const requestControllersRef = useRef(new Set<AbortController>());

  useEffect(() => () => {
    for (const controller of requestControllersRef.current) controller.abort();
    requestControllersRef.current.clear();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    setProvidersLoading(true);
    void fetchOperatorAuthProviders({ apiBaseUrl, signal: controller.signal })
      .then((providers) => setProvidersConfigured(providers.google.configured))
      .catch(() => setProvidersConfigured(false))
      .finally(() => { if (!controller.signal.aborted) setProvidersLoading(false); });
    return () => {
      controller.abort();
      requestControllersRef.current.delete(controller);
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const callback = readGoogleCallbackParams(window.location.origin, window.location.search);
    if (!callback) return;

    window.history.replaceState(
      window.history.state,
      "",
      stripGoogleCallbackParams(window.location.pathname, window.location.search, window.location.hash)
    );

    if (callback.error) {
      setError("Google sign-in was canceled or could not be completed.");
      return;
    }
    if (!callback.code || !callback.state) {
      setError("Google sign-in returned incomplete callback data.");
      return;
    }

    setError(null);
    setPending(true);
    const baseUrl = loadStoredApiBaseUrl() || getDefaultAuthApiBaseUrl();
    // OAuth codes are single-use. Let this exchange finish across route/effect cleanup
    // so React Strict Mode cannot abort and replay the same code.
    void exchangeOperatorGoogleCode({
      apiBaseUrl: baseUrl,
      code: callback.code,
      state: callback.state,
      redirectUri: callback.redirectUri
    }).then((nextSession) => {
      persistApiBaseUrl(baseUrl);
      establishSession(nextSession);
      const destination = getPostSignInPath("/", nextSession);
      if (destination && window.location.pathname === "/") {
        router.replace(withCurrentSearchAndHash(destination), { scroll: false });
      }
    }).catch((callbackError: unknown) => {
      setError(safeAuthError(callbackError, "Unable to complete Google sign-in.", [callback.code ?? "", callback.state ?? ""]));
    }).finally(() => {
      setPending(false);
    });
  }, [establishSession, router]);

  const signIn = useCallback(async (formEmail: string, password: string, requestedApiBaseUrl: string) => {
    const validation = validateSignIn(formEmail, password);
    if (validation) {
      setError(validation);
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    try {
      const selectedBaseUrl = requestedApiBaseUrl.trim() || getDefaultAuthApiBaseUrl();
      if (!selectedBaseUrl) throw new Error("Configure the Gateway API before signing in.");
      const normalizedEmail = formEmail.trim();
      persistApiBaseUrl(selectedBaseUrl);
      setEmail(normalizedEmail);
      const nextSession = await signInOperatorWithPassword({
        apiBaseUrl: selectedBaseUrl,
        email: normalizedEmail,
        password,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      establishSession(nextSession);
      const destination = destinationOverride ?? getPostSignInPath(pathname, nextSession);
      if (destination) router.replace(withCurrentSearchAndHash(destination), { scroll: false });
    } catch (signInError) {
      if (!controller.signal.aborted) setError(safeAuthError(signInError, "Unable to sign in.", [password]));
    } finally {
      requestControllersRef.current.delete(controller);
      pendingRef.current = false;
      setPending(false);
    }
  }, [destinationOverride, establishSession, pathname, router]);

  const startGoogleSignIn = useCallback(async () => {
    if (pendingRef.current || !providersConfigured) return;
    pendingRef.current = true;
    setGooglePending(true);
    setError(null);
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    try {
      const selectedBaseUrl = apiBaseUrl.trim() || getDefaultAuthApiBaseUrl();
      if (!selectedBaseUrl) throw new Error("Configure the Gateway API before signing in.");
      persistApiBaseUrl(selectedBaseUrl);
      const start = await startOperatorGoogleSignIn({
        apiBaseUrl: selectedBaseUrl,
        redirectUri: getGoogleCallbackRedirectUri(window.location.origin),
        signal: controller.signal
      });
      window.location.assign(start.authorizeUrl);
    } catch (googleError) {
      if (!controller.signal.aborted) {
        setError(safeAuthError(googleError, "Unable to start Google sign-in."));
        pendingRef.current = false;
        setGooglePending(false);
      }
    } finally {
      requestControllersRef.current.delete(controller);
    }
  }, [apiBaseUrl, providersConfigured]);

  const submitLaunchWorkspace = useCallback(async (values: LaunchWorkspaceValues, requestedApiBaseUrl: string) => {
    if (pendingRef.current) return;
    const fields = Object.values(values).map((value) => value.trim());
    if (fields.some((value) => !value)) {
      setError("Complete the business and owner details to create the workspace.");
      return;
    }
    pendingRef.current = true;
    setLaunchPending(true);
    setError(null);
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    try {
      const selectedBaseUrl = requestedApiBaseUrl.trim() || getDefaultAuthApiBaseUrl();
      if (!selectedBaseUrl) throw new Error("Configure the Gateway API before creating a workspace.");
      persistApiBaseUrl(selectedBaseUrl);
      const result = await createMerchantLaunch({ apiBaseUrl: selectedBaseUrl, ...values, signal: controller.signal });
      setLaunchResultEmail(result.ownerEmail);
    } catch (launchError) {
      if (!controller.signal.aborted) setError(safeAuthError(launchError, "Unable to create the launch workspace.", [values.ownerEmail]));
    } finally {
      requestControllersRef.current.delete(controller);
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setLaunchPending(false);
      }
    }
  }, []);

  if (status === "loading" || (status === "authenticated" && session)) return <DashboardShellLoading />;

  return <SignInPage
    email={email}
    onEmailChange={setEmail}
    error={error}
    notice={initialMessage ?? authNotice}
    pending={pending || googlePending}
    googleConfigured={providersConfigured}
    googleLoading={providersLoading}
    localApiBaseUrl={apiBaseUrl}
    onApiBaseUrlChange={setApiBaseUrl}
    showApiBaseUrl={localApiOverrideAllowed()}
    launchEntry={isLaunchEntry(search)}
    launchPending={launchPending}
    launchResultEmail={launchResultEmail}
    onSignIn={(nextEmail, password, nextApiBaseUrl) => { void signIn(nextEmail, password, nextApiBaseUrl); }}
    onGoogleSignIn={() => { void startGoogleSignIn(); }}
    onLaunchWorkspace={(values, nextApiBaseUrl) => { void submitLaunchWorkspace(values, nextApiBaseUrl); }}
  />;
}
