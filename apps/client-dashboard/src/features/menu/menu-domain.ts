import {
  adminMenuItemUpdateSchema,
  adminModifierGroupCreateSchema,
  type AdminModifierGroupCreate,
  type AdminMenuItemUpdate
} from "@lattelink/contracts-catalog";
import type { OperatorMenuCategory, OperatorMenuItem, OperatorModifierGroup } from "../../model";

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

export function getItemCategories(
  item: Pick<OperatorMenuItem, "categoryId" | "categoryIds">,
  categories: readonly OperatorMenuCategory[]
) {
  const categoryIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
  const byId = new Map(categories.map((category) => [category.categoryId, category]));
  const listed = categoryIds.map((id) => byId.get(id)).filter((category): category is NonNullable<typeof category> => Boolean(category));
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

export type MenuItemUpdateOverrides = Partial<Omit<OperatorMenuItem, "imageUrl">> & {
  imageUrl?: string | null;
};

export function parseMenuPriceCents(value: string, label: string, allowNegative = false) {
  const amount = Number(value);
  if (!value.trim() || !Number.isFinite(amount)) {
    throw new Error(`${label} must be a valid amount.`);
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
  if (!allowNegative && cents < 0) throw new Error(`${label} cannot be negative.`);
  return cents;
}

export function buildMenuItemUpdatePayload(
  item: OperatorMenuItem,
  overrides: MenuItemUpdateOverrides = {}
): AdminMenuItemUpdate {
  const next = { ...item, ...overrides };
  return adminMenuItemUpdateSchema.parse({
    name: next.name.trim(),
    description: next.description ?? "",
    priceCents: next.priceCents,
    visible: next.visible,
    available: next.available,
    featured: next.featured,
    badgeCodes: next.badgeCodes ?? [],
    categoryIds: next.categoryIds?.length ? next.categoryIds : [next.categoryId],
    modifierGroupAssignments: [...(next.modifierGroupAssignments ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder),
    sortOrder: next.sortOrder,
    ...(next.imageUrl === undefined ? {} : { imageUrl: next.imageUrl })
  });
}

export function buildCategoryMembershipUpdates(
  items: readonly OperatorMenuItem[],
  categoryId: string,
  memberItemIds: readonly string[]
) {
  const selectedMembers = new Set(memberItemIds);
  const updates: Array<{ item: OperatorMenuItem; categoryIds: string[]; payload: AdminMenuItemUpdate }> = [];
  for (const item of items) {
    const currentIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
    const currentlyBelongs = currentIds.includes(categoryId);
    const shouldBelong = selectedMembers.has(item.itemId);
    if (currentlyBelongs === shouldBelong) continue;
    const categoryIds = shouldBelong ? [...currentIds, categoryId] : currentIds.filter((id) => id !== categoryId);
    if (categoryIds.length === 0) {
      throw new Error(`${item.name} must stay in at least one category. Add another category before removing this membership.`);
    }
    updates.push({ item, categoryIds, payload: buildMenuItemUpdatePayload(item, { categoryIds }) });
  }
  return updates;
}

export type ModifierOptionDraft = {
  id: string;
  label: string;
  description: string;
  priceDelta: string;
  default: boolean;
  available: boolean;
  displayStyle?: OperatorModifierGroup["options"][number]["displayStyle"];
};

export type ModifierGroupDraft = {
  label: string;
  description: string;
  selectionType: "single" | "multiple";
  required: boolean;
  minSelections: string;
  maxSelections: string;
  options: ModifierOptionDraft[];
};

export function buildItemModifierGroupAssignments(
  existingAssignments: OperatorMenuItem["modifierGroupAssignments"],
  modifierGroupIds: readonly string[]
) {
  const existingById = new Map(existingAssignments.map((assignment) => [assignment.modifierGroupId, assignment]));
  return modifierGroupIds.map((modifierGroupId, sortOrder) => {
    const existing = existingById.get(modifierGroupId);
    return {
      modifierGroupId,
      sortOrder,
      ...(existing?.requiredOverride === undefined ? {} : { requiredOverride: existing.requiredOverride }),
      ...(existing?.minSelectionsOverride === undefined ? {} : { minSelectionsOverride: existing.minSelectionsOverride }),
      ...(existing?.maxSelectionsOverride === undefined ? {} : { maxSelectionsOverride: existing.maxSelectionsOverride })
    };
  });
}

export function buildModifierGroupPayload(
  draft: ModifierGroupDraft,
  existing: OperatorModifierGroup | null,
  sortOrder: number,
  createOptionId: () => string
): AdminModifierGroupCreate {
  const options = draft.options.map((option, index) => ({
    id: option.id || createOptionId(),
    label: option.label.trim(),
    description: option.description.trim(),
    priceDeltaCents: parseMenuPriceCents(option.priceDelta, "Modifier price change", true),
    default: option.default,
    available: option.available,
    sortOrder: index,
    ...(option.displayStyle ? { displayStyle: option.displayStyle } : {})
  }));
  const result = adminModifierGroupCreateSchema.safeParse({
    ...(existing ? { id: existing.id } : {}),
    ...(existing?.sourceGroupId ? { sourceGroupId: existing.sourceGroupId } : {}),
    label: draft.label.trim(),
    description: draft.description.trim(),
    selectionType: draft.selectionType,
    required: draft.required,
    minSelections: Number(draft.minSelections),
    maxSelections: draft.selectionType === "single" ? 1 : Number(draft.maxSelections),
    sortOrder: existing?.sortOrder ?? sortOrder,
    ...(existing?.displayStyle ? { displayStyle: existing.displayStyle } : {}),
    options
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Check the modifier group details.");
  return result.data;
}

export function getMenuApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "payload" in error) {
    const payload = error.payload;
    if (typeof payload === "object" && payload !== null && "code" in payload && payload.code === "MODIFIER_GROUP_IN_USE") {
      return "This modifier group is assigned to one or more items. Remove those assignments before deleting the group.";
    }
  }
  return error instanceof Error ? error.message : fallback;
}
