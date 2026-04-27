import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  resolveAppConfigData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useHomeNewsCardsQuery,
  useStoreConfigQuery
} from "../menu/catalog";
import { isBackendReachabilityError } from "../api/client";
import { SectionHeader } from "../components";
import { TAB_BAR_HEIGHT, getTabBarBottomOffset } from "../navigation/tabBarMetrics";
import { Button, GlassCard, ScreenBackdrop, TabBarDepthBackdrop, uiPalette, uiTypography } from "../ui/system";

const HEADER_TOP_PADDING = 8;
const HEADER_EXPANDED_HEIGHT = 144;
const HEADER_COLLAPSED_HEIGHT = 92;
const HEADER_SNAP_VELOCITY_THRESHOLD = 0.2;
const HEADER_SNAP_EDGE_TOLERANCE = 2;

type NewsLabel = string;

function canUseLiquidGlassTag() {
  if (Platform.OS !== "ios") return false;

  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function HomeNewsTag({ label }: { label: NewsLabel }) {
  const useLiquidGlass = canUseLiquidGlassTag();

  const content = (
    <View
      style={[
        styles.newsLabelInner,
        useLiquidGlass
          ? styles.newsLabelInnerGlass
          : styles.newsLabelInnerFallback
      ]}
    >
      <Text style={styles.newsLabelText}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.newsLabelShell}>
      {useLiquidGlass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme="auto"
          isInteractive
          style={styles.newsLabelFrame}
        >
          {content}
        </GlassView>
      ) : (
        <BlurView tint="light" intensity={Platform.OS === "ios" ? 24 : 20} style={styles.newsLabelFrame}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appConfigQuery = useAppConfigQuery();
  const homeNewsCardsQuery = useHomeNewsCardsQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const appConfig = resolveAppConfigData(appConfigQuery.data);
  const headerBackgroundColor = appConfig.header.background || uiPalette.background;
  const headerForegroundColor = appConfig.header.foreground ?? uiPalette.text;
  const homeNewsCards = homeNewsCardsQuery.data?.cards ?? [];
  const storeConfig = resolveStoreConfigData(storeConfigQuery.data);
  const hasBlockingHomeError =
    (!!appConfigQuery.error && !appConfigQuery.data) ||
    (!!homeNewsCardsQuery.error && !homeNewsCardsQuery.data) ||
    (!!storeConfigQuery.error && !storeConfigQuery.data);
  const homeErrorMessage =
    [appConfigQuery.error, homeNewsCardsQuery.error, storeConfigQuery.error].some(isBackendReachabilityError)
      ? "Unable to reach backend. Pull to refresh or try again in a moment."
      : "We couldn’t load the live store details. Pull to refresh or try again in a moment.";
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollY = useSharedValue(0);
  const dockBottom = getTabBarBottomOffset(insets.bottom > 0);
  const contentBottomInset = dockBottom + TAB_BAR_HEIGHT + 24;
  const headerExpandedHeight = insets.top + HEADER_EXPANDED_HEIGHT;
  const headerCollapsedHeight = insets.top + HEADER_COLLAPSED_HEIGHT;
  const headerCollapseDistance = headerExpandedHeight - headerCollapsedHeight;

  const setScrollViewRef = useCallback((node: ScrollView | null) => {
    scrollViewRef.current = node;
  }, []);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, headerCollapseDistance],
      [headerExpandedHeight, headerCollapsedHeight],
      Extrapolation.CLAMP
    )
  }));

  const titleStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(scrollY.value, [0, headerCollapseDistance], [16, 6], Extrapolation.CLAMP),
    fontSize: interpolate(scrollY.value, [0, headerCollapseDistance], [40, 28], Extrapolation.CLAMP),
    lineHeight: interpolate(scrollY.value, [0, headerCollapseDistance], [46, 32], Extrapolation.CLAMP),
    letterSpacing: interpolate(scrollY.value, [0, headerCollapseDistance], [-1.4, -0.9], Extrapolation.CLAMP)
  }));

  const headerContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, headerCollapseDistance], [-8, 0], Extrapolation.CLAMP) }]
  }));

  const menuLinkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 18, 42], [1, 0.35, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(scrollY.value, [0, 42], [0, 12], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 42], [1, 0.96], Extrapolation.CLAMP) }
    ]
  }));

  const storeRailStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(scrollY.value, [0, headerCollapseDistance], [16, 10], Extrapolation.CLAMP),
    paddingBottom: interpolate(scrollY.value, [0, headerCollapseDistance], [2, 0], Extrapolation.CLAMP)
  }));

  const storeTitleStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(scrollY.value, [0, headerCollapseDistance], [2, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, headerCollapseDistance], [0, -10], Extrapolation.CLAMP) }]
  }));

  const snapHeader = useCallback(
    (offsetY: number, velocityY = 0) => {
      if (offsetY <= HEADER_SNAP_EDGE_TOLERANCE || offsetY >= headerCollapseDistance - HEADER_SNAP_EDGE_TOLERANCE) {
        return;
      }

      let targetOffset = offsetY >= headerCollapseDistance / 2 ? headerCollapseDistance : 0;

      if (velocityY > 0.15) {
        targetOffset = headerCollapseDistance;
      } else if (velocityY < -0.15) {
        targetOffset = 0;
      }

      scrollViewRef.current?.scrollTo({ y: targetOffset, animated: true });
    },
    [headerCollapseDistance]
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityY = event.nativeEvent.velocity?.y ?? 0;

      if (Math.abs(velocityY) >= HEADER_SNAP_VELOCITY_THRESHOLD) {
        return;
      }

      snapHeader(event.nativeEvent.contentOffset.y, velocityY);
    },
    [snapHeader]
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      snapHeader(event.nativeEvent.contentOffset.y);
    },
    [snapHeader]
  );

  const handleRefresh = useCallback(() => {
    if (isManualRefresh) return;

    setIsManualRefresh(true);
    void Promise.allSettled([appConfigQuery.refetch(), homeNewsCardsQuery.refetch(), storeConfigQuery.refetch()]).finally(() => {
      setIsManualRefresh(false);
    });
  }, [appConfigQuery, homeNewsCardsQuery, isManualRefresh, storeConfigQuery]);

  if (hasBlockingHomeError) {
    return (
      <View style={styles.screen}>
        <ScreenBackdrop />
        <View style={[styles.errorShell, { paddingTop: insets.top + 88, paddingBottom: contentBottomInset }]}>
          <SectionHeader label="Home" />
          <Text style={styles.errorTitle}>Home temporarily unavailable.</Text>
          <Text style={styles.errorBody}>{homeErrorMessage}</Text>
          <Button label="Retry" variant="secondary" onPress={handleRefresh} style={styles.errorAction} />
        </View>
        <TabBarDepthBackdrop />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />

      <Animated.ScrollView
        ref={setScrollViewRef}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefresh}
            onRefresh={handleRefresh}
            tintColor={uiPalette.primary}
            colors={[uiPalette.primary]}
            progressBackgroundColor={uiPalette.surfaceStrong}
            progressViewOffset={insets.top + 12}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerExpandedHeight,
            paddingBottom: contentBottomInset
          }
        ]}
      >
        <View style={styles.cardGrid}>
          {homeNewsCards.map((item) => (
            <GlassCard key={item.title} style={styles.newsCard} contentStyle={styles.newsCardContent}>
              <View style={styles.newsCardHeader}>
                <HomeNewsTag label={item.label} />
              </View>

              <View style={styles.newsCopy}>
                <Text style={styles.newsTitle}>{item.title}</Text>
                <Text style={styles.newsBody}>{item.body}</Text>
              </View>

              <Text style={styles.newsNote}>{item.note}</Text>
            </GlassCard>
          ))}
        </View>
      </Animated.ScrollView>

      <Animated.View
        style={[styles.headerShell, { paddingTop: insets.top + HEADER_TOP_PADDING, backgroundColor: headerBackgroundColor }, headerStyle]}
      >
        <Animated.View style={headerContentStyle}>
          <View style={styles.hero}>
            <Animated.Text style={[styles.title, titleStyle, { color: headerForegroundColor }]}>{appConfig.brand.brandName}</Animated.Text>
          </View>

          <Animated.View style={[styles.storeRail, storeRailStyle]}>
            <View style={styles.storeCopy}>
              <Animated.Text style={[styles.storeTitle, storeTitleStyle, { color: headerForegroundColor }]}>{appConfig.brand.locationName}</Animated.Text>
            </View>

            <Animated.View style={menuLinkStyle}>
              <Pressable onPress={() => router.push("/(tabs)/menu")} style={styles.inlineLink}>
                <Text style={[styles.inlineLinkText, { color: headerForegroundColor }]}>Menu</Text>
                <Ionicons name="chevron-forward" size={16} color={headerForegroundColor} />
              </Pressable>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <TabBarDepthBackdrop />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: uiPalette.background
  },
  scrollContent: {
    paddingHorizontal: 20
  },
  headerShell: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    backgroundColor: uiPalette.background,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  hero: {
    paddingTop: 0
  },
  title: {
    marginTop: 16,
    fontSize: 40,
    lineHeight: 46,
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600",
    letterSpacing: -1.4
  },
  storeRail: {
    marginTop: 16,
    paddingBottom: 2,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16
  },
  storeCopy: {
    flex: 1
  },
  storeTitle: {
    marginTop: 2,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: 1.9,
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  inlineLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 2
  },
  inlineLinkText: {
    fontSize: 14,
    lineHeight: 18,
    color: uiPalette.text,
    fontWeight: "600"
  },
  cardGrid: {
    paddingTop: 8,
    gap: 14
  },
  errorShell: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center"
  },
  errorTitle: {
    marginTop: 20,
    fontSize: 28,
    lineHeight: 32,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    letterSpacing: -0.8
  },
  errorBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary,
    maxWidth: 320
  },
  errorAction: {
    marginTop: 20,
    alignSelf: "flex-start"
  },
  newsCard: {
    width: "100%",
    minHeight: 142
  },
  newsCardContent: {
    minHeight: 142,
    justifyContent: "space-between",
    gap: 14
  },
  newsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  newsLabelShell: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  newsLabelFrame: {
    borderRadius: 999,
    overflow: "hidden"
  },
  newsLabelInner: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1
  },
  newsLabelInnerGlass: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: "rgba(255,255,255,0.16)"
  },
  newsLabelInnerFallback: {
    backgroundColor: "rgba(255,255,255,0.36)",
    borderColor: "rgba(255,255,255,0.28)"
  },
  newsLabelText: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.1,
    fontWeight: "700",
    color: uiPalette.textSecondary
  },
  newsCopy: {
    gap: 6
  },
  newsTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    letterSpacing: -0.5
  },
  newsBody: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  newsNote: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textMuted,
    fontWeight: "500"
  },
});
