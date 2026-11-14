import { nativeApplePageHeaderOptions } from "../navigation/nativeApplePageHeaderOptions";
import type { SearchBarProps } from "react-native-screens";

export const nativeSearchBarOptions = {
  placeholder: "Search menu",
  placement: "stacked",
  allowToolbarIntegration: false,
  autoCapitalize: "none",
  autoFocus: false,
  hideWhenScrolling: false
} satisfies SearchBarProps;

/** Configure before the screen's first native frame, not from a mounted child effect. */
export function nativeAppleSearchHeaderOptions(openAccount: () => void, nativeBarMinimization: boolean) {
  return {
    ...nativeApplePageHeaderOptions("Search", openAccount, nativeBarMinimization),
    headerSearchBarOptions: nativeSearchBarOptions
  };
}
