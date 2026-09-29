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
    isSwitchBlockedByCart,
    isSwitchingLocation
  } = useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectionError, setSelectionError] = useState(false);

  if (!hasMultipleLocations) {
    return <>{children}</>;
  }

  const chooseLocation = async (locationId: string) => {
    setSelectionError(false);
    const result = await selectLocation(locationId);
    if (result.ok) {
      setIsOpen(false);
    } else if (result.reason === "persistence_failed") {
      setSelectionError(true);
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

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close location chooser"
            onPress={() => setIsOpen(false)}
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
                onPress={() => setIsOpen(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={uiPalette.text} />
              </Pressable>
            </View>

            {isSwitchBlockedByCart ? (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetNote}>Empty your cart before switching locations.</Text>
            ) : (
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetNote}>Your menu and store details will update for the selected location.</Text>
            )}
            {selectionError ? <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.errorText}>Could not save that location. Please try again.</Text> : null}

            <View style={styles.locationList}>
              {locations.map((location) => {
                const isSelected = location.locationId === selectedLocationId;
                const disabled = isSelected || isSwitchBlockedByCart || isSwitchingLocation;
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
            </View>
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
