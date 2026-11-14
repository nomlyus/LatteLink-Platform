import { Stack, useRouter, type NativeStackHeaderItemMenu } from "expo-router";
import { Platform } from "react-native";
import { accountHeaderOptions } from "../navigation/accountHeaderOptions";
import { uiPalette } from "../ui/systemColors";

type Category = { id: string; label: string };

export function categoryMenuItem(categories: readonly Category[], selectedId: string | null, onSelect: (id: string) => void): NativeStackHeaderItemMenu {
  return {
    type: "menu",
    label: "Categories",
    accessibilityLabel: "Choose menu category",
    tintColor: uiPalette.accent,
    sharesBackground: false,
    menu: {
      title: "Categories",
      multiselectable: false,
      items: categories.map((category) => ({
        type: "action",
        label: category.label,
        state: category.id === selectedId ? "on" : "off",
        onPress: () => onSelect(category.id)
      }))
    }
  };
}

/** UIKit owns the menu, glass button, checkmarks and presentation animation. */
export function MenuCategoryMenu({ categories, selectedId, onSelect }: {
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  if (Platform.OS !== "ios") return null;
  const account = accountHeaderOptions(() => router.push("/(tabs)/account"));
  return <Stack.Screen options={{
    unstable_headerRightItems: () => [
      ...(categories.length ? [categoryMenuItem(categories, selectedId, onSelect)] : []),
      ...account.unstable_headerRightItems()
    ]
  }} />;
}
