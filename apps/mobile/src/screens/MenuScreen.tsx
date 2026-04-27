import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated as RNAnimated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  ScreenBackdrop,
  TabBarDepthBackdrop,
  uiPalette,
  uiTypography
} from "../ui/system";
import {
  resolveAppConfigData,
  resolveMenuData,
  resolveStoreConfigData,
  useAppConfigQuery,
  useMenuQuery,
  useStoreConfigQuery,
  type MenuCategory,
  type MenuItem
} from "../menu/catalog";
import { isBackendReachabilityError } from "../api/client";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../navigation/tabBarMetrics";
import { MenuItemRow, SectionHeader } from "../components";

type MenuSection = {
  id: string;
  label: string;
  items: MenuItem[];
};

const MENU_HEADER_TOP_PADDING = 0;
const MENU_HEADER_EXPANDED_HEIGHT = 124;
const MENU_HEADER_COLLAPSED_HEIGHT = 52;
const MENU_HEADER_SNAP_VELOCITY_THRESHOLD = 0.2;
const MENU_HEADER_SNAP_EDGE_TOLERANCE = 2;
const MENU_SECTION_HEADER_GAP = 30;

function LoadingBlock({
  width = "100%",
  height,
  radius = 12
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  return (
    <View
      style={[
        styles.loadingBlock,
        {
          width,
          height,
          borderRadius: radius
        }
      ]}
    />
  );
}

function LoadingMenuRow() {
  return (
    <View style={styles.menuRow}>
      <View style={styles.menuRowMain}>
        <View style={styles.menuImage} />
        <View style={[styles.menuBodyWrap, styles.menuBodyWrapWithDivider]}>
          <View style={styles.menuBodyContent}>
            <View style={styles.menuCopy}>
              <View style={styles.menuTitleRow}>
                <LoadingBlock width="48%" height={18} radius={9} />
                <LoadingBlock width={56} height={18} radius={9} />
              </View>
              <LoadingBlock width="82%" height={12} radius={6} />
              <LoadingBlock width="58%" height={12} radius={6} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function LoadingMenuState({
  headerExpandedHeight,
  contentBottomInset,
  insets
}: {
  headerExpandedHeight: number;
  contentBottomInset: number;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 820, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.56, 1])
  }));

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerExpandedHeight,
            paddingBottom: contentBottomInset
          }
        ]}
      >
        <Animated.View style={pulseStyle}>
          <View style={styles.sectionStickyHeader}>
            <View style={styles.sectionHeader}>
              <SectionHeader label="Featured" action={<Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />} />
            </View>
          </View>
          <View style={styles.sectionListBlock}>
            <View style={styles.sectionList}>
              <LoadingMenuRow />
              <LoadingMenuRow />
              <LoadingMenuRow />
            </View>
          </View>

          <View style={styles.sectionStickyHeader}>
            <View style={styles.sectionHeader}>
              <SectionHeader
                label="Espresso Bar"
                action={<Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />}
              />
            </View>
          </View>
          <View style={styles.sectionListBlock}>
            <View style={styles.sectionList}>
              <LoadingMenuRow />
              <LoadingMenuRow />
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.headerShell, { paddingTop: insets.top + MENU_HEADER_TOP_PADDING, height: headerExpandedHeight }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <View style={[styles.pickupMetaWrap, styles.loadingPickupMetaWrap]}>
              <Text style={styles.pickupMeta}>Estimated pick-up is 12 mins</Text>
            </View>
            <Text style={styles.locationText}>Ann Arbor, MI</Text>
          </View>
        </View>

        <View style={[styles.tabsWrap, styles.loadingTabsWrap]}>
          <View style={styles.tabRow}>
            <Text style={styles.activeTab}>Menu</Text>
          </View>
        </View>
      </View>

      <TabBarDepthBackdrop />
    </View>
  );
}

function buildSections(categories: MenuCategory[]): MenuSection[] {
  const allItems = categories.flatMap((category) => category.items);

  return [
    { id: "featured", label: "Featured", items: allItems.slice(0, 4) },
    ...categories.map((category) => ({
      id: category.id,
      label: category.title,
      items: category.items
    }))
  ];
}

function CollapsibleSectionHeader({
  label,
  collapsed,
  onPress
}: {
  label: string;
  collapsed: boolean;
  onPress: () => void;
}) {
  const rotation = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    rotation.value = withTiming(collapsed ? 1 : 0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [collapsed, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }]
  }));

  return (
    <Pressable onPress={onPress} style={styles.sectionStickyHeader}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          label={label}
          action={
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-up-outline" size={16} color={uiPalette.textMuted} />
            </Animated.View>
          }
        />
      </View>
    </Pressable>
  );
}

export function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appConfigQuery = useAppConfigQuery();
  const menuQuery = useMenuQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const isInitialLoading = menuQuery.isLoading && !menuQuery.data;
  const appConfig = appConfigQuery.data ? resolveAppConfigData(appConfigQuery.data) : null;
  const headerBackgroundColor = appConfig?.header.background ?? uiPalette.background;
  const headerForegroundColor = appConfig?.header.foreground ?? uiPalette.text;
  const storeConfig = storeConfigQuery.data ? resolveStoreConfigData(storeConfigQuery.data) : null;
  const hasBlockingConfigError =
    (!!appConfigQuery.error && !appConfigQuery.data) || (!!storeConfigQuery.error && !storeConfigQuery.data);
  const hasBlockingMenuError = (!!menuQuery.error && !menuQuery.data) || hasBlockingConfigError;
  const menuErrorMessage =
    [menuQuery.error, appConfigQuery.error, storeConfigQuery.error].some(isBackendReachabilityError)
      ? "Unable to reach backend. Pull to refresh or try again in a moment."
      : "We couldn’t load the live menu and store details. Pull to refresh or try again in a moment.";
  const menu = isInitialLoading || hasBlockingMenuError ? null : resolveMenuData(menuQuery.data);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const loadingOpacity = useRef(new RNAnimated.Value(1)).current;
  const scrollY = useSharedValue(0);
  const dockBottom = getTabBarBottomOffset(insets.bottom > 0);
  const contentBottomInset = dockBottom + TAB_BAR_HEIGHT + 24;
  const headerExpandedHeight = insets.top + MENU_HEADER_EXPANDED_HEIGHT;
  const headerCollapsedHeight = insets.top + MENU_HEADER_COLLAPSED_HEIGHT;
  const headerCollapseDistance = headerExpandedHeight - headerCollapsedHeight;
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [didFinishInitialReveal, setDidFinishInitialReveal] = useState(false);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const sections = useMemo(() => buildSections(menu?.categories ?? []), [menu?.categories]);
  const shouldShowInitialLoading = !didFinishInitialReveal && (isInitialLoading || !menu);

  const setScrollViewRef = useCallback((node: ScrollView | null) => {
    scrollViewRef.current = node;
  }, []);

  useEffect(() => {
    if (didFinishInitialReveal) return;

    if (shouldShowInitialLoading) {
      setShowLoadingOverlay(true);
      loadingOpacity.stopAnimation();
      loadingOpacity.setValue(1);
      return;
    }

    setShowLoadingOverlay(true);
    loadingOpacity.stopAnimation();
    RNAnimated.timing(loadingOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) return;
      setShowLoadingOverlay(false);
      setDidFinishInitialReveal(true);
    });
  }, [didFinishInitialReveal, loadingOpacity, shouldShowInitialLoading]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = Math.max(event.nativeEvent.contentOffset.y, 0);
      scrollY.value = offsetY;
    },
    [scrollY]
  );

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [0, headerCollapseDistance],
      [headerExpandedHeight, headerCollapsedHeight],
      Extrapolation.CLAMP
    )
  }));

  const pickupMetaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 20, 50], [1, 0.35, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, 50], [18, 0], Extrapolation.CLAMP),
    marginBottom: interpolate(scrollY.value, [0, 50], [6, 0], Extrapolation.CLAMP)
  }));

  const locationStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(scrollY.value, [0, headerCollapseDistance], [19, 17], Extrapolation.CLAMP),
    lineHeight: interpolate(scrollY.value, [0, headerCollapseDistance], [24, 18], Extrapolation.CLAMP),
    letterSpacing: interpolate(scrollY.value, [0, headerCollapseDistance], [2, 1.2], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, headerCollapseDistance], [0, -11], Extrapolation.CLAMP) }]
  }));

  const tabsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 36, 80], [1, 0.4, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, 80], [34, 0], Extrapolation.CLAMP),
    marginTop: interpolate(scrollY.value, [0, 80], [9, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP) }]
  }));

  const snapHeader = useCallback(
    (offsetY: number, velocityY = 0) => {
      if (offsetY <= MENU_HEADER_SNAP_EDGE_TOLERANCE || offsetY >= headerCollapseDistance - MENU_HEADER_SNAP_EDGE_TOLERANCE) {
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

      if (Math.abs(velocityY) >= MENU_HEADER_SNAP_VELOCITY_THRESHOLD) {
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
    void Promise.allSettled([menuQuery.refetch(), appConfigQuery.refetch(), storeConfigQuery.refetch()]).finally(() => {
      setIsManualRefresh(false);
    });
  }, [appConfigQuery, isManualRefresh, menuQuery, storeConfigQuery]);

  if (!isInitialLoading && hasBlockingMenuError) {
    return (
      <View style={styles.screen}>
        <ScreenBackdrop />
        <View style={[styles.errorShell, { paddingTop: insets.top + 88, paddingBottom: contentBottomInset }]}>
          <SectionHeader label="Menu" />
          <Text style={styles.errorTitle}>Menu temporarily unavailable.</Text>
          <Text style={styles.errorBody}>{menuErrorMessage}</Text>
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
        onScroll={handleScroll}
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
        {sections.flatMap((section) => {
          const isCollapsed = collapsedSections.has(section.id);
          return [
            <CollapsibleSectionHeader
              key={`${section.id}-header`}
              label={section.label}
              collapsed={isCollapsed}
              onPress={() => toggleSection(section.id)}
            />,
            isCollapsed ? null : (
              <View key={`${section.id}-list`} style={styles.sectionListBlock}>
                <View style={styles.sectionList}>
                  {section.items.map((item, index) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      isLast={index === section.items.length - 1}
                      onPress={(selectedItem) => router.push({ pathname: "/menu-customize", params: { itemId: selectedItem.id } })}
                    />
                  ))}
                  {section.items.length === 0 ? <Text style={styles.emptyText}>Nothing matches that search right now.</Text> : null}
                </View>
              </View>
            )
          ];
        })}
      </Animated.ScrollView>

      <Animated.View
        style={[styles.headerShell, { paddingTop: insets.top + MENU_HEADER_TOP_PADDING, backgroundColor: headerBackgroundColor }, headerStyle]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Animated.View style={[styles.pickupMetaWrap, pickupMetaStyle]}>
              <Text style={[styles.pickupMeta, { color: headerForegroundColor }]}>
                {storeConfig ? `Estimated pick-up is ${storeConfig.prepEtaMinutes} min` : "Estimated pick-up unavailable"}
              </Text>
            </Animated.View>
            <Animated.Text style={[styles.locationText, locationStyle, { color: headerForegroundColor }]}>
              {appConfig?.brand.locationName ?? "Store info unavailable"}
            </Animated.Text>
          </View>
        </View>

        <Animated.View style={[styles.tabsWrap, tabsStyle]}>
          <View style={styles.tabRow}>
            <Text style={[styles.activeTab, { color: headerForegroundColor }]}>Menu</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <TabBarDepthBackdrop />

      {showLoadingOverlay ? (
        <RNAnimated.View pointerEvents="auto" style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <LoadingMenuState headerExpandedHeight={headerExpandedHeight} contentBottomInset={contentBottomInset} insets={insets} />
        </RNAnimated.View>
      ) : null}
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
    zIndex: 10,
    paddingHorizontal: 20,
    backgroundColor: uiPalette.background,
    overflow: "hidden",
    justifyContent: "flex-end"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16
  },
  headerCopy: {
    flex: 1
  },
  pickupMetaWrap: {
    overflow: "hidden"
  },
  loadingPickupMetaWrap: {
    height: 18,
    marginBottom: 6
  },
  pickupMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  locationText: {
    marginTop: 3,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  tabsWrap: {
    overflow: "hidden"
  },
  loadingTabsWrap: {
    height: 34,
    marginTop: 9
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  activeTab: {
    fontSize: 28,
    lineHeight: 32,
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontWeight: "600"
  },
  sectionStickyHeader: {
    marginTop: MENU_SECTION_HEADER_GAP
  },
  sectionListBlock: {
    marginTop: 0
  },
  sectionHeader: {
    backgroundColor: uiPalette.background,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionList: {
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  menuRow: {
    minHeight: 132
  },
  menuRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    width: "100%"
  },
  menuImage: {
    width: 108,
    height: 132,
    backgroundColor: "#D5D4CE",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  menuBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: "center"
  },
  menuBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  menuBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  menuCopy: {
    justifyContent: "center",
    gap: 1
  },
  menuTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  loadingBlock: {
    backgroundColor: "rgba(219, 216, 207, 0.92)"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30
  },
  errorShell: {
    flex: 1,
    paddingHorizontal: 20
  },
  errorTitle: {
    marginTop: 12,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700"
  },
  errorBody: {
    marginTop: 10,
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 23,
    color: uiPalette.textSecondary
  },
  errorAction: {
    marginTop: 22,
    alignSelf: "flex-start"
  },
  emptyText: {
    paddingVertical: 20,
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  }
});
