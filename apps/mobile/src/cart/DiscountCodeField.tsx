import { requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform, TextInput, View, Button, Text } from "react-native";
import { uiPalette } from "../ui/system";

export type DiscountCodeFieldProps = {
  value: string; onChange: (value: string) => void; disabled?: boolean;
  onApply: () => void; applying: boolean; applied: boolean; error?: string;
};

const NativeField = Platform.OS === "ios" && requireOptionalNativeModule("ExpoUI")
  // Keep SwiftUI native views out of Android and older development clients.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require("./NativeDiscountCodeField") as { NativeDiscountCodeField: ComponentType<DiscountCodeFieldProps> }).NativeDiscountCodeField
  : null;

export function DiscountCodeField(props: DiscountCodeFieldProps) {
  if (NativeField) return <NativeField {...props} />;
  return <View style={{ marginHorizontal: 20 }}><View style={{ flexDirection: "row", alignItems: "center" }}>
    <TextInput editable={!props.disabled && !props.applying} value={props.value} onChangeText={props.onChange} placeholder="Discount code"
    accessibilityLabel="Discount code" autoCapitalize="characters" autoCorrect={false}
    allowFontScaling={false} maxFontSizeMultiplier={1} placeholderTextColor={uiPalette.textSecondary}
    style={{ flex: 1, minHeight: 44, color: uiPalette.text, fontSize: 17 }} />
    <Button title={props.applying ? "Checking…" : props.applied ? "Applied" : "Apply"} onPress={props.onApply}
      disabled={props.disabled || props.applying || props.applied || !props.value.trim()} />
    </View>
    {props.error ? <Text accessibilityRole="alert" allowFontScaling={false} maxFontSizeMultiplier={1} style={{ color: uiPalette.danger }}>{props.error}</Text> : null}
  </View>;
}
