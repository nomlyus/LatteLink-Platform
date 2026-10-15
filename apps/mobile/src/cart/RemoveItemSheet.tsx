import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GlassActionPill } from "./GlassActionPill";
import { uiPalette, uiTypography } from "../ui/system";

type RemoveItemSheetProps = {
  open: boolean;
  itemName?: string;
  bottomInset: number;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RemoveItemSheet({
  open,
  itemName,
  bottomInset,
  onClose,
  onCancel,
  onConfirm
}: RemoveItemSheetProps) {
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const snapPoints = useMemo(() => ["50%"], []);
  const resolvedItemName = itemName ?? "This item";
  const bodyCopy = itemName
    ? `Are you sure you want to remove "${resolvedItemName}" from your cart?`
    : "Are you sure you want to remove this item from your cart?";

  useEffect(() => {
    if (open) {
      sheetRef.current?.snapToIndex(0);
      return;
    }

    sheetRef.current?.close();
  }, [open]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      animateOnMount={false}
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={false}
      handleComponent={() => null}
      onChange={(index) => {
        if (index === -1) {
          onClose();
        }
      }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.36}
          pressBehavior="close"
        />
      )}
      backgroundStyle={styles.sheet}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <View>
          <Text style={styles.title}>Remove Item?</Text>
          <Text style={styles.body}>{bodyCopy}</Text>
        </View>

        <View style={styles.actionsSpacer} />

        <View style={styles.actions}>
          <GlassActionPill label="Remove" onPress={onConfirm} tone="dark" />
          <GlassActionPill label="Close" onPress={onCancel} />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: uiPalette.surfaceStrong,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "700",
    textAlign: "center"
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 23,
    color: uiPalette.textSecondary
  },
  actionsSpacer: {
    flex: 1,
    minHeight: 28
  },
  actions: {
    gap: 10
  }
});
