import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { uiPalette } from "../ui/systemColors";

/** Let UIKit size the account item identically across native stack headers. */
export function accountHeaderOptions(openAccount: () => void) {
  return {
    unstable_headerRightItems: () => [
      {
        type: "button" as const,
        label: "Account",
        accessibilityLabel: "Open account",
        icon: { type: "sfSymbol" as const, name: "person" as const },
        tintColor: uiPalette.chromeText,
        variant: "prominent" as const,
        sharesBackground: false,
        onPress: openAccount
      }
    ],
    headerRight: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account"
        onPress={openAccount}
        style={styles.button}
      >
        <Ionicons name="person-outline" size={23} color={uiPalette.chromeText} />
      </Pressable>
    )
  };
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
});
