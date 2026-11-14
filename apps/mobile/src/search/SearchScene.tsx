import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { CatalogSearchResults } from "./CatalogSearchResults";
import { useSearchFocus } from "./useSearchFocus";
import { uiPalette } from "../ui/systemColors";

/** Native text input fallback for Android and installed clients without the Apple header bridge. */
export function SearchScene() {
  const [query, setQuery] = useState("");
  const { webSearchRef, onSearchFocus, onSearchBlur } = useSearchFocus({ useTextInput: true });
  return <>
    <Stack.Screen options={{ title: "Search", headerShown: true, headerLargeTitleEnabled: true,
      headerTitleStyle: { color: uiPalette.text }, headerLargeTitleStyle: { color: uiPalette.text },
      headerShadowVisible: false, contentStyle: { backgroundColor: uiPalette.background } }} />
    <View style={styles.screen}>
      <TextInput ref={webSearchRef} allowFontScaling={false} maxFontSizeMultiplier={1}
        accessibilityLabel="Search menu" placeholder="Search menu" placeholderTextColor={uiPalette.textSecondary}
        value={query} onChangeText={setQuery} onFocus={onSearchFocus} onBlur={onSearchBlur}
        autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.input} />
      <CatalogSearchResults query={query} />
    </View>
  </>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: uiPalette.background },
  input: { marginHorizontal: 20, marginVertical: 12, paddingHorizontal: 16, minHeight: 48,
    borderRadius: 16, color: uiPalette.text, backgroundColor: uiPalette.surfaceStrong, fontSize: 17 }
});
