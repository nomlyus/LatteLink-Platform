import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { AppOwnership } from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthScreenRecoveryCopy } from "../src/auth/recovery";
import { useCustomerProfileQuery, isCustomerProfileComplete } from "../src/auth/profile";
import { useAppleExchangeMutation, useDevAccessMutation } from "../src/auth/useAuth";
import { generateAuthNonce } from "../src/auth/nonce";
import { useAuthSession } from "../src/auth/session";
import { MOBILE_API_ENVIRONMENT } from "../src/api/client";
import { Button, uiPalette, uiTypography } from "../src/ui/system";
import {
  resolveReturnToPath,
  formatExpiresAt,
  getReturnLabel,
  resolveAppleSignInErrorMessage,
  resolveDevAccessErrorMessage
} from "../src/auth/presentation";

const DEFAULT_DEV_ACCESS_EMAIL = "dev@nomly.local";
const DEFAULT_DEV_ACCESS_NAME = "Dev Tester";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { session, isAuthenticated, isHydrating, authRecoveryState, profileSetupDeferred } = useAuthSession();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const appleExchange = useAppleExchangeMutation();
  const devAccess = useDevAccessMutation();
  const returnTo = useMemo(() => resolveReturnToPath(params.returnTo), [params.returnTo]);
  const continueIntoApp = useCallback(() => {
    const destination = returnTo === "cart" ? "/cart" : (returnTo ?? "/(tabs)/menu");
    router.dismissTo(destination);
  }, [returnTo, router]);
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
  }, [
    isAuthenticated,
    isHydrating,
    profileNeedsSetup,
    profileQuery.isLoading,
    profileQuery.isSuccess,
    returnTo,
    router
  ]);

  useEffect(() => {
    if (!isAuthenticated || isHydrating || profileQuery.isLoading || !profileQuery.isSuccess || !profileComplete) {
      return;
    }

    continueIntoApp();
  }, [continueIntoApp, isAuthenticated, isHydrating, profileComplete, profileQuery.isLoading, profileQuery.isSuccess]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const available = await AppleAuthentication.isAvailableAsync().catch(() => false);
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

  if (isHydrating) {
    return (
      <View style={styles.screen}>
        <View style={[styles.handleWrap, styles.handleWrapTop]}>
          <View style={styles.handle} />
        </View>
        <View style={[styles.centerContent, { paddingTop: topContentInset }]}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
            Restoring your session…
          </Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={uiPalette.primary} />
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
              Hydrating local credentials.
            </Text>
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
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                Checking your profile…
              </Text>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={uiPalette.primary} />
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                  Preparing your account details.
                </Text>
              </View>
            </>
          ) : profileQuery.isError ? (
            <>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                We could not load your profile.
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                We’ll open profile setup so you can continue.
              </Text>
            </>
          ) : profileNeedsSetup ? (
            <>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                Finish your signup.
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                We need a profile setup step before you can enter the app.
              </Text>
            </>
          ) : profileComplete ? (
            <>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                Returning…
              </Text>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={uiPalette.primary} />
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                  Closing this sheet.
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
                You’re signed in.
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
                {session
                  ? `Your session is active until ${formatExpiresAt(session.expiresAt)}.`
                  : "Your account is ready to go."}
              </Text>
            </>
          )
        ) : (
          <>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.title}>
              {recoveryCopy.title}
            </Text>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.body}>
              {recoveryCopy.body}
            </Text>
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
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.environmentHint}>
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
            {appleSignInMessage ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.notice}>
                {appleSignInMessage}
              </Text>
            ) : null}
            {devAccessMessage ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.notice}>
                {devAccessMessage}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Button
              label={isExpoGo ? "Use TestFlight or Dev Build" : "Sign In Unavailable"}
              variant="secondary"
              disabled
            />
            {MOBILE_API_ENVIRONMENT.variant ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.environmentHint}>
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
            {appleSignInMessage ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.notice}>
                {appleSignInMessage}
              </Text>
            ) : null}
            {devAccessMessage ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.notice}>
                {devAccessMessage}
              </Text>
            ) : null}
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
