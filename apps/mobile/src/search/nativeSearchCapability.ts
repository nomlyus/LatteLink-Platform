import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/** Check before importing Expo UI: older installed clients do not contain its views. */
export function supportsNativeSearchScene() {
  return Platform.OS === "ios" &&
    (requireOptionalNativeModule<{ nativeSearchSceneVersion?: number }>("NomlyGlass")?.nativeSearchSceneVersion ?? 0) >= 1 &&
    requireOptionalNativeModule("ExpoUI") !== null;
}
