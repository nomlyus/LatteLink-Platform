import "react-native-gesture-handler";
import "../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { Stack, usePathname, useRootNavigationState } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { handleURLCallback } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { InteractionManager, Linking, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MOBILE_API_ENVIRONMENT } from "../src/api/client";
import { AuthSessionProvider, useAuthSession } from "../src/auth/session";
import { CartProvider } from "../src/cart/store";
import { CheckoutFlowProvider } from "../src/orders/flow";
import { useOrdersRealtimeSync } from "../src/orders/useOrdersRealtimeSync";
import { uiPalette } from "../src/ui/system";
import { usePushNotificationRegistration } from "../src/notifications/usePushNotificationRegistration";
import { prefetchCatalogQueries } from "../src/menu/catalog";
import { LocationProvider, useLocationContext } from "../src/location/LocationProvider";
import { canStartLocationSensitiveQueries } from "../src/location/model";
import { StartupCatalogGate } from "../src/startup/StartupGate";

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
    release: `${Constants.expoConfig?.slug ?? "mobile"}@${Constants.expoConfig?.version ?? "unknown"}`,
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
  const location = useLocationContext();
  const canStartLocationSensitiveData = canStartLocationSensitiveQueries(location);
  usePushNotificationRegistration(isAuthenticated);
  useOrdersRealtimeSync(isAuthenticated);

  useEffect(() => {
    if (!canStartLocationSensitiveData) {
      return;
    }
    if (!location.selectedLocationId) return;
    prefetchCatalogQueries(queryClient, { brandId: location.brandId, locationId: location.selectedLocationId });
  }, [canStartLocationSensitiveData, location.brandId, location.selectedLocationId]);

  return null;
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

    void Linking.getInitialURL()
      .then((url) => handleStripeDeepLink(url))
      .catch(() => {
        // Some native launch contexts cannot provide an initial URL.
      });
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
              <CartProvider>
                <CheckoutFlowProvider>
                  <LocationProvider>
                    <StartupCatalogGate onReadyToDisplay={hideSplash}>
                      <AppInitializer />
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
                    </StartupCatalogGate>
                  </LocationProvider>
                </CheckoutFlowProvider>
              </CartProvider>
            </AuthSessionProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
