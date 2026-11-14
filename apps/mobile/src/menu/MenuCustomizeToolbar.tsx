import { requireOptionalNativeModule } from "expo";
import { Stack } from "expo-router";
import { Button, GlassEffectContainer, HStack, Host, Text as NativeText } from "@expo/ui/swift-ui";
import { accessibilityLabel, buttonStyle, controlSize, disabled, dynamicTypeSize, font, foregroundStyle, frame, glassEffect, labelStyle, monospacedDigit } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uiPalette } from "../ui/system";
import { formatUsd } from "./catalog";

export const menuCustomizeToolbarAvailable = Platform.OS === "ios" && !!requireOptionalNativeModule("ExpoRouterToolbarModule");

export function MenuCustomizeToolbar({ quantity, maxQuantity, totalCents, canAddToCart, onQuantityChange, onAddToCart, contentWidth }: {
  quantity: number; maxQuantity: number; totalCents: number; canAddToCart: boolean;
  onQuantityChange: (quantity: number) => void; onAddToCart: () => void; contentWidth: number;
}) {
  const insets = useSafeAreaInsets();
  const groupWidth = Math.max(0, contentWidth - insets.left - insets.right - 48);
  const availableWidth = Math.max(0, groupWidth - 8);
  // Preserve 44-point targets on narrow screens, then use the requested 1:2 split.
  const quantityWidth = Math.max(112, availableWidth / 3);
  const addWidth = Math.max(0, availableWidth - quantityWidth);
  return <Stack.Toolbar placement="bottom">
    {/* UIKit must not overflow the purchase action independently of the quantity control. */}
    <Stack.Toolbar.View hidesSharedBackground>
      <Host style={[styles.control, { width: groupWidth }]} alignment="center" seedColor={uiPalette.primary} modifiers={[dynamicTypeSize("large")]}>
      <GlassEffectContainer spacing={0}>
      <HStack spacing={8} modifiers={[frame({ width: groupWidth, height: 44 })]}>
        <HStack spacing={0} modifiers={[frame({ width: quantityWidth, height: 44 }),
          glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
          foregroundStyle({ type: "hierarchical", style: "primary" })]}>
          <Button label="Decrease quantity" systemImage="minus" onPress={() => onQuantityChange(Math.max(1, quantity - 1))}
            modifiers={[buttonStyle("plain"), labelStyle("iconOnly"), frame({ width: 44, height: 44 }), disabled(quantity <= 1)]} />
          <NativeText modifiers={[font({ size: 17, weight: "semibold" }), monospacedDigit(), frame({ width: 24 }), accessibilityLabel(`Quantity: ${quantity}`)]}>{String(quantity)}</NativeText>
          <Button label="Increase quantity" systemImage="plus" onPress={() => onQuantityChange(Math.min(maxQuantity, quantity + 1))}
            modifiers={[buttonStyle("plain"), labelStyle("iconOnly"), frame({ width: 44, height: 44 }), disabled(quantity >= maxQuantity)]} />
        </HStack>
        <Button onPress={onAddToCart} modifiers={[buttonStyle("glassProminent"), controlSize("large"), frame({ width: addWidth, height: 44 }), disabled(!canAddToCart),
          accessibilityLabel(`Add ${quantity} ${quantity === 1 ? "item" : "items"} to cart, ${formatUsd(totalCents)}`)]}>
          <NativeText modifiers={[frame({ maxWidth: addWidth })]}>Add to Cart</NativeText>
        </Button>
      </HStack>
      </GlassEffectContainer>
      </Host>
    </Stack.Toolbar.View>
  </Stack.Toolbar>;
}

const styles = StyleSheet.create({
  control: { height: 44 }
});
