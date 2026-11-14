import { useMenuImage } from "../menu/useMenuImage";
import { canUseLiquidGlass } from "../ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { useState, type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { uiPalette, uiTypography } from "../ui/system";
import { NativeCornerView } from "../ui/NativeCornerView";

export function CartSummaryRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.summaryText, emphasized ? styles.summaryStrong : null]}
      >
        {label}
      </Text>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.summaryText, emphasized ? styles.summaryStrong : null]}
      >
        {value}
      </Text>
    </View>
  );
}

export function CartStickyActionPill({
  label,
  value,
  icon,
  onPress,
  disabled = false
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View style={[styles.stickyPillInner, disabled ? styles.stickyPillInnerDisabled : null]}>
      <View style={styles.stickyPillLead}>
        <Ionicons name={icon} size={16} color={disabled ? uiPalette.textMuted : uiPalette.text} />
        <Text
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          style={[styles.stickyPillLabel, disabled ? styles.stickyPillLabelDisabled : null]}
        >
          {label}
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[styles.stickyPillValue, disabled ? styles.stickyPillValueDisabled : null]}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.stickyPillShell, pressed && !disabled ? styles.stickyPillPressed : null]}
    >
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.stickyPillFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="systemMaterial" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.stickyPillFrame}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

export function CartHeaderActionChip({
  label,
  icon,
  onPress
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View
      style={[
        styles.headerActionChipInner,
        useLiquidGlass ? styles.headerActionChipInnerGlass : styles.headerActionChipInnerFallback
      ]}
    >
      <Ionicons name={icon} size={13} color={uiPalette.textSecondary} />
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.headerActionChipText}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.headerActionChipShell, pressed ? styles.headerActionChipPressed : null]}
    >
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.headerActionChipFrame}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="systemMaterial" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.headerActionChipFrame}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}

export function CartQuantityControl({
  quantity,
  canDecrease,
  onDecrease,
  onIncrease,
  onRemove,
  disabled = false
}: {
  quantity: number;
  canDecrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const useLiquidGlass = canUseLiquidGlass();
  const content = (
    <View style={[styles.stepperInner, useLiquidGlass ? styles.stepperInnerGlass : styles.stepperInnerFallback]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={disabled}
        style={[styles.stepperButton, useLiquidGlass ? styles.stepperButtonGlass : null]}
        onPress={onIncrease}
      >
        <Ionicons name="add" size={16} color={uiPalette.text} />
      </Pressable>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.stepperValue}>
        {quantity}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        accessibilityState={{ disabled: disabled || !canDecrease }}
        disabled={disabled || !canDecrease}
        style={[
          styles.stepperButton,
          useLiquidGlass ? styles.stepperButtonGlass : null,
          !canDecrease ? styles.stepperButtonDisabled : null
        ]}
        onPress={onDecrease}
      >
        <Ionicons name="remove" size={16} color={uiPalette.text} />
      </Pressable>
      <View style={[styles.stepperDivider, useLiquidGlass ? styles.stepperDividerGlass : null]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove item"
        disabled={disabled}
        style={[styles.stepperButton, useLiquidGlass ? styles.stepperButtonGlass : null]}
        onPress={onRemove}
      >
        <Ionicons name="trash-outline" size={16} color={uiPalette.textSecondary} />
      </Pressable>
    </View>
  );

  return useLiquidGlass ? (
    <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.stepperShell}>
      {content}
    </GlassView>
  ) : (
    <BlurView tint="systemMaterial" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.stepperShell}>
      {content}
    </BlurView>
  );
}

export function CartSectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

function resolveItemIcon(name: string): keyof typeof Ionicons.glyphMap {
  const haystack = name.toLowerCase();
  if (haystack.includes("tea") || haystack.includes("matcha")) return "leaf-outline";
  if (["croissant", "cookie", "muffin", "pastry"].some((term) => haystack.includes(term))) return "nutrition-outline";
  if (["latte", "espresso", "coffee", "cappuccino"].some((term) => haystack.includes(term))) return "cafe-outline";
  return "sparkles-outline";
}

export function CartItemArtwork({ itemName, imageUrl }: { itemName: string; imageUrl?: string }) {
  const { activeImageUrl, imageFailed, onImageError } = useMenuImage(imageUrl, "list");
  const [rowHeight, setRowHeight] = useState(132);
  const [imageSize, setImageSize] = useState({ uri: "", ratio: 2 / 3 });
  const ratio = imageSize.uri === activeImageUrl ? imageSize.ratio : 2 / 3;

  return (
    <NativeCornerView style={[styles.itemIconWrap, { width: rowHeight * ratio }]}
      onLayout={({ nativeEvent }) => setRowHeight(nativeEvent.layout.height)} cornerMode="fixed" fallbackRadius={10}>
      {activeImageUrl && !imageFailed ? (
        <Image
          source={{ uri: activeImageUrl }}
          style={styles.itemArtwork}
          resizeMode="contain"
          onLoad={({ nativeEvent }) => {
            const { width, height } = nativeEvent.source;
            if (width > 0 && height > 0) setImageSize({ uri: activeImageUrl, ratio: width / height });
          }}
          onError={onImageError}
        />
      ) : (
        <Ionicons name={resolveItemIcon(itemName)} size={18} color={uiPalette.accent} />
      )}
    </NativeCornerView>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    color: uiPalette.text,
  },
  headerActionChipShell: { borderRadius: 999 },
  headerActionChipPressed: { opacity: 0.8 },
  headerActionChipFrame: { borderRadius: 999, overflow: "hidden" },
  headerActionChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  headerActionChipInnerGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent"
  },
  headerActionChipInnerFallback: {
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  headerActionChipText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: uiPalette.textSecondary },
  itemIconWrap: {
    maxWidth: "35%",
    flexShrink: 0,
    alignSelf: "stretch",
    marginVertical: 10,
    overflow: "hidden",
    backgroundColor: uiPalette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center"
  },
  itemArtwork: { ...StyleSheet.absoluteFill },
  stepperShell: { height: 40, borderRadius: 999, overflow: "hidden" },
  stepperInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    height: 40,
    borderRadius: 999
  },
  stepperInnerGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent"
  },
  stepperInnerFallback: {
    borderRadius: 999,
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiPalette.surfaceMuted
  },
  stepperButtonGlass: { backgroundColor: "transparent" },
  stepperButtonDisabled: { opacity: 0.55 },
  stepperValue: {
    minWidth: 16,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    color: uiPalette.text
  },
  stepperDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 3,
    borderRadius: 999,
    backgroundColor: uiPalette.border
  },
  stepperDividerGlass: { backgroundColor: uiPalette.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryText: { fontSize: 14, lineHeight: 22, color: uiPalette.textSecondary },
  summaryStrong: { fontWeight: "700", color: uiPalette.text },
  stickyPillShell: {
    minHeight: 60,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  stickyPillPressed: { opacity: 0.9 },
  stickyPillFrame: { minHeight: 60, borderRadius: 999, overflow: "hidden" },
  stickyPillInner: {
    minHeight: 60,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent"
  },
  stickyPillInnerDisabled: { backgroundColor: uiPalette.accentSoft },
  stickyPillLead: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  stickyPillLabel: { fontSize: 15, lineHeight: 18, fontWeight: "600", color: uiPalette.text },
  stickyPillLabelDisabled: { color: uiPalette.textMuted },
  stickyPillValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily
  },
  stickyPillValueDisabled: { color: uiPalette.textMuted }
});
