import { StyleSheet, Text, View } from "react-native";
import { describeCustomization, type CartItem } from "./model";
import { formatUsd } from "../menu/catalog";
import { CartItemArtwork, CartQuantityControl } from "./CartPrimitives";
import { uiPalette, uiTypography } from "../ui/system";

export function CartLineItem({
  item,
  imageUrl,
  isLast,
  onSetQuantity,
  onRemove
}: {
  item: CartItem;
  imageUrl?: string;
  isLast: boolean;
  onSetQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const customizationSummary = describeCustomization(item, { fallback: "Standard build" });
  const notes = item.customization.notes.trim();
  return (
    <View key={item.lineId}>
      <View style={styles.lineCard}>
        <View style={styles.lineTopRow}>
          <CartItemArtwork itemName={item.itemName} imageUrl={imageUrl} />

          <View style={[styles.lineBodyWrap, !isLast ? styles.lineBodyWrapWithDivider : null]}>
            <View style={styles.lineBodyContent}>
              <View style={styles.lineDetailColumn}>
                <View style={styles.lineHeaderRow}>
                  <View style={styles.lineCopy}>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemTitle}>
                      {item.itemName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1}
                      style={styles.itemBody}
                    >{`${customizationSummary} • ${formatUsd(item.unitPriceCents)} each`}</Text>
                    {notes ? (
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.itemNoteText}>
                        {notes}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.linePriceBlock}>
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.linePriceValue}>
                      {formatUsd(item.lineTotalCents)}
                    </Text>
                  </View>
                </View>

                <View style={styles.lineFooter}>
                  <CartQuantityControl
                    quantity={item.quantity}
                    canDecrease={item.quantity > 1}
                    onDecrease={() => {
                      if (item.quantity <= 1) {
                        return;
                      }
                      onSetQuantity(item.quantity - 1);
                    }}
                    onIncrease={() => onSetQuantity(item.quantity + 1)}
                    onRemove={() => onRemove()}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lineCard: {
    paddingHorizontal: 0,
    minHeight: 132,
    borderRadius: 0
  },
  lineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%"
  },
  lineBodyWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    justifyContent: "center"
  },
  lineBodyWrapWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiPalette.border
  },
  lineBodyContent: {
    minHeight: 132,
    justifyContent: "center",
    paddingVertical: 10
  },
  lineDetailColumn: {
    flex: 1,
    minHeight: 112,
    justifyContent: "space-between"
  },
  lineHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  lineCopy: {
    flex: 1
  },
  itemTitle: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "500"
  },
  itemBody: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: uiPalette.textSecondary
  },
  itemNoteText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: uiPalette.textMuted
  },
  linePriceBlock: {
    alignItems: "flex-end"
  },
  linePriceValue: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "400"
  },
  lineFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end"
  }
});
