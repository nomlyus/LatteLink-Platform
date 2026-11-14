import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { designPreviewsEnabled } from "../dev/previewEnabled";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uiPalette } from "../ui/system";
import { useCustomerProfileQuery } from "../auth/profile";
import { useAuthSession } from "../auth/session";
import { LoyaltyCard } from "../home/LoyaltyCard";

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthSession();
  const profileQuery = useCustomerProfileQuery(isAuthenticated);
  const customerName = isAuthenticated ? profileQuery.data?.name?.trim() || "Member" : "Guest";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 76 }]}>
      <LoyaltyCard
        customerName={customerName}
        memberSince={isAuthenticated ? (profileQuery.data?.memberSince ?? profileQuery.data?.createdAt) : undefined}
      />
      {designPreviewsEnabled ? <Pressable accessibilityRole="button" accessibilityLabel="Open development design previews"
        onPress={() => router.push("/dev")} style={styles.previewButton}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.previewLabel}>Design previews · Dev only</Text>
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  previewButton: { alignSelf: "center", marginTop: 24, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  previewLabel: { color: uiPalette.textSecondary, fontSize: 14 },
  screen: { flex: 1, backgroundColor: uiPalette.background, paddingHorizontal: 8 }
});
