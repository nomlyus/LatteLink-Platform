import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { AppOwnership } from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { MOBILE_API_ENVIRONMENT } from "../api/client";
import { resolveAppleSignInErrorMessage } from "./presentation";
import { requestAppleSignIn } from "./requestAppleSignIn";
import { useAppleExchangeMutation } from "./useAuth";
import { useAuthSession } from "./session";

export function useAppleSignIn() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didSignIn, setDidSignIn] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const exchange = useAppleExchangeMutation();
  const { isHydrating } = useAuthSession();
  const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
  const configurationError = MOBILE_API_ENVIRONMENT.apiConfigurationError;

  useEffect(() => {
    mounted.current = true;
    void AppleAuthentication.isAvailableAsync().then(
      (supported) => { if (mounted.current) setAvailable(supported && !isExpoGo); },
      () => { if (mounted.current) setAvailable(false); }
    );
    return () => { mounted.current = false; };
  }, [isExpoGo]);

  async function signIn() {
    if (!available || isHydrating || configurationError || inFlight.current || !mounted.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setDidSignIn(false);
    try {
      exchange.reset();
      const credentials = await requestAppleSignIn();
      if (!credentials || !mounted.current) return;
      await exchange.mutateAsync(credentials);
      if (mounted.current) setDidSignIn(true);
    } catch (failure) {
      if (mounted.current) setError(resolveAppleSignInErrorMessage(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return { available, pending: pending || isHydrating, error: configurationError || error, didSignIn, signIn };
}
