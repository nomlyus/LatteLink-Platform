import { Stack } from "expo-router";
import { Button, Host, Text as NativeText } from "@expo/ui/swift-ui";
import { accessibilityLabel, buttonStyle, controlSize, disabled, dynamicTypeSize, frame } from "@expo/ui/swift-ui/modifiers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uiPalette } from "../ui/system";
import type { CartCheckoutToolbarProps } from "./CartCheckoutToolbar";

export function CartCheckoutToolbar({ label, value, disabled: isDisabled, onPress, contentWidth }: CartCheckoutToolbarProps) {
  const insets = useSafeAreaInsets();
  // Use the sheet's measured width, leaving UIKit's native toolbar margins.
  const width = Math.max(0, contentWidth - insets.left - insets.right - 48);
  if (width === 0) return null;
  const title = value ? `${label} · ${value}` : label;
  return <Stack.Toolbar placement="bottom">
    <Stack.Toolbar.View hidesSharedBackground>
      <Host style={{ width, height: 52 }} seedColor={uiPalette.primary} modifiers={[dynamicTypeSize("large")]}>
        <Button onPress={onPress} modifiers={[
          buttonStyle("glassProminent"), controlSize("large"), disabled(isDisabled), accessibilityLabel(title)
        ]}>
          <NativeText modifiers={[frame({ maxWidth: Infinity })]}>{title}</NativeText>
        </Button>
      </Host>
    </Stack.Toolbar.View>
  </Stack.Toolbar>;
}
