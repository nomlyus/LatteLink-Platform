import type { MenuCategory, MenuItem } from "./catalog";

export type MenuSection = { id: string; label: string; items: MenuItem[] };

export function buildMenuSections(categories: MenuCategory[]): MenuSection[] {
  const allItems = [
    ...new Map(categories.flatMap((category) => category.items).map((item) => [item.id, item])).values()
  ];
  const featuredItems = allItems.filter((item) => item.featured);
  return [
    ...(featuredItems.length > 0 ? [{ id: "featured", label: "Featured", items: featuredItems }] : []),
    ...categories.map((category) => ({ id: category.id, label: category.title, items: category.items }))
  ];
}
