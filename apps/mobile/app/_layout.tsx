import "react-native-gesture-handler";
import "../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { handleURLCallback } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { Linking } from "react-native";
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
import { SystemAppearance } from "../src/ui/SystemAppearance";
import { menuCustomizeHeaderOptions } from "../src/menu/MenuCustomizeHeader";
import { cartHeaderOptions } from "../src/cart/CartNavigation";
import { accountSheetOptions, accountSignInHeaderOptions } from "../src/account/accountSheetOptions";
import { modalHeaderOptions } from "../src/navigation/modalHeaderOptions";

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

const SPLASH_FADE_DURATION_MS = 180;
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
  usePushNotificationRegistration(isAuthenticated);
  useOrdersRealtimeSync(isAuthenticated);

  return null;
}

function CatalogWarmup() {
  const location = useLocationContext();
  const canStartLocationSensitiveData = canStartLocationSensitiveQueries(location);

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
  const hasHiddenSplash = useRef(false);
  const hideSplash = useCallback(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync();
  }, []);

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
      .then((url) => handleStripeDeepLink(url ?? null))
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
        <SystemAppearance>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <AuthSessionProvider>
              <CartProvider>
                <CheckoutFlowProvider>
                  <LocationProvider>
                    {/* Warm independent data before app-config finishes; query keys deduplicate screen requests. */}
                    <CatalogWarmup />
                    <StartupCatalogGate onReadyToDisplay={hideSplash}>
                      <AppInitializer />
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: uiPalette.background }
                        }}
                      >
                        <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
                        <Stack.Screen name="dev" options={{ presentation: "formSheet", sheetAllowedDetents: [1], sheetGrabberVisible: false }} />
                        <Stack.Screen name="account/session" options={({ navigation }) => modalHeaderOptions("Session", () => navigation.goBack())} />
                        <Stack.Screen
                          name="cart"
                          options={{
                            ...cartHeaderOptions,
                            presentation: "formSheet",
                            sheetAllowedDetents: [1],
                            sheetGrabberVisible: false,
                            gestureEnabled: true,
                            contentStyle: { backgroundColor: "transparent" }
                          }}
                        />
                        <Stack.Screen
                          name="cart-sign-in"
                          options={{ ...accountSheetOptions(false), ...accountSignInHeaderOptions }}
                        />
                        <Stack.Screen
                          name="auth"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Sign in", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: "transparent" }
                          })}
                        />
                        <Stack.Screen
                          name="profile-setup"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Your profile", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: uiPalette.backgroundAlt }
                          })}
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
                            ...menuCustomizeHeaderOptions,
                            presentation: "formSheet",
                            sheetAllowedDetents: [1],
                            sheetGrabberVisible: false,
                            sheetExpandsWhenScrolledToEdge: true,
                            gestureEnabled: true,
                            contentStyle: { backgroundColor: "transparent" }
                          }}
                        />
                        <Stack.Screen
                          name="checkout-success"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Your order", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                          })}
                        />
                        <Stack.Screen
                          name="checkout-failure"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Payment", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                          })}
                        />
                        <Stack.Screen
                          name="refunds/[orderId]"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Order", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: uiPalette.surfaceStrong }
                          })}
                        />
                        <Stack.Screen
                          name="orders/[orderId]"
                          options={({ navigation }) => ({
                            ...modalHeaderOptions("Order", () => navigation.goBack()),
                            presentation: "modal",
                            animation: "slide_from_bottom",
                            contentStyle: { backgroundColor: "transparent" }
                          })}
                        />
                      </Stack>
                    </StartupCatalogGate>
                  </LocationProvider>
                </CheckoutFlowProvider>
              </CartProvider>
            </AuthSessionProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
        </SystemAppearance>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
