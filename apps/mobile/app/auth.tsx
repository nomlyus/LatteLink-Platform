import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { AppOwnership } from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthScreenRecoveryCopy } from "../src/auth/recovery";
import { useCustomerProfileQuery, isCustomerProfileComplete } from "../src/auth/profile";
import { useAppleExchangeMutation, useDevAccessMutation } from "../src/auth/useAuth";
import { generateAuthNonce } from "../src/auth/nonce";
import { useAuthSession } from "../src/auth/session";
import { MOBILE_API_ENVIRONMENT } from "../src/api/client";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

type ReturnToPath = "cart" | "/(tabs)/home" | "/(tabs)/orders" | "/(tabs)/account";
const DEFAULT_DEV_ACCESS_EMAIL = "dev@rawaq.local";
const DEFAULT_DEV_ACCESS_NAME = "Rawaq Dev";

function resolveReturnToPath(input: string | string[] | undefined): ReturnToPath | null {
  if (Array.isArray(input)) return resolveReturnToPath(input[0]);
  if (input === "cart" || input === "/(tabs)/home" || input === "/(tabs)/orders" || input === "/(tabs)/account") {
    return input;
  }
  return null;
}

function formatExpiresAt(expiresAt: string): string {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? expiresAt : date.toLocaleString();
}

function getReturnLabel(returnTo: ReturnToPath | null) {
  switch (returnTo) {
    case "cart":
      return "Return to Checkout";
    case "/(tabs)/orders":
      return "Return to Orders";
    case "/(tabs)/account":
      return "Return to Account";
    case "/(tabs)/home":
      return "Return Home";
    default:
      return "Continue";
  }
}

function extractApiErrorDetails(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "";
  if (!rawMessage) {
    return null;
  }

  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
      code?: string;
      message?: string;
      requestId?: string;
    };
    if (!parsed.code && !parsed.message) {
      return null;
    }

    return {
      code: parsed.code?.trim(),
      message: parsed.message?.trim(),
      requestId: parsed.requestId?.trim()
    };
  } catch {
    return null;
  }
}

function resolveAppleSignInErrorMessage(error: unknown) {
  const apiError = extractApiErrorDetails(error);
  const message = error instanceof Error ? error.message : "";

  if (message.includes("APPLE_SIGN_IN_NOT_CONFIGURED")) {
    return "Apple Sign In is not configured on the backend for this environment.";
  }

  if (message.includes("INVALID_APPLE_IDENTITY")) {
    return "Apple could not verify this sign-in response. Try again.";
  }

  if (message.includes("APPLE_TOKEN_EXCHANGE_FAILED")) {
    return "Apple Sign In could not finish exchanging credentials. Use a development build or TestFlight instead of Expo Go.";
  }

  if (apiError?.code || apiError?.message) {
    const segments = [apiError.code, apiError.message].filter(Boolean);
    const details = segments.join(": ");
    return apiError.requestId ? `${details} (request ${apiError.requestId})` : details;
  }

  return "Apple Sign In could not complete right now. Try again in a moment.";
}

function resolveDevAccessErrorMessage(error: unknown) {
  const apiError = extractApiErrorDetails(error);
  const message = error instanceof Error ? error.message : "";

  if (message.includes("DEV_CUSTOMER_ACCESS_DISABLED")) {
    return "Dev sign in is disabled on the backend for this environment.";
  }

  if (apiError?.code || apiError?.message) {
    const segments = [apiError.code, apiError.message].filter(Boolean);
    const details = segments.join(": ");
    return apiError.requestId ? `${details} (request ${apiError.requestId})` : details;
  }

  return "Dev sign in could not complete right now. Try again in a moment.";
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { session, isAuthenticated, isHydrating, authRecoveryState, profileSetupDeferred } = useAuthSession();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const appleExchange = useAppleExchangeMutation();
  const devAccess = useDevAccessMutation();
  const returnTo = useMemo(() => resolveReturnToPath(params.returnTo), [params.returnTo]);
  const topContentInset = insets.top + 52;
  const recoveryCopy = useMemo(() => getAuthScreenRecoveryCopy(authRecoveryState), [authRecoveryState]);
  const profileQuery = useCustomerProfileQuery(isAuthenticated && !isHydrating);
  const profile = profileQuery.data;
  const profileComplete = isCustomerProfileComplete(profile);
  const profileNeedsSetup = isAuthenticated && profileQuery.isSuccess && !profileComplete && !profileSetupDeferred;
  const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
  const devAccessEmail = process.env.EXPO_PUBLIC_DEV_SIGN_IN_EMAIL?.trim() || DEFAULT_DEV_ACCESS_EMAIL;
  const devAccessName = process.env.EXPO_PUBLIC_DEV_SIGN_IN_NAME?.trim() || DEFAULT_DEV_ACCESS_NAME;
  const apiEnvironmentBlocked = Boolean(MOBILE_API_ENVIRONMENT.apiConfigurationError);
  const appleSignInMessage = isExpoGo
    ? "Apple Sign In can't complete in Expo Go for this app. Use your dev build or TestFlight instead."
    : MOBILE_API_ENVIRONMENT.apiConfigurationError
      ? MOBILE_API_ENVIRONMENT.apiConfigurationError
      : appleExchange.isError
        ? resolveAppleSignInErrorMessage(appleExchange.error)
        : null;
  const devAccessMessage = __DEV__ && devAccess.isError ? resolveDevAccessErrorMessage(devAccess.error) : null;

  useEffect(() => {
    if (!isAuthenticated || isHydrating || profileQuery.isLoading) {
      return;
    }

    if (!profileQuery.isSuccess || profileNeedsSetup) {
      if (returnTo) {
        router.replace({ pathname: "/profile-setup", params: { returnTo } });
        return;
      }
      router.replace("/profile-setup");
    }
  }, [isAuthenticated, isHydrating, profileNeedsSetup, profileQuery.isLoading, profileQuery.isSuccess, returnTo, router]);

  useEffect(() => {
    if (!isAuthenticated || isHydrating || profileQuery.isLoading || !profileQuery.isSuccess || !profileComplete) {
      return;
    }

    continueIntoApp();
  }, [continueIntoApp, isAuthenticated, isHydrating, profileComplete, profileQuery.isLoading, profileQuery.isSuccess]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      if (cancelled) return;
      setAppleAvailable(available);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNativeAppleSignIn() {
    if (appleExchange.isPending || devAccess.isPending || apiEnvironmentBlocked) return;

    if (!appleAvailable || isExpoGo) {
      return;
    }

    try {
      appleExchange.reset();
      const safeNonce = generateAuthNonce();
      const credential = await AppleAuthentication.signInAsync({
        nonce: safeNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL
        ]
      });

      if (!credential.identityToken || !credential.authorizationCode) {
        return;
      }

      appleExchange.mutate({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        nonce: safeNonce
      });
    } catch (error) {
      const errorCode = (error as { code?: string } | null)?.code;
      if (errorCode === "ERR_REQUEST_CANCELED") {
        return;
      }
    }
  }

  function handleDevAccessSignIn() {
    if (devAccess.isPending || appleExchange.isPending || apiEnvironmentBlocked) {
      return;
    }

    devAccess.reset();
    devAccess.mutate({
      email: devAccessEmail,
      name: devAccessName
    });
  }

  function continueIntoApp() {
    const destination = returnTo === "cart" ? "/cart" : returnTo ?? "/(tabs)/menu";
    router.dismissTo(destination);
  }

  if (isHydrating) {
    return (
      <View style={styles.screen}>
        <View style={[styles.handleWrap, styles.handleWrapTop]}>
          <View style={styles.handle} />
        </View>
        <View style={[styles.centerContent, { paddingTop: topContentInset }]}>
          <Text style={styles.title}>Restoring your session…</Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={uiPalette.primary} />
            <Text style={styles.body}>Hydrating local credentials.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.handleWrap, styles.handleWrapTop]}>
        <View style={styles.handle} />
      </View>
      <View style={[styles.centerContent, { paddingTop: topContentInset }]}>
        {isAuthenticated ? (
          profileQuery.isLoading ? (
            <>
              <Text style={styles.title}>Checking your profile…</Text>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={uiPalette.primary} />
                <Text style={styles.body}>Preparing your account details.</Text>
              </View>
            </>
          ) : profileQuery.isError ? (
            <>
              <Text style={styles.title}>We could not load your profile.</Text>
              <Text style={styles.body}>We’ll open profile setup so you can continue.</Text>
            </>
          ) : profileNeedsSetup ? (
            <>
              <Text style={styles.title}>Finish your signup.</Text>
              <Text style={styles.body}>We need a profile setup step before you can enter the app.</Text>
            </>
          ) : profileComplete ? (
            <>
              <Text style={styles.title}>Returning…</Text>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={uiPalette.primary} />
                <Text style={styles.body}>Closing this sheet.</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>You’re signed in.</Text>
              <Text style={styles.body}>
                {session ? `Your session is active until ${formatExpiresAt(session.expiresAt)}.` : "Your account is ready to go."}
              </Text>
            </>
          )
        ) : (
          <>
            <Text style={styles.title}>{recoveryCopy.title}</Text>
            <Text style={styles.body}>{recoveryCopy.body}</Text>
          </>
        )}
      </View>

      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        {isAuthenticated ? (
          profileNeedsSetup ? (
            <Button label="Open Profile Setup" onPress={() => router.replace("/profile-setup")} />
          ) : profileQuery.isError ? (
            <Button label="Open Profile Setup" onPress={() => router.replace("/profile-setup")} />
          ) : profileComplete ? (
            <Button label="Returning…" variant="secondary" disabled />
          ) : (
            <Button label={getReturnLabel(returnTo)} onPress={continueIntoApp} />
          )
        ) : appleAvailable && !isExpoGo ? (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={18}
              style={styles.appleButton}
              onPress={handleNativeAppleSignIn}
            />
            {MOBILE_API_ENVIRONMENT.variant ? (
              <Text style={styles.environmentHint}>
                {MOBILE_API_ENVIRONMENT.variant} · {MOBILE_API_ENVIRONMENT.apiBaseUrl || "API blocked"}
              </Text>
            ) : null}
            {__DEV__ ? (
              <Button
                label={devAccess.isPending ? "Signing In…" : "Dev Sign In"}
                variant="secondary"
                onPress={handleDevAccessSignIn}
                disabled={devAccess.isPending || appleExchange.isPending}
              />
            ) : null}
            {appleSignInMessage ? <Text style={styles.notice}>{appleSignInMessage}</Text> : null}
            {devAccessMessage ? <Text style={styles.notice}>{devAccessMessage}</Text> : null}
          </>
        ) : (
          <>
            <Button
              label={isExpoGo ? "Use TestFlight or Dev Build" : "Sign In Unavailable"}
              variant="secondary"
              disabled
            />
            {MOBILE_API_ENVIRONMENT.variant ? (
              <Text style={styles.environmentHint}>
                {MOBILE_API_ENVIRONMENT.variant} · {MOBILE_API_ENVIRONMENT.apiBaseUrl || "API blocked"}
              </Text>
            ) : null}
            {__DEV__ ? (
              <Button
                label={devAccess.isPending ? "Signing In…" : "Dev Sign In"}
                onPress={handleDevAccessSignIn}
                disabled={devAccess.isPending || appleExchange.isPending}
              />
            ) : null}
            {appleSignInMessage ? <Text style={styles.notice}>{appleSignInMessage}</Text> : null}
            {devAccessMessage ? <Text style={styles.notice}>{devAccessMessage}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  handleWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handleWrapTop: {
    paddingTop: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  centerContent: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 100
  },
  title: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: uiPalette.text,
    textAlign: "center",
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  body: {
    marginTop: 12,
    maxWidth: 320,
    fontSize: 16,
    lineHeight: 24,
    color: uiPalette.textSecondary,
    textAlign: "center"
  },
  loadingRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  bottomDock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12
  },
  appleButton: {
    width: "100%",
    height: 54
  },
  notice: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary,
    textAlign: "center"
  },
  environmentHint: {
    fontSize: 12,
    lineHeight: 16,
    color: uiPalette.textMuted,
    textAlign: "center"
  }
});
