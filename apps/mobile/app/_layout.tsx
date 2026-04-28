import "react-native-gesture-handler";
import "../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { Stack, usePathname, useRootNavigationState } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { handleURLCallback } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, InteractionManager, Linking, StatusBar, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  MOBILE_API_ENVIRONMENT,
  UNABLE_TO_REACH_BACKEND_MESSAGE,
  isBackendReachabilityError
} from "../src/api/client";
import { AuthSessionProvider, useAuthSession } from "../src/auth/session";
import { CartProvider } from "../src/cart/store";
import { CheckoutFlowProvider } from "../src/orders/flow";
import { useOrdersRealtimeSync } from "../src/orders/useOrdersRealtimeSync";
import { Button, ScreenBackdrop, uiPalette, uiTypography } from "../src/ui/system";
import { usePushNotificationRegistration } from "../src/notifications/usePushNotificationRegistration";
import { prefetchCatalogQueries, useAppConfigQuery } from "../src/menu/catalog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false
    },
    mutations: {
      retry: false
    }
  }
});

const MIN_SPLASH_DURATION_MS = 650;
const SPLASH_FADE_DURATION_MS = 180;
const splashStartedAt = Date.now();
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: MOBILE_API_ENVIRONMENT.variant ?? (__DEV__ ? "development" : "unknown"),
    release: `${Constants.expoConfig?.slug ?? "lattelink-mobile"}@${Constants.expoConfig?.version ?? "unknown"}`,
    tracesSampleRate: 0.1
  });
}

SplashScreen.setOptions({
  fade: true,
  duration: SPLASH_FADE_DURATION_MS
});

void SplashScreen.preventAutoHideAsync();

function AppInitializer() {
  const { isAuthenticated } = useAuthSession();
  usePushNotificationRegistration(isAuthenticated);
  useOrdersRealtimeSync(isAuthenticated);

  useEffect(() => {
    prefetchCatalogQueries(queryClient);
  }, []);

  return null;
}

function StartupCatalogGate({
  children,
  onReadyToDisplay
}: {
  children: ReactNode;
  onReadyToDisplay: () => void;
}) {
  const appConfigQuery = useAppConfigQuery();
  const apiConfigurationError = MOBILE_API_ENVIRONMENT.apiConfigurationError;
  const hasBlockingError = Boolean(apiConfigurationError) || (!!appConfigQuery.error && !appConfigQuery.data);
  const isInitialLoading = appConfigQuery.isLoading && !appConfigQuery.data && !apiConfigurationError;
  const errorMessage = apiConfigurationError
    ? apiConfigurationError
    : isBackendReachabilityError(appConfigQuery.error)
      ? UNABLE_TO_REACH_BACKEND_MESSAGE
      : "Live store configuration could not be loaded. Retry before continuing.";

  useEffect(() => {
    if (!isInitialLoading) {
      onReadyToDisplay();
    }
  }, [isInitialLoading, onReadyToDisplay]);

  if (isInitialLoading) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <ActivityIndicator color={uiPalette.primary} />
          <Text style={styles.startupTitle}>Loading live store data</Text>
          <Text style={styles.startupBody}>Connecting to the configured backend before showing the app.</Text>
        </View>
      </View>
    );
  }

  if (hasBlockingError) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <Text style={styles.startupEyebrow}>Configuration required</Text>
          <Text style={styles.startupTitle}>App data unavailable.</Text>
          <Text style={styles.startupBody}>{errorMessage}</Text>
          <Button
            label="Retry"
            variant="secondary"
            disabled={Boolean(apiConfigurationError)}
            onPress={() => {
              void appConfigQuery.refetch();
            }}
            style={styles.startupAction}
          />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayout() {
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const hasHiddenSplash = useRef(false);
  const hideSplash = useCallback(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    hasHiddenSplash.current = true;
    const remainingDelay = Math.max(MIN_SPLASH_DURATION_MS - (Date.now() - splashStartedAt), 0);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void SplashScreen.hideAsync();
      }, remainingDelay);
    });
  }, []);

  useEffect(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    if (!navigationState?.key || !pathname || pathname === "/") {
      return;
    }

    hideSplash();
  }, [hideSplash, navigationState?.key, pathname]);

  useEffect(() => {
    const handleStripeDeepLink = async (url: string | null) => {
      if (!url) {
        return;
      }

      try {
        await handleURLCallback(url);
      } catch {
        // Ignore invalid Stripe callback attempts and allow the app router to continue normally.
      }
    };

    void Linking.getInitialURL().then((url) => handleStripeDeepLink(url));
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleStripeDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={uiPalette.background} />
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <AuthSessionProvider>
              <StartupCatalogGate onReadyToDisplay={hideSplash}>
                <AppInitializer />
                <CartProvider>
                  <CheckoutFlowProvider>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: uiPalette.background }
                      }}
                    >
                      <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                      <Stack.Screen
                        name="cart"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                      <Stack.Screen
                        name="auth"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                      <Stack.Screen
                        name="profile-setup"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                      <Stack.Screen
                        name="checkout"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                      <Stack.Screen
                        name="menu-customize"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                      <Stack.Screen
                        name="checkout-success"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                        }}
                      />
                      <Stack.Screen
                        name="checkout-failure"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                        }}
                      />
                      <Stack.Screen
                        name="refunds/[orderId]"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                        }}
                      />
                      <Stack.Screen
                        name="orders/[orderId]"
                        options={{
                          presentation: "modal",
                          animation: "slide_from_bottom",
                          contentStyle: { backgroundColor: "transparent" }
                        }}
                      />
                    </Stack>
                  </CheckoutFlowProvider>
                </CartProvider>
              </StartupCatalogGate>
            </AuthSessionProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  startupScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: uiPalette.background
  },
  startupCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceGlass,
    padding: 24,
    gap: 12
  },
  startupEyebrow: {
    color: uiPalette.warning,
    fontFamily: uiTypography.monoFamily,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  startupTitle: {
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8
  },
  startupBody: {
    color: uiPalette.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  startupAction: {
    marginTop: 8
  }
});

export default Sentry.wrap(RootLayout);
