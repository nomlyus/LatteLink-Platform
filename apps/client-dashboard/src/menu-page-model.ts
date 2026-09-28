import type { OperatorMenuCategory, OperatorMenuItem } from "./model";

export type MenuAvailabilityFilter = "all" | "available" | "sold-out";
export type MenuVisibilityFilter = "all" | "visible" | "hidden";

export function getUniqueMenuItems(categories: readonly OperatorMenuCategory[]): OperatorMenuItem[] {
  const items = new Map<string, OperatorMenuItem>();
  const categoryMemberships = new Map<string, string[]>();

  for (const category of categories) {
    for (const item of category.items) {
      const memberships = categoryMemberships.get(item.itemId) ?? [];
      if (!memberships.includes(category.categoryId)) memberships.push(category.categoryId);
      categoryMemberships.set(item.itemId, memberships);
      if (!items.has(item.itemId)) items.set(item.itemId, item);
    }
  }

  const categoryOrder = new Map(categories.map((category, index) => [category.categoryId, index]));
  return [...items.values()]
    .map((item) => {
      const categoryIds = item.categoryIds?.length
        ? item.categoryIds
        : categoryMemberships.get(item.itemId) ?? [item.categoryId];
      return { ...item, categoryIds };
    })
    .sort((left, right) => {
      const leftCategoryOrder = categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER;
      const rightCategoryOrder = categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER;
      return leftCategoryOrder - rightCategoryOrder || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
    });
}

export function getItemCategories(item: Pick<OperatorMenuItem, "categoryId" | "categoryIds">, categories: readonly OperatorMenuCategory[]) {
  const categoryIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
  const byId = new Map(categories.map((category) => [category.categoryId, category]));
  const listed = categoryIds.map((id) => byId.get(id)).filter((category): category is OperatorMenuCategory => Boolean(category));
  if (listed.length > 0) return listed;
  const primary = byId.get(item.categoryId);
  return primary ? [primary] : [];
}

export function filterMenuItems(
  items: readonly OperatorMenuItem[],
  categories: readonly OperatorMenuCategory[],
  modifierGroups: readonly { id: string; label: string }[],
  filters: {
    search: string;
    categoryId: string;
    availability: MenuAvailabilityFilter;
    visibility: MenuVisibilityFilter;
  }
) {
  const query = filters.search.trim().toLocaleLowerCase();
  const groupLabels = new Map(modifierGroups.map((group) => [group.id, group.label]));

  return items.filter((item) => {
    if (filters.categoryId !== "all" && !(item.categoryIds ?? [item.categoryId]).includes(filters.categoryId)) return false;
    if (filters.availability === "available" && !item.available) return false;
    if (filters.availability === "sold-out" && item.available) return false;
    if (filters.visibility === "visible" && !item.visible) return false;
    if (filters.visibility === "hidden" && item.visible) return false;
    if (!query) return true;

    const searchable = [
      item.name,
      item.description,
      ...item.badgeCodes,
      ...getItemCategories(item, categories).map((category) => category.title),
      ...(item.modifierGroupAssignments ?? []).map((assignment) => groupLabels.get(assignment.modifierGroupId) ?? "")
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(query);
  });
}

export function getModifierGroupUsage(categories: readonly OperatorMenuCategory[]) {
  const usage = new Map<string, OperatorMenuItem[]>();
  for (const item of getUniqueMenuItems(categories)) {
    for (const assignment of item.modifierGroupAssignments ?? []) {
      const items = usage.get(assignment.modifierGroupId) ?? [];
      items.push(item);
      usage.set(assignment.modifierGroupId, items);
    }
  }
  return usage;
}

export function getPageRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { start: 0, end: 0 };
  return { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, total) };
}
