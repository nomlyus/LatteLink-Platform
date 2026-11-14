import { Stack } from "expo-router";
import { useAuthSession } from "../../src/auth/session";
import { accountSheetOptions } from "../../src/account/accountSheetOptions";

export const unstable_settings = { initialRouteName: "(navigation)" };

export default function TabsLayout() {
  const { isAuthenticated } = useAuthSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(navigation)" />
      <Stack.Screen
        name="account"
        options={accountSheetOptions(isAuthenticated)}
      />
      <Stack.Screen name="home" options={{ animation: "none" }} />
      <Stack.Screen name="menu" options={{ animation: "none" }} />
      <Stack.Screen
        name="orders"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [1],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: true,
          gestureEnabled: true,
          contentStyle: { backgroundColor: "transparent" }
        }}
      />
    </Stack>
  );
}
