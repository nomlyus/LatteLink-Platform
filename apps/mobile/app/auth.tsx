import * as AppleAuthentication from "expo-apple-authentication";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthScreenRecoveryCopy } from "../src/auth/recovery";
import { useAppleExchangeMutation } from "../src/auth/useAuth";
import { generateAuthNonce } from "../src/auth/nonce";
import { useAuthSession } from "../src/auth/session";
import { Button, uiPalette, uiTypography } from "../src/ui/system";

type ReturnToPath = "cart" | "/(tabs)/home" | "/(tabs)/orders" | "/(tabs)/account";

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

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { session, isAuthenticated, isHydrating, authRecoveryState } = useAuthSession();

  const [appleAvailable, setAppleAvailable] = useState(false);

  const appleExchange = useAppleExchangeMutation();
  const returnTo = useMemo(() => resolveReturnToPath(params.returnTo), [params.returnTo]);
  const topContentInset = insets.top + 52;
  const recoveryCopy = useMemo(() => getAuthScreenRecoveryCopy(authRecoveryState), [authRecoveryState]);

  useEffect(() => {
    if (!isAuthenticated || !returnTo) return;

    if (returnTo === "cart") {
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace("/cart");
      return;
    }

    router.replace(returnTo);
  }, [isAuthenticated, returnTo, router]);

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
    if (appleExchange.isPending) return;

    if (!appleAvailable) {
      return;
    }

    try {
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

  function continueIntoApp() {
    if (returnTo === "cart") {
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace("/cart");
      return;
    }

    router.replace(returnTo ?? "/(tabs)/menu");
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
          <>
            <Text style={styles.title}>You’re signed in.</Text>
            <Text style={styles.body}>
              {session ? `Your session is active until ${formatExpiresAt(session.expiresAt)}.` : "Your account is ready to go."}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>{recoveryCopy.title}</Text>
            <Text style={styles.body}>{recoveryCopy.body}</Text>
          </>
        )}
      </View>

      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        {isAuthenticated ? (
          <Button label={getReturnLabel(returnTo)} onPress={continueIntoApp} />
        ) : appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={18}
            style={styles.appleButton}
            onPress={handleNativeAppleSignIn}
          />
        ) : (
          <Button label="Sign In Unavailable" variant="secondary" disabled />
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
    paddingTop: 16
  },
  appleButton: {
    width: "100%",
    height: 54
  }
});
