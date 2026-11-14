import { Button, Host, LabeledContent, Section, Stepper, Text as NativeText, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, disabled, dynamicTypeSize, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CartCustomization } from "../cart/model";
import { uiPalette } from "../ui/system";
import { formatUsd, type MenuItem } from "./catalog";
import { MenuItemArtwork } from "./MenuItemArtwork";
import { findGroupIssue } from "./customizationSelection";
import { CustomizationGroupSection } from "./CustomizationGroupSection";
import { MenuItemNotes } from "./MenuItemNotes";
import { MenuCustomizeToolbar, menuCustomizeToolbarAvailable } from "./MenuCustomizeToolbar";
import type { CustomizationValidationIssue, MenuItemCustomizationGroup, MenuItemCustomizationOption } from "@lattelink/contracts-catalog";

export type NativeMenuCustomizeContentProps = {
  item: MenuItem;
  customization: CartCustomization;
  quantity: number;
  maxQuantity: number;
  unitPriceCents: number;
  customizationDeltaCents: number;
  totalCents: number;
  issues: CustomizationValidationIssue[];
  cartLocationError: string | null;
  canAddToCart: boolean;
  onSelectOption: (group: MenuItemCustomizationGroup, option: MenuItemCustomizationOption) => void;
  onNotesChange: (notes: string) => void;
  onQuantityChange: (quantity: number) => void;
  onAddToCart: () => void;
  onImageReady: () => void;
};

/** One scroll view carries artwork, glass customization cards and native controls without nested scrolling. */
export function NativeMenuCustomizeContent(props: NativeMenuCustomizeContentProps) {
  const { item, customization } = props;
  const insets = useSafeAreaInsets();
  const [contentWidth, setContentWidth] = useState(0);
  return <>
    <Stack.Screen options={{ title: "" }} />
    {menuCustomizeToolbarAvailable && contentWidth > 0 ? <MenuCustomizeToolbar quantity={props.quantity} maxQuantity={props.maxQuantity}
      contentWidth={contentWidth}
      totalCents={props.totalCents} canAddToCart={props.canAddToCart}
      onQuantityChange={props.onQuantityChange} onAddToCart={props.onAddToCart} /> : null}
    <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets
      onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <MenuItemArtwork item={item} unitPriceCents={props.unitPriceCents} onReady={props.onImageReady} />
      <View style={styles.customizationCards}>
        {item.customizationGroups.map((group) => <CustomizationGroupSection key={group.id}
          group={group} customization={customization}
          validationMessage={findGroupIssue(props.issues, group.id)?.message}
          onSelectOption={(option) => props.onSelectOption(group, option)} />)}
      </View>
      <MenuItemNotes value={customization.notes} onChangeText={props.onNotesChange} />
      <Host matchContents={{ vertical: true }} ignoreSafeArea="container" style={styles.controls} seedColor={uiPalette.primary} modifiers={[dynamicTypeSize("large")] }>
      <VStack spacing={24} modifiers={[padding()]}>
        <Section>
          {!menuCustomizeToolbarAvailable ? <Stepper label={`Quantity: ${props.quantity}`} value={props.quantity} min={1} max={props.maxQuantity} onValueChange={props.onQuantityChange} /> : null}
          <LabeledContent label="Customization"><NativeText>{formatUsd(props.customizationDeltaCents)}</NativeText></LabeledContent>
          <LabeledContent label="Total"><NativeText>{formatUsd(props.totalCents)}</NativeText></LabeledContent>
        </Section>
        {props.issues.length || props.cartLocationError ? <Section>
          {props.issues.length ? <NativeText modifiers={[foregroundStyle("red")]}>{props.issues[0].message}</NativeText> : null}
          {props.cartLocationError ? <NativeText modifiers={[foregroundStyle("red")]}>{props.cartLocationError}</NativeText> : null}
        </Section> : null}
        {!menuCustomizeToolbarAvailable ? <Section>
          <Button label={`Add to Cart · ${formatUsd(props.totalCents)}`} onPress={props.onAddToCart}
            modifiers={[buttonStyle("glassProminent"), controlSize("large"), disabled(!props.canAddToCart)]} />
        </Section> : null}
      </VStack>
      </Host>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "transparent" },
  controls: { width: "100%" },
  customizationCards: { paddingHorizontal: 20 }
});
