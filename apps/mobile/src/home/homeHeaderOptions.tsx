import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { uiPalette } from "../ui/systemColors";

export function homeHeaderOptions(openOrders: () => void) {
  const controls = [
    { label: "Open notifications", symbol: "bell", icon: "notifications-outline", disabled: true, onPress: () => {} },
    { label: "Open orders", symbol: "list.bullet.rectangle", icon: "receipt-outline", disabled: false, onPress: openOrders }
  ] as const;
  return {
    unstable_headerLeftItems: () =>
      controls.map((control) => ({
        type: "button" as const,
        label: control.label,
        accessibilityLabel: control.label,
        icon: { type: "sfSymbol" as const, name: control.symbol },
        tintColor: uiPalette.chromeText,
        sharesBackground: true,
        disabled: control.disabled,
        onPress: control.onPress
      })),
    headerLeft: () => (
      <View style={styles.controls}>
        {controls.map((control) => (
          <Pressable
            key={control.icon}
            accessibilityRole="button"
            accessibilityLabel={control.label}
            disabled={control.disabled}
            onPress={control.onPress}
            style={styles.button}
          >
            <Ionicons name={control.icon} size={23} color={uiPalette.chromeText} />
          </Pressable>
        ))}
      </View>
    )
  };
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", gap: 12 },
  button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
});
