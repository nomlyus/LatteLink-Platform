import DateTimePicker from "@react-native-community/datetimepicker";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Picker } from "@react-native-picker/picker";
import { useCallback, useMemo, type ComponentRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { uiPalette } from "../ui/system";

export const COUNTRY_CODES = [
  { code: "+1", flag: "🇺🇸", name: "United States" },
  { code: "+1", flag: "🇨🇦", name: "Canada" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "+33", flag: "🇫🇷", name: "France" },
  { code: "+34", flag: "🇪🇸", name: "Spain" },
  { code: "+39", flag: "🇮🇹", name: "Italy" },
  { code: "+81", flag: "🇯🇵", name: "Japan" },
  { code: "+82", flag: "🇰🇷", name: "South Korea" },
  { code: "+86", flag: "🇨🇳", name: "China" },
  { code: "+91", flag: "🇮🇳", name: "India" },
  { code: "+52", flag: "🇲🇽", name: "Mexico" },
  { code: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { code: "+20", flag: "🇪🇬", name: "Egypt" },
  { code: "+27", flag: "🇿🇦", name: "South Africa" },
  { code: "+31", flag: "🇳🇱", name: "Netherlands" },
  { code: "+46", flag: "🇸🇪", name: "Sweden" }
];

export type CountryEntry = (typeof COUNTRY_CODES)[number];

export function parsePhoneWithCode(raw: string): { dial: CountryEntry; local: string } {
  const defaultDial = COUNTRY_CODES[0];
  if (!raw) return { dial: defaultDial, local: "" };
  const match = COUNTRY_CODES.find((c) => raw.startsWith(c.code + " ") || raw.startsWith(c.code));
  if (match) {
    const local = raw.slice(match.code.length).replace(/^\s+/, "");
    return { dial: match, local };
  }
  return { dial: defaultDial, local: raw };
}

export function CountrySheet({
  sheetRef,
  selected,
  onSelect
}: {
  sheetRef: React.RefObject<ComponentRef<typeof BottomSheet> | null>;
  selected: CountryEntry;
  onSelect: (c: CountryEntry) => void;
}) {
  const snapPoints = useMemo(() => [260], []);
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.36} pressBehavior="close" />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      animateOnMount={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView>
        <View style={styles.sheetHeader}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetTitle}>
            Country Code
          </Text>
          <TouchableOpacity onPress={() => sheetRef.current?.close()} style={styles.sheetDone}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetDoneText}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
        <Picker
          selectedValue={selected.name}
          onValueChange={(name) => {
            const found = COUNTRY_CODES.find((c) => c.name === name);
            if (found) onSelect(found);
          }}
          itemStyle={styles.pickerItem}
        >
          {COUNTRY_CODES.map((c) => (
            <Picker.Item key={c.name} label={`${c.flag}  ${c.name}  ${c.code}`} value={c.name} />
          ))}
        </Picker>
      </BottomSheetView>
    </BottomSheet>
  );
}

export function DateSheet({
  sheetRef,
  value,
  onChange
}: {
  sheetRef: React.RefObject<ComponentRef<typeof BottomSheet> | null>;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const snapPoints = useMemo(() => [300], []);
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.36} pressBehavior="close" />
    ),
    []
  );
  const maxDate = new Date();
  const defaultDate = value ?? new Date(new Date().getFullYear() - 25, 0, 1);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      animateOnMount={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView>
        <View style={styles.sheetHeader}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetTitle}>
            Birthday
          </Text>
          <TouchableOpacity onPress={() => sheetRef.current?.close()} style={styles.sheetDone}>
            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sheetDoneText}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.datePickerWrap}>
          <DateTimePicker
            value={defaultDate}
            mode="date"
            display="spinner"
            maximumDate={maxDate}
            onValueChange={(_, date) => onChange(date)}
            onDismiss={() => onChange(defaultDate)}
            style={styles.datePicker}
            textColor={uiPalette.text}
          />
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: uiPalette.surfaceStrong,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: uiPalette.borderStrong
  },
  sheetHandle: {
    backgroundColor: "rgba(151,160,154,0.52)"
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 2
  },
  sheetTitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: uiPalette.textMuted
  },
  sheetDone: {
    paddingVertical: 6,
    paddingLeft: 16
  },
  sheetDoneText: {
    fontSize: 16,
    fontWeight: "600",
    color: uiPalette.primary
  },
  pickerItem: {
    fontSize: 17,
    color: uiPalette.text
  },
  datePicker: {
    width: "100%",
    height: 200,
    alignSelf: "center"
  },
  datePickerWrap: {
    alignItems: "center",
    justifyContent: "center"
  }
});
