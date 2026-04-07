import "react-native-gesture-handler";
import "../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import * as SplashScreen from "expo-splash-screen";
import { Stack, usePathname, useRootNavigationState } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { InteractionManager, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthSessionProvider } from "../src/auth/session";
import { CartProvider } from "../src/cart/store";
import { CheckoutFlowProvider } from "../src/orders/flow";
import { uiPalette } from "../src/ui/system";

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

const MIN_SPLASH_DURATION_MS = 2400;
const SPLASH_FADE_DURATION_MS = 600;
const splashStartedAt = Date.now();

SplashScreen.setOptions({
  fade: true,
  duration: SPLASH_FADE_DURATION_MS
});

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const hasHiddenSplash = useRef(false);

  useEffect(() => {
    if (hasHiddenSplash.current) {
      return;
    }

    if (!navigationState?.key || !pathname || pathname === "/") {
      return;
    }

    const remainingDelay = Math.max(MIN_SPLASH_DURATION_MS - (Date.now() - splashStartedAt), 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        hasHiddenSplash.current = true;
        void SplashScreen.hideAsync();
      }, remainingDelay);
    });

    return () => {
      interaction.cancel();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [navigationState?.key, pathname]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={uiPalette.background} />
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>
            <AuthSessionProvider>
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
            </AuthSessionProvider>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
