import { useInitialReveal } from "../src/ui/useInitialReveal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { describeCustomizationSelection, priceMenuItemCustomization } from "@lattelink/contracts-catalog";
import { Animated as RNAnimated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../src/cart/store";
import { useLocationContext } from "../src/location/LocationProvider";
import {
  buildDefaultCustomization,
  DEFAULT_CUSTOMIZATION,
  resolveCartCustomization,
  type CartCustomization
} from "../src/cart/model";
import { CustomizationGroupSection } from "../src/menu/CustomizationGroupSection";
import { ProductImage, SimpleModalState } from "../src/menu/MenuCustomizeStates";
import { FooterPill, FooterQuantityPill } from "../src/menu/MenuCustomizeFooter";
import { formatUsd, resolveMenuData, useMenuQuery, type MenuItem } from "../src/menu/catalog";
import { CustomizeModalLoadingSheet } from "../src/menu/CustomizeModalLoadingSheet";
import { getTabBarBottomOffset, TAB_BAR_HEIGHT } from "../src/navigation/tabBarMetrics";
import { uiPalette, uiTypography } from "../src/ui/system";
import { updateCustomizationOption, findGroupIssue } from "../src/menu/customizationSelection";

const MAX_QUANTITY = 20;

function resolveItemId(input: string | string[] | undefined): string | null {
  if (Array.isArray(input)) return resolveItemId(input[0]);
  if (!input || input.trim().length === 0) return null;
  return input;
}

function findMenuItemById(itemId: string | null, items: MenuItem[]): MenuItem | null {
  if (!itemId) return null;
  return items.find((item) => item.id === itemId) ?? null;
}

export default function MenuCustomizeModalScreen() {
  const insets = useSafeAreaInsets();
  const footerBottom = getTabBarBottomOffset(insets.bottom > 0);
  const footerClearance = footerBottom + TAB_BAR_HEIGHT + 16;
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = useMemo(() => resolveItemId(params.itemId), [params.itemId]);

  const { addItem } = useCart();
  const location = useLocationContext();
  const menuQuery = useMenuQuery();
  const isInitialLoading = menuQuery.isLoading && !menuQuery.data;
  const menu = isInitialLoading ? null : resolveMenuData(menuQuery.data);
  const items = useMemo(() => menu?.categories.flatMap((category) => category.items) ?? [], [menu?.categories]);
  const item = useMemo(() => findMenuItemById(itemId, items), [itemId, items]);

  const [customization, setCustomization] = useState<CartCustomization>(DEFAULT_CUSTOMIZATION);
  const [quantity, setQuantity] = useState(1);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [cartLocationError, setCartLocationError] = useState<string | null>(null);
  const [readyHeroItemId, setReadyHeroItemId] = useState<string | null>(null);

  const heroReady = !item || !item.imageUrl || readyHeroItemId === item.id;
  const { loadingOpacity, showLoadingOverlay } = useInitialReveal(isInitialLoading || (Boolean(item) && !heroReady), {
    resetKey: itemId,
    skipAnimation: !item && !isInitialLoading
  });

  useEffect(() => {
    setCustomization(item ? buildDefaultCustomization(item.customizationGroups) : DEFAULT_CUSTOMIZATION);
    setQuantity(1);
    setShowValidationErrors(false);
  }, [item]);

  const resolvedCustomization = useMemo(
    () =>
      item
        ? resolveCartCustomization(item.customizationGroups, customization)
        : resolveCartCustomization([], customization),
    [customization, item]
  );
  const pricedCustomization = useMemo(
    () =>
      item
        ? priceMenuItemCustomization({
            basePriceCents: item.priceCents,
            quantity,
            groups: item.customizationGroups,
            selection: customization
          })
        : undefined,
    [customization, item, quantity]
  );
  const customizationDeltaCents = pricedCustomization?.customizationDeltaCents ?? 0;
  const selectedUnitPriceCents = pricedCustomization?.unitPriceCents ?? 0;
  const totalCents = pricedCustomization?.lineTotalCents ?? 0;
  const orderedGroupSelections = useMemo(() => {
    if (!item) {
      return resolvedCustomization.groupSelections;
    }

    const rankByGroupId = new Map(item.customizationGroups.map((group, index) => [group.id, index] as const));
    return [...resolvedCustomization.groupSelections].sort(
      (left, right) =>
        (rankByGroupId.get(left.groupId) ?? Number.MAX_SAFE_INTEGER) -
        (rankByGroupId.get(right.groupId) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [item, resolvedCustomization.groupSelections]);
  const customizationPreview = useMemo(
    () =>
      describeCustomizationSelection({
        selection: customization,
        groupSelections: orderedGroupSelections,
        includeNotes: false,
        fallback: ""
      }),
    [customization, orderedGroupSelections]
  );
  const priceLine = formatUsd(selectedUnitPriceCents);
  const metaLine = customizationPreview;

  function closeModal() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/menu");
  }

  function addSelectedItem() {
    if (!item || !item.available) return;
    if (!pricedCustomization?.valid) {
      setShowValidationErrors(true);
      return;
    }

    const result = addItem(
      {
        menuItemId: item.id,
        itemName: item.name,
        basePriceCents: item.priceCents,
        customizationGroups: item.customizationGroups,
        customization,
        quantity
      },
      location.selectedLocationId
    );

    if (!result.ok) {
      setCartLocationError(
        result.reason === "location_mismatch"
          ? "Your bag belongs to a different location. Clear it before adding items here."
          : "Choose an available location before adding this item."
      );
      return;
    }

    location.dismissCartInvalidatedNotice();
    closeModal();
  }

  if (item && !item.available && !showLoadingOverlay) {
    return (
      <SimpleModalState
        title="This item is currently unavailable."
        body="Return to the menu and choose another item."
        actionLabel="Back to Menu"
        onAction={closeModal}
      />
    );
  }

  if (!item && !showLoadingOverlay) {
    return (
      <SimpleModalState
        title="This item is unavailable."
        body="Return to the menu and choose another drink."
        actionLabel="Back to Menu"
        onAction={closeModal}
      />
    );
  }

  return (
    <View style={styles.backdrop}>
      {item ? (
        <View style={styles.sheet}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            bounces
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[styles.scrollContent, { paddingBottom: footerClearance }]}
          >
            <View style={styles.heroWrap}>
              <ProductImage imageUrl={item.imageUrl} onReady={() => setReadyHeroItemId(item.id)} />
            </View>

            <View style={styles.content}>
              <View style={styles.titleRow}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.title, styles.titleText]}>
                  {item.name}
                </Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.price}>
                  {priceLine}
                </Text>
              </View>
              {metaLine ? (
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.meta}>
                  {metaLine}
                </Text>
              ) : null}
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.description}>
                {item.description}
              </Text>

              <View>
                <View style={styles.customizationSectionsWrap}>
                  {item.customizationGroups.map((group) => (
                    <CustomizationGroupSection
                      key={group.id}
                      group={group}
                      customization={customization}
                      validationMessage={
                        showValidationErrors
                          ? findGroupIssue(resolvedCustomization.issues, group.id)?.message
                          : undefined
                      }
                      onSelectOption={(option) =>
                        setCustomization((prev) => updateCustomizationOption(prev, group, option))
                      }
                    />
                  ))}
                </View>

                <View style={styles.section}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>
                    Notes
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionBody}>
                    Optional instructions for the barista.
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1}
                    value={customization.notes}
                    onChangeText={(value) => setCustomization((prev) => ({ ...prev, notes: value }))}
                    placeholder="No foam, easy ice, half sweet..."
                    placeholderTextColor={uiPalette.textMuted}
                    style={styles.noteInput}
                    multiline
                  />
                </View>
              </View>

              <View style={styles.summarySection}>
                <View style={styles.summaryRow}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryLabel}>
                    Customization
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryValue}>
                    {formatUsd(customizationDeltaCents)}
                  </Text>
                </View>
                {showValidationErrors && !resolvedCustomization.valid ? (
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryError}>
                    {resolvedCustomization.issues[0]?.message ?? "Please finish the required selections."}
                  </Text>
                ) : null}
                {cartLocationError ? (
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryError}>
                    {cartLocationError}
                  </Text>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryLabel}>
                    Total
                  </Text>
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.summaryValueStrong}>
                    {formatUsd(totalCents)}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View pointerEvents="box-none" style={[styles.footerRow, { bottom: footerBottom }]}>
            <FooterPill style={styles.footerPrimaryPill}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add to cart"
                accessibilityState={{ disabled: !location.isReady || location.isSwitchingLocation }}
                onPress={addSelectedItem}
                disabled={!location.isReady || location.isSwitchingLocation}
                style={[styles.footerButton, styles.footerPrimaryButton]}
              >
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.footerPrimaryText}>
                  Add to Cart
                </Text>
              </Pressable>
            </FooterPill>
            <FooterQuantityPill
              style={styles.footerQuantityPill}
              quantity={quantity}
              canDecrease={quantity > 1}
              canIncrease={quantity < MAX_QUANTITY}
              onDecrease={() => setQuantity((prev) => Math.max(prev - 1, 1))}
              onIncrease={() => setQuantity((prev) => Math.min(prev + 1, MAX_QUANTITY))}
            />
          </View>
        </View>
      ) : null}

      {showLoadingOverlay ? (
        <RNAnimated.View pointerEvents="auto" style={[styles.loadingOverlay, { opacity: loadingOpacity }]}>
          <CustomizeModalLoadingSheet />
        </RNAnimated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "transparent"
  },
  sheet: {
    flex: 1,
    backgroundColor: "rgba(246, 247, 244, 0.98)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.border,
    overflow: "hidden"
  },
  scrollContent: {
    paddingBottom: 0
  },
  handleWrap: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(151, 160, 154, 0.52)"
  },
  heroWrap: {
    paddingHorizontal: 20,
    paddingTop: 36
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  titleText: {
    flex: 1
  },
  price: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 24,
    color: uiPalette.textSecondary,
    fontFamily: uiTypography.bodyFamily,
    fontWeight: "400"
  },
  meta: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    color: uiPalette.textSecondary
  },
  description: {
    marginTop: 22,
    fontSize: 15,
    lineHeight: 28,
    color: uiPalette.textSecondary
  },
  customizationSectionsWrap: {
    marginBottom: 18
  },
  section: {
    paddingTop: 24,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: uiPalette.text,
    fontWeight: "600"
  },
  sectionBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  noteInput: {
    marginTop: 14,
    minHeight: 112,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: "rgba(255,255,255,0.56)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.text,
    textAlignVertical: "top"
  },
  summarySection: {
    marginBottom: 24
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20
  },
  summaryRow: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: uiPalette.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  summaryLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.textSecondary
  },
  summaryValue: {
    fontSize: 14,
    lineHeight: 20,
    color: uiPalette.text,
    fontWeight: "600"
  },
  summaryValueStrong: {
    fontSize: 18,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "700"
  },
  summaryError: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#A55B3F"
  },
  footerRow: {
    position: "absolute",
    left: 18,
    right: 18,
    flexDirection: "row",
    gap: 8
  },
  footerPrimaryPill: {
    flex: 1.9
  },
  footerQuantityPill: {
    flex: 0.34,
    minWidth: 118
  },
  footerButton: {
    minHeight: 56,
    width: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  footerPrimaryButton: {
    flex: 1
  },
  footerPrimaryText: {
    fontSize: 17,
    lineHeight: 22,
    color: uiPalette.text,
    fontWeight: "600"
  }
});
