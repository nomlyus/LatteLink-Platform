import { Stack } from "expo-router";
import { uiPalette } from "../ui/system";

export type CartCheckoutToolbarProps = {
  label: string;
  value?: string;
  disabled: boolean;
  onPress: () => void;
  contentWidth: number;
};

/** Native iOS uses the platform file; older/non-iOS callers retain the existing action. */
export function CartCheckoutToolbar({ label, value, disabled, onPress }: CartCheckoutToolbarProps) {
  const title = value ? `${label} · ${value}` : label;
  return <Stack.Toolbar placement="bottom">
    <Stack.Toolbar.Spacer />
    <Stack.Toolbar.Button variant="prominent" disabled={disabled} onPress={onPress}
      accessibilityLabel={title} tintColor={uiPalette.primary}>{title}</Stack.Toolbar.Button>
    <Stack.Toolbar.Spacer />
  </Stack.Toolbar>;
}
