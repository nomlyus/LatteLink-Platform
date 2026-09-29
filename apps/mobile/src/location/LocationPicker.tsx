import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocationContext } from "./LocationProvider";
import { uiPalette, uiTypography } from "../ui/system";

export function LocationPicker({ children, color = uiPalette.text }: { children: ReactNode; color?: string }) {
  const {
    hasMultipleLocations,
    locations,
    selectedLocationId,
    selectLocation,
    confirmLocationSwitch,
    isSwitchingLocation
  } = useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null);

  if (!hasMultipleLocations) {
    return <>{children}</>;
  }

  const chooseLocation = async (locationId: string) => {
    setSelectionError(null);
    const result = await selectLocation(locationId);
    if (result.ok) {
      setIsOpen(false);
      setPendingLocationId(null);
    } else if (result.reason === "confirmation_required") {
      setPendingLocationId(locationId);
    } else if (result.reason === "persistence_failed") {
      setSelectionError("Could not save that location. Please try again.");
    } else if (result.reason === "not_available") {
      setSelectionError("That location is no longer available. Choose another location.");
    }
  };

  const cancelSwitch = () => {
    if (isSwitchingLocation) return;
    setPendingLocationId(null);
    setSelectionError(null);
    setIsOpen(false);
  };

  const confirmSwitch = async () => {
    if (!pendingLocationId) return;
    setSelectionError(null);
    const result = await confirmLocationSwitch(pendingLocationId);
    if (result.ok) {
      setPendingLocationId(null);
      setIsOpen(false);
    } else if (result.reason === "persistence_failed") {
      setSelectionError("Could not save that location. Please try again.");
    } else if (result.reason === "not_available") {
      setPendingLocationId(null);
      setSelectionError("That location is no longer available. Choose another location.");
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change location"
        accessibilityHint="Choose a different location for this branded app"
        onPress={() => setIsOpen(true)}
        disabled={isSwitchingLocation}
        style={({ pressed }) => [styles.trigger, pressed ? styles.triggerPressed : null]}
      >
        <View style={styles.triggerLabel}>{children}</View>
        <Ionicons name="chevron-down" size={14} color={color} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={cancelSwitch}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close location chooser"
            onPress={cancelSwitch}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeadingCopy}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetEyebrow}>Your locations</Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetTitle}>Choose a location</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close location chooser"
                onPress={cancelSwitch}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={uiPalette.text} />
              </Pressable>
            </View>

            {pendingLocationId ? (
              <>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetNote}>
                  Changing location will clear your cart. Your discount and any pending checkout will also be removed.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={cancelSwitch}
                    disabled={isSwitchingLocation}
                    style={({ pressed }) => [styles.cancelButton, pressed ? styles.locationRowPressed : null]}
                  >
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void confirmSwitch()}
                    disabled={isSwitchingLocation}
                    style={({ pressed }) => [styles.confirmButton, pressed ? styles.locationRowPressed : null]}
                  >
                    {isSwitchingLocation ? <ActivityIndicator color={uiPalette.surfaceStrong} size="small" /> : null}
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.confirmButtonText}>Clear cart and switch</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetNote}>Your menu and store details will update for the selected location.</Text>
            )}
            {selectionError ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.errorText}>{selectionError}</Text> : null}

            {!pendingLocationId ? <View style={styles.locationList}>
              {locations.map((location) => {
                const isSelected = location.locationId === selectedLocationId;
                const disabled = isSelected || isSwitchingLocation;
                return (
                  <Pressable
                    key={location.locationId}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled }}
                    onPress={() => void chooseLocation(location.locationId)}
                    disabled={disabled}
                    style={({ pressed }) => [styles.locationRow, pressed ? styles.locationRowPressed : null, disabled && !isSelected ? styles.locationRowDisabled : null]}
                  >
                    <View style={styles.locationCopy}>
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[styles.locationName, isSelected ? styles.locationNameSelected : null]} numberOfLines={1}>
                        {location.displayName}
                      </Text>
                      <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.marketLabel} numberOfLines={1}>{location.marketLabel}</Text>
                    </View>
                    {isSwitchingLocation && !isSelected ? (
                      <ActivityIndicator color={uiPalette.primary} size="small" />
                    ) : isSelected ? (
                      <Ionicons name="checkmark-circle" size={21} color={uiPalette.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={uiPalette.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  triggerPressed: {
    opacity: 0.76
  },
  triggerLabel: {
    flexShrink: 1
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(18, 16, 14, 0.32)"
  },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 34,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong,
    gap: 12
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  sheetHeadingCopy: {
    flex: 1,
    gap: 4
  },
  sheetEyebrow: {
    color: uiPalette.textMuted,
    fontFamily: uiTypography.monoFamily,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  sheetTitle: {
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontSize: 23,
    fontWeight: "700",
    letterSpacing: -0.4
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiPalette.surfaceMuted
  },
  sheetNote: {
    color: uiPalette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  errorText: {
    color: uiPalette.warning,
    fontSize: 13
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },
  cancelButton: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: uiPalette.surfaceMuted
  },
  cancelButtonText: {
    color: uiPalette.text,
    fontSize: 14,
    fontWeight: "600"
  },
  confirmButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: uiPalette.primary
  },
  confirmButtonText: {
    color: uiPalette.surfaceStrong,
    fontSize: 14,
    fontWeight: "700"
  },
  locationList: {
    gap: 8,
    marginTop: 4
  },
  locationRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceStrong
  },
  locationRowPressed: {
    opacity: 0.75
  },
  locationRowDisabled: {
    opacity: 0.48
  },
  locationCopy: {
    flex: 1,
    gap: 3
  },
  locationName: {
    color: uiPalette.text,
    fontSize: 15,
    fontWeight: "600"
  },
  locationNameSelected: {
    color: uiPalette.primary
  },
  marketLabel: {
    color: uiPalette.textMuted,
    fontSize: 12
  }
});
