import { Button, Form, HStack, Host, Section, Text as NativeText, TextField, type TextFieldRef } from "@expo/ui/swift-ui";
import { accessibilityLabel, autocorrectionDisabled, buttonStyle, disabled, dynamicTypeSize, foregroundStyle, keyboardType, listSectionMargins, scrollContentBackground, scrollDisabled, textInputAutocapitalization } from "@expo/ui/swift-ui/modifiers";
import { useEffect, useRef } from "react";
import type { DiscountCodeFieldProps } from "./DiscountCodeField";
import { uiPalette } from "../ui/system";

export function NativeDiscountCodeField({ value, onChange, disabled: isDisabled = false, onApply, applying, applied, error }: DiscountCodeFieldProps) {
  const field = useRef<TextFieldRef>(null);
  const displayedValue = useRef<string | null>(null);
  // Cart remains authoritative when a code is cleared or restored outside this field.
  useEffect(() => {
    if (displayedValue.current !== value) {
      displayedValue.current = value;
      void field.current?.setText(value);
    }
  }, [value]);

  // Form needs a bounded viewport inside Cart's scroll view; only the outer cart scrolls.
  return <Host style={{ height: error ? 132 : 80 }} seedColor={uiPalette.primary} modifiers={[dynamicTypeSize("large")]}>
    <Form modifiers={[scrollDisabled(), scrollContentBackground("hidden")]}>
    <Section modifiers={[listSectionMargins({ edges: "top", length: 12 })]}
      footer={error ? <NativeText modifiers={[foregroundStyle(uiPalette.danger)]}>{error}</NativeText> : undefined}>
    <HStack spacing={12}>
    <TextField ref={field} onTextChange={(text) => {
      displayedValue.current = text;
      onChange(text);
    }} placeholder="Enter code" modifiers={[
      accessibilityLabel("Discount code"),
      disabled(isDisabled || applying),
      autocorrectionDisabled(), textInputAutocapitalization("characters"), keyboardType("ascii-capable")
    ]} />
    <Button label={applying ? "Checking…" : applied ? "Applied" : "Apply"} onPress={onApply} modifiers={[
      buttonStyle("borderless"), disabled(isDisabled || applying || applied || !value.trim()), accessibilityLabel("Apply discount code")
    ]} />
    </HStack>
    </Section>
    </Form>
  </Host>;
}
