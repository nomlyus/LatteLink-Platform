import { useRefresh } from "../ui/useRefresh";
import { ScreenState } from "../ui/ScreenState";
import { useInitialReveal } from "../ui/useInitialReveal";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import {
  Animated as RNAnimated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ScreenBackdrop, TabBarDepthBackdrop, uiPalette, uiTypography } from "../ui/system";
import {
  resolveMenuData,
  useAppConfigQuery,
  useMenuQuery,
  useStoreConfigQuery
} from "../menu/catalog";
import { isBackendReachabilityError } from "../api/client";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../navigation/tabBarMetrics";
import { useTabContentLayout } from "../navigation/tabContentLayout";
import { MenuItemRow, SectionHeader } from "../components";
import { buildMenuSections } from "../menu/presentation";
import { LoadingMenuState } from "../menu/MenuLoadingState";
import { nativeAppleHeaderCapabilities } from "../navigation/nativeAppleHeader";
import { useNativeScrollEdge } from "../navigation/useNativeScrollEdge";
import { MenuCategoryMenu } from "../menu/MenuCategoryMenu";
import { useMenuCategoryJump } from "../menu/useMenuCategoryJump";

export function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabLayout = useTabContentLayout();
  const nativeHeaderHeight = useHeaderHeight();
  const nativeScrollingHeader = nativeAppleHeaderCapabilities().available;
  const registerScrollEdge = useNativeScrollEdge(nativeScrollingHeader);
  const appConfigQuery = useAppConfigQuery();
  const menuQuery = useMenuQuery();
  const storeConfigQuery = useStoreConfigQuery();
  const isInitialLoading = menuQuery.isLoading && !menuQuery.data;
  const hasBlockingConfigError =
    (!!appConfigQuery.error && !appConfigQuery.data) || (!!storeConfigQuery.error && !storeConfigQuery.data);
  const hasBlockingMenuError = (!!menuQuery.error && !menuQuery.data) || hasBlockingConfigError;
  const menuErrorMessage = [menuQuery.error, appConfigQuery.error, storeConfigQuery.error].some(
    isBackendReachabilityError
  )
    ? "Unable to reach backend. Pull to refresh or try again in a moment."
    : "We couldn’t load the live menu and store details. Pull to refresh or try again in a moment.";
  const menu = isInitialLoading || hasBlockingMenuError ? null : resolveMenuData(menuQuery.data);
  const { loadingOpacity, showLoadingOverlay } = useInitialReveal(isInitialLoading || !menu);
  const dockBottom = getTabBarBottomOffset(insets.bottom > 0);
  const contentBottomInset = tabLayout?.contentBottomInset ?? dockBottom + TAB_BAR_HEIGHT + 24;
  const { refreshing: isManualRefresh, refresh: handleRefresh } = useRefresh([
    menuQuery.refetch,
    appConfigQuery.refetch,
    storeConfigQuery.refetch
  ]);
  const sections = useMemo(() => buildMenuSections(menu?.categories ?? []), [menu?.categories]);
  const categoryNavigation = useMenuCategoryJump(sections, nativeHeaderHeight, nativeScrollingHeader);

  if (!isInitialLoading && hasBlockingMenuError) {
    return (
      <View style={styles.screen}>
        <ScreenBackdrop />
        <View style={[styles.errorShell, { paddingTop: nativeHeaderHeight + 24, paddingBottom: contentBottomInset }]}>
          <SectionHeader label="Menu" />
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.errorTitle}>
            Menu temporarily unavailable.
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.errorBody}>
            {menuErrorMessage}
          </Text>
          <Button label="Retry" variant="secondary" onPress={handleRefresh} style={styles.errorAction} />
        </View>
        <TabBarDepthBackdrop />
        <MenuCategoryMenu categories={[]} selectedId={null} onSelect={categoryNavigation.jumpToCategory} />
      </View>
    );
  }

  return (
    <View style={styles.screen} collapsable={false}>
      {/* Native tabs discover scrolling through the first child chain; the root already paints the backdrop. */}
      <ScrollView
        ref={categoryNavigation.scrollRef}
        onScroll={categoryNavigation.onScroll}
        scrollEventThrottle={32}
        onLayout={registerScrollEdge}
        contentInsetAdjustmentBehavior={nativeScrollingHeader ? "automatic" : "never"}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefresh}
            onRefresh={handleRefresh}
            tintColor={uiPalette.primary}
            colors={[uiPalette.primary]}
            progressBackgroundColor={uiPalette.surfaceStrong}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: nativeScrollingHeader ? 12 : nativeHeaderHeight + 12,
            paddingBottom: contentBottomInset
          }
        ]}
      >
        {!isInitialLoading && !hasBlockingMenuError && sections.length === 0 ? <ScreenState title="Menu coming soon" message="There aren’t any items available at this location yet. Please check back later." /> : null}
        {sections.flatMap((section, sectionIndex) => {
          return [
            <View
              key={`${section.id}-header`}
              style={[styles.categoryHeader, sectionIndex === 0 && styles.firstCategoryHeader]}
              onLayout={(event) => categoryNavigation.onSectionLayout(section.id, event)}
            >
              <SectionHeader label={section.label} />
            </View>,
            (
              <View key={`${section.id}-list`} style={styles.sectionListBlock}>
                <View>
                  {section.items.map((item, index) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      isLast={index === section.items.length - 1}
                      onPress={(selectedItem) =>
                        router.push({ pathname: "/menu-customize", params: { itemId: selectedItem.id } })
                      }
                    />
                  ))}
                  {section.items.length === 0 ? (
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.emptyText}>
                      Nothing matches that search right now.
                    </Text>
                  ) : null}
                </View>
              </View>
            )
          ];
        })}
      </ScrollView>

      <TabBarDepthBackdrop />

      <MenuCategoryMenu categories={sections} selectedId={categoryNavigation.selectedId} onSelect={categoryNavigation.jumpToCategory} />

      {showLoadingOverlay ? (
        <RNAnimated.View pointerEvents="auto" style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <LoadingMenuState
            contentTopInset={nativeHeaderHeight + 12}
            contentBottomInset={contentBottomInset}
          />
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
  sectionListBlock: {
    marginTop: 0
  },
  categoryHeader: {
    marginTop: 14,
    paddingBottom: 10,
    backgroundColor: uiPalette.background
  },
  firstCategoryHeader: {
    marginTop: 4
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
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
