import { useState } from "react";
import { Stack } from "expo-router";
import { CatalogSearchResults } from "./CatalogSearchResults";
import { nativeSearchBarOptions } from "./nativeAppleSearchHeaderOptions";
import { useSearchFocus } from "./useSearchFocus";

/** Title and Account are owned by one UIKit navigation bar, including its scroll lifecycle. */
export function NativeAppleSearchPreview() {
  const { nativeSearchRef, onSearchFocus, onSearchBlur } = useSearchFocus();
  const [query, setQuery] = useState("");
  return (
    <>
      <Stack.Screen options={{ headerSearchBarOptions: {
        ...nativeSearchBarOptions,
        ref: nativeSearchRef,
        onFocus: onSearchFocus,
        onBlur: onSearchBlur,
        onChangeText: (event) => setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setQuery("")
      } }} />
      <CatalogSearchResults query={query} />
    </>
  );
}
