import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { uiPalette, uiTypography } from "../ui/system";

export const ACCOUNT_HEADER_HEIGHT = 52;

export function AccountFloatingHeader({
  title,
  insetTop,
  onBack,
  backgroundColor,
  foregroundColor
}: {
  title: string;
  insetTop: number;
  onBack?: () => void;
  backgroundColor?: string;
  foregroundColor?: string;
}) {
  const bg = backgroundColor ?? uiPalette.background;
  const fg = foregroundColor ?? uiPalette.text;

  return (
    <View
      pointerEvents={onBack ? "auto" : "none"}
      style={[styles.pageHeaderFloating, { paddingTop: insetTop, height: insetTop + ACCOUNT_HEADER_HEIGHT, backgroundColor: bg }]}
    >
      <View style={styles.pageHeader}>
        <View style={styles.pageCopy}>
          <View style={styles.pageMetaSpacer} />
          <View style={styles.pageTitleRow}>
            {onBack ? (
              <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
                <Ionicons name="arrow-back" size={16} color={fg} />
              </Pressable>
            ) : null}
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.pageTitle, { color: fg }]}>{title}</Text>
          </View>
        </View>
      </View>
      <View style={styles.pageTabsSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    paddingBottom: 11
  },
  pageHeaderFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    backgroundColor: uiPalette.background,
    overflow: "hidden",
    justifyContent: "flex-end",
    zIndex: 10
  },
  pageCopy: {
    flex: 1
  },
  pageMetaSpacer: {
    height: 0,
    marginBottom: 0,
    overflow: "hidden"
  },
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  backButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  backButtonPressed: {
    opacity: 0.72
  },
  pageTabsSpacer: {
    height: 0,
    marginTop: 0
  },
  pageTitle: {
    marginTop: 3,
    fontSize: 17,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  }
});
