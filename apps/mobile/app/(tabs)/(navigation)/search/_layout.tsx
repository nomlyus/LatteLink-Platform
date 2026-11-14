import { Stack, useRouter } from "expo-router";
import { nativeAppleHeaderCapabilities } from "../../../../src/navigation/nativeAppleHeader";
import { nativeAppleSearchHeaderOptions } from "../../../../src/search/nativeAppleSearchHeaderOptions";

export default function SearchLayout() {
  const router = useRouter();
  const capabilities = nativeAppleHeaderCapabilities();
  // New clients initialize the sole native header here; older SwiftUI clients hide it upfront.
  const options = capabilities.available
    ? nativeAppleSearchHeaderOptions(() => router.push("/(tabs)/account"), capabilities.nativeBarMinimization)
    : { headerShown: false, title: "Search" };
  return <Stack screenOptions={options} />;
}
