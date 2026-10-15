import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GlassActionPill } from "../cart/GlassActionPill";
import { uiPalette, uiTypography } from "../ui/system";

type DeleteAccountSheetProps = {
  open: boolean;
  bottomInset: number;
  pending?: boolean;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountSheet({
  open,
  bottomInset,
  pending = false,
  onClose,
  onCancel,
  onConfirm
}: DeleteAccountSheetProps) {
  const sheetRef = useRef<ComponentRef<typeof BottomSheet>>(null);
  const snapPoints = useMemo(() => ["56%"], []);

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
      enablePanDownToClose={!pending}
      enableContentPanningGesture={!pending}
      enableHandlePanningGesture={!pending}
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
          pressBehavior={pending ? "none" : "close"}
        />
      )}
      backgroundStyle={styles.sheet}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: Math.max(bottomInset, 8) }]}>
        <View>
          <Text style={styles.title}>Delete Account?</Text>
          <Text style={styles.body}>
            This permanently deletes your profile, sessions, rewards, notifications, and order history tied to this
            account. This cannot be undone.
          </Text>
        </View>

        <View style={styles.actionsSpacer} />

        <View style={styles.actions}>
          <GlassActionPill
            label={pending ? "Deleting Account…" : "Delete Account"}
            onPress={onConfirm}
            tone="danger"
            disabled={pending}
          />
          <GlassActionPill label="Keep Account" onPress={onCancel} disabled={pending} />
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
