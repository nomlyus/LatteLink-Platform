import { SymbolView } from "expo-symbols";
import type { ColorValue } from "react-native";

const accountSymbols = {
  gift: { ios: "gift", android: "redeem" }, person: { ios: "person", android: "person" },
  settings: { ios: "gearshape", android: "settings" }, location: { ios: "mappin.and.ellipse", android: "location_on" },
  notifications: { ios: "bell", android: "notifications" }, "shield-checkmark": { ios: "hand.raised", android: "privacy_tip" },
  trash: { ios: "trash", android: "delete" }, "log-out": { ios: "rectangle.portrait.and.arrow.right", android: "logout" }
} as const;
export type AccountSymbolName = keyof typeof accountSymbols;
export function AccountSymbol({ name, color }: { name: AccountSymbolName; color: ColorValue }) {
  return <SymbolView name={accountSymbols[name]} size={24} tintColor={color} accessible={false} />;
}
