import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type HapticFeedback = "selection" | "impact" | "success" | "warning" | "error";

/** Optional feedback must never block navigation, authentication, or ordering. */
export async function hapticFeedback(feedback: HapticFeedback): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    if (!requireOptionalNativeModule("ExpoHaptics")) return;
    const haptics = await import("expo-haptics");
    if (Platform.OS === "android") {
      const effect = feedback === "selection" ? haptics.AndroidHaptics.Segment_Tick
        : feedback === "impact" ? haptics.AndroidHaptics.Context_Click
        : feedback === "success" ? haptics.AndroidHaptics.Confirm
        : haptics.AndroidHaptics.Reject;
      await haptics.performAndroidHapticsAsync(effect);
    } else if (feedback === "selection") {
      await haptics.selectionAsync();
    } else if (feedback === "impact") {
      await haptics.impactAsync(haptics.ImpactFeedbackStyle.Soft);
    } else {
      const type = feedback === "success" ? haptics.NotificationFeedbackType.Success
        : feedback === "warning" ? haptics.NotificationFeedbackType.Warning
        : haptics.NotificationFeedbackType.Error;
      await haptics.notificationAsync(type);
    }
  } catch {
    // Unsupported hardware, user settings, and older clients may provide no feedback.
  }
}
