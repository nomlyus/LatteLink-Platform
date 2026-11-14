import { Stack, useRouter } from "expo-router";
import { accountHeaderOptions } from "../../../../src/navigation/accountHeaderOptions";
import { homeHeaderOptions } from "../../../../src/home/homeHeaderOptions";
import { tabDestinations } from "../../../../src/navigation/destinations";

export default function HomeLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerTitle: "",
        headerTransparent: true,
        headerShadowVisible: false,
        ...homeHeaderOptions(() => router.push(tabDestinations.orders)),
        ...accountHeaderOptions(() => router.push("/(tabs)/account"))
      }}
    />
  );
}
