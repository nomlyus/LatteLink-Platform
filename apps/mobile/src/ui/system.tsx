import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarBottomOffset } from "../navigation/tabBarMetrics";

export const uiPalette = {
  background: "#F7F4ED",
  backgroundAlt: "#F0ECE4",
  surfaceStrong: "#FFFDF8",
  surfaceMuted: "#F3EFE7",
  surfaceGlass: "rgba(255, 253, 248, 0.84)",
  card: "#FFFDF8",
  cardMuted: "#F7F2EA",
  text: "#171513",
  textSecondary: "#605B55",
  textMuted: "#9B9389",
  border: "rgba(23, 21, 19, 0.08)",
  borderStrong: "rgba(23, 21, 19, 0.14)",
  primary: "#1E1B18",
  primaryText: "#FFFFFF",
  accent: "#2D2823",
  accentSoft: "rgba(30, 27, 24, 0.06)",
  brass: "#8E7761",
  walnut: "#31261F",
  charcoal: "#1D1A17",
  glow: "rgba(255, 255, 255, 0.56)",
  warning: "#A46C2C",
  danger: "#B45B4F",
  success: "#4F7A63",
  chromeText: "#171513",
  chromeMuted: "#605B55"
} as const;

export const uiTypography = {
  displayFamily: Platform.select({ ios: undefined, android: "sans-serif-medium", default: undefined }),
  bodyFamily: Platform.select({ ios: undefined, android: "sans-serif", default: undefined }),
  monoFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" })
} as const;

export const uiRadii = {
  small: 16,
  medium: 22,
  large: 32,
  pill: 999
} as const;

export const uiShadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 4
  } as ViewStyle,
  dock: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 8
  } as ViewStyle
} as const;

type ScreenProps = {
  children: ReactNode;
  bottomInset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  stickyHeaderIndices?: number[];
};

export function ScreenScroll({
  children,
  bottomInset = 132,
  contentContainerStyle,
  refreshing = false,
  onRefresh,
  stickyHeaderIndices
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={stickyHeaderIndices}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={uiPalette.primary}
              colors={[uiPalette.primary]}
              progressBackgroundColor={uiPalette.surfaceStrong}
              progressViewOffset={insets.top + 12}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.screenContent,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + bottomInset
          },
          contentContainerStyle
        ]}
      >
        {children}
      </ScrollView>
      <TabBarDepthBackdrop />
    </View>
  );
}

type ScreenStaticProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ScreenStatic({ children, style }: ScreenStaticProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
      <View style={[styles.screenContent, { paddingTop: insets.top + 18 }, style]}>{children}</View>
      <TabBarDepthBackdrop />
    </View>
  );
}

export function ScreenBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.backdropBase]} />
    </View>
  );
}

export function TabBarDepthBackdrop() {
  const insets = useSafeAreaInsets();
  const dockBottom = getTabBarBottomOffset(insets.bottom > 0);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.tabBarDepthBelowFade, { height: dockBottom + 10 }]}>
        <LinearGradient
          colors={[
            "rgba(0, 0, 0, 0)",
            "rgba(0, 0, 0, 0.008)",
            "rgba(0, 0, 0, 0.03)",
            "rgba(0, 0, 0, 0.065)"
          ]}
          locations={[0, 0.62, 0.86, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.tabBarDepthGradient}
        />
      </View>
    </View>
  );
}

type TitleBlockProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function TitleBlock({ title, subtitle, action }: TitleBlockProps) {
  return (
    <View style={styles.titleWrap}>
      <View style={styles.titleCopy}>
        <Text style={styles.titleText}>{title}</Text>
        {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.titleAction}>{action}</View> : null}
    </View>
  );
}

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  muted?: boolean;
};

export function Card({ children, style, muted = false }: CardProps) {
  return <View style={[styles.card, muted ? styles.cardMuted : null, style]}>{children}</View>;
}

type GlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, style, contentStyle }: GlassCardProps) {
  const useLiquidGlass = canUseLiquidGlassCard();

  return (
    <View style={[styles.cardShell, style]}>
      {useLiquidGlass ? (
        <GlassView glassEffectStyle="regular" colorScheme="auto" isInteractive style={styles.cardFrame}>
          <View style={styles.cardGlassInner} />
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={30} style={styles.cardFrame}>
          <View style={styles.cardFallbackInner} />
        </BlurView>
      )}
      <View style={[styles.cardContent, contentStyle]}>{children}</View>
    </View>
  );
}

function canUseLiquidGlassCard() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  left?: ReactNode;
  right?: ReactNode;
};

export function Button({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  style,
  labelStyle,
  left,
  right
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        buttonVariantStyles[variant],
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style
      ]}
    >
      <View style={styles.buttonInner}>
        {left}
        <Text style={[styles.buttonText, buttonTextStyles[variant], labelStyle]}>{label}</Text>
        {right}
      </View>
    </Pressable>
  );
}

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, active = false, onPress, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : null,
        pressed ? styles.chipPressed : null,
        style
      ]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

const buttonVariantStyles = StyleSheet.create({
  primary: {
    backgroundColor: uiPalette.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  secondary: {
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  ghost: {
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: uiPalette.border
  }
});

const buttonTextStyles = StyleSheet.create({
  primary: { color: uiPalette.primaryText },
  secondary: { color: uiPalette.text },
  ghost: { color: uiPalette.text }
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  screenContent: {
    paddingHorizontal: 20
  },
  backdropBase: {
    backgroundColor: uiPalette.background
  },
  backdropGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(255,255,255,0.22)"
  },
  backdropWash: {
    position: "absolute",
    top: 116,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: "rgba(23, 21, 19, 0.06)"
  },
  tabBarDepthBelowFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0
  },
  tabBarDepthGradient: {
    ...StyleSheet.absoluteFillObject
  },
  titleWrap: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  titleCopy: {
    flex: 1
  },
  titleAction: {
    paddingTop: 4
  },
  titleText: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: uiPalette.chromeText,
    fontFamily: uiTypography.displayFamily
  },
  subtitleText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 23,
    color: uiPalette.chromeMuted,
    fontFamily: uiTypography.bodyFamily
  },
  card: {
    borderRadius: uiRadii.large,
    backgroundColor: uiPalette.card,
    borderWidth: 1,
    borderColor: uiPalette.border,
    padding: 20,
    ...uiShadow.card
  },
  cardMuted: {
    backgroundColor: uiPalette.cardMuted
  },
  cardShell: {
    borderRadius: uiRadii.large,
    overflow: "hidden",
    ...uiShadow.card
  },
  cardFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: uiRadii.large,
    overflow: "hidden"
  },
  cardGlassInner: {
    flex: 1,
    borderRadius: uiRadii.large,
    backgroundColor: "rgba(255, 252, 246, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)"
  },
  cardFallbackInner: {
    flex: 1,
    borderRadius: uiRadii.large,
    backgroundColor: uiPalette.surfaceGlass,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)"
  },
  cardContent: {
    padding: 20
  },
  buttonBase: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 16,
    justifyContent: "center"
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.992 }]
  },
  buttonInner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.05,
    fontFamily: uiTypography.bodyFamily
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: uiRadii.pill,
    backgroundColor: uiPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  chipActive: {
    backgroundColor: uiPalette.primary,
    borderColor: uiPalette.primary
  },
  chipPressed: {
    opacity: 0.88
  },
  chipText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: uiPalette.text,
    fontFamily: uiTypography.bodyFamily
  },
  chipTextActive: {
    color: uiPalette.primaryText
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: uiPalette.textSecondary,
    fontFamily: uiTypography.bodyFamily
  }
});
