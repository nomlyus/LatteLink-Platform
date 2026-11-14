import type { MenuCategory, MenuItem } from "../menu/catalog";

export type CatalogSearchResult = { item: MenuItem; category: string };
export function searchCatalog(categories: MenuCategory[], query: string): CatalogSearchResult[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results = categories.filter((category) => category.visible).flatMap((category) => category.items
    .filter((item) => item.visible && terms.every((term) =>
      `${item.name} ${item.description ?? ""} ${category.title}`.toLocaleLowerCase().includes(term)))
    .map((item) => ({ item, category: category.title })));
  return [...new Map(results.map((result) => [result.item.id, result])).values()];
}
