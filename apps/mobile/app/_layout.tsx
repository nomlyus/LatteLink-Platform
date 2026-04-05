import "react-native-gesture-handler";
import "../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "react-native";
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

export default function RootLayout() {
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
                    <Stack.Screen name="(tabs)" />
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
