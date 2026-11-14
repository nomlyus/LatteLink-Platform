import { useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { useCart } from "../cart/store";
import { CartAccessoryContent } from "./CartAccessory";
import { getCartAccessorySummary, getCartNavigationState } from "./cartAccessoryModel";

/** Older iOS/Android keep a regular cart action in screen layout, not a simulated tab bar. */
export function FallbackCartAccessory() {
  const { itemCount, subtotalCents } = useCart();
  const router = useRouter();
  if (!getCartNavigationState(itemCount, Platform.OS, Platform.Version).showFallbackAccessory) return null;
  return (
    <View style={styles.accessory}>
      <CartAccessoryContent
        fallback
        summary={getCartAccessorySummary(itemCount, subtotalCents)}
        onOpenCart={() => router.push("/cart")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  accessory: { height: 56, marginHorizontal: 12, marginBottom: 8 }
});
