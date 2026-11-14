import type { Ionicons } from "@expo/vector-icons";

type TabDefinition = {
  name: string;
  title: string;
  icons: {
    default: keyof typeof Ionicons.glyphMap;
    active: keyof typeof Ionicons.glyphMap;
  };
  iconSize: number;
  nativeIcon: { sf: { default: string; selected: string }; md: string };
};

export const bottomTabs = [
  {
    name: "home",
    title: "Home",
    icons: { default: "home-outline", active: "home" },
    iconSize: 24,
    nativeIcon: { sf: { default: "house", selected: "house" }, md: "home" }
  },
  {
    name: "menu",
    title: "Menu",
    icons: { default: "cafe-outline", active: "cafe" },
    iconSize: 28,
    nativeIcon: { sf: { default: "cup.and.saucer", selected: "cup.and.saucer" }, md: "local_cafe" }
  },
  {
    name: "rewards",
    title: "Rewards",
    icons: { default: "gift-outline", active: "gift" },
    iconSize: 24,
    nativeIcon: { sf: { default: "gift", selected: "gift" }, md: "card_giftcard" }
  },
  {
    name: "search",
    title: "Search",
    icons: { default: "search-outline", active: "search" },
    iconSize: 24,
    nativeIcon: { sf: { default: "magnifyingglass", selected: "magnifyingglass" }, md: "search" }
  }
] as const satisfies readonly TabDefinition[];

const fallbackIcons = {
  default: "ellipse-outline",
  active: "ellipse"
} as const;

export function getBottomTabPresentation(name: string, title?: unknown) {
  const tab = bottomTabs.find((entry) => entry.name === name);
  return {
    label: typeof title === "string" ? title : (tab?.title ?? name),
    icons: tab?.icons ?? fallbackIcons,
    iconSize: tab?.iconSize ?? 24
  };
}

export function formatCartTabCount(itemCount: number) {
  return itemCount > 99 ? "99+" : String(itemCount);
}
