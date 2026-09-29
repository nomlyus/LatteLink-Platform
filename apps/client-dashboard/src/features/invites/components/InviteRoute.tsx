"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStoredApiBaseUrl, persistApiBaseUrl } from "../../../storage";
import { getDefaultAuthApiBaseUrl, signInOperatorWithPassword } from "../../auth/auth-api";
import { SignInRoute } from "../../auth/components/SignInRoute";
import { useDashboardSession } from "../../auth/session-provider";
import { acceptOperatorInvite, lookupOperatorInvite, type OperatorInviteLookup } from "../invite-api";
import { getInviteAcceptanceError, readInviteTokenFromHash, unavailableInviteMessage } from "../invite-domain";
import { InviteAcceptancePage } from "./InviteAcceptancePage";

type InviteStatus = "missing" | "loading" | "invalid" | "ready" | "accepting";

export function InviteRoute() {
  const router = useRouter();
  const { discardLocalSession, establishSession } = useDashboardSession();
  const tokenRef = useRef<string | null>(null);
  const acceptingRef = useRef(false);
  const acceptControllerRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<InviteStatus>("loading");
  const [lookup, setLookup] = useState<OperatorInviteLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedEmail, setAcceptedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = tokenRef.current ?? readInviteTokenFromHash(window.location.hash);
    tokenRef.current = token;
    if (!token) {
      setStatus("missing");
      return;
    }

    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    discardLocalSession();
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    const apiBaseUrl = loadStoredApiBaseUrl() || getDefaultAuthApiBaseUrl();
    if (apiBaseUrl) persistApiBaseUrl(apiBaseUrl);
    void lookupOperatorInvite({ apiBaseUrl, token, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setLookup(result);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLookup(null);
        setStatus("invalid");
        setError(unavailableInviteMessage);
      });
    return () => controller.abort();
  }, [discardLocalSession]);

  useEffect(() => () => acceptControllerRef.current?.abort(), []);

  const accept = useCallback(async (password: string, confirmation: string) => {
    const validation = getInviteAcceptanceError(password, confirmation);
    if (validation) {
      setError(validation);
      return;
    }
    if (acceptingRef.current || !tokenRef.current || !lookup) return;
    acceptingRef.current = true;
    setStatus("accepting");
    setError(null);
    const controller = new AbortController();
    acceptControllerRef.current = controller;
    const apiBaseUrl = loadStoredApiBaseUrl() || getDefaultAuthApiBaseUrl();
    try {
      await acceptOperatorInvite({ apiBaseUrl, token: tokenRef.current, password, signal: controller.signal });
      tokenRef.current = null;
      try {
        const session = await signInOperatorWithPassword({ apiBaseUrl, email: lookup.operator.email, password, signal: controller.signal });
        establishSession(session, "Your owner account is ready.");
        router.replace("/", { scroll: false });
      } catch {
        if (!controller.signal.aborted) {
          setAcceptedEmail(lookup.operator.email);
          setStatus("invalid");
          setError(null);
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatus("ready");
        setError("Unable to activate this invite. Request a new invite link or try again.");
      }
    } finally {
      if (acceptControllerRef.current === controller) acceptControllerRef.current = null;
      acceptingRef.current = false;
    }
  }, [establishSession, lookup, router]);

  if (acceptedEmail) {
    return <SignInRoute key="invite-accepted-sign-in" initialEmail={acceptedEmail} initialMessage="Your invite is active. Sign in with your new password to continue." destinationOverride="/" />;
  }

  return <InviteAcceptancePage status={status} lookup={lookup} error={error} onAccept={(password, confirmation) => { void accept(password, confirmation); }} />;
}
