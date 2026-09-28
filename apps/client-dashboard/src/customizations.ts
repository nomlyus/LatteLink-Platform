import type { MenuItemCustomizationGroup } from "@lattelink/contracts-catalog";
import { state } from "./state";
import type { OperatorMenuCategory, OperatorMenuItem } from "./model";
import { parseIntegerOrFallback } from "./ui/format";

export function cloneCustomizationGroups(groups: readonly MenuItemCustomizationGroup[]) {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({ ...option }))
  }));
}

export function snapshotCustomizationDrafts(categories: readonly OperatorMenuCategory[]) {
  const drafts: Record<string, MenuItemCustomizationGroup[]> = {};
  for (const category of categories) {
    for (const item of category.items) {
      drafts[item.itemId] = cloneCustomizationGroups(item.customizationGroups ?? []);
    }
  }
  return drafts;
}

function findMenuItem(itemId: string): OperatorMenuItem | null {
  for (const category of state.menuCategories) {
    const found = category.items.find((item) => item.itemId === itemId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function ensureMenuCustomizationDraft(itemId: string) {
  if (!state.menuCustomizationDrafts[itemId]) {
    const menuItem = findMenuItem(itemId);
    state.menuCustomizationDrafts[itemId] = cloneCustomizationGroups(
      menuItem?.customizationGroups ?? []
    );
  }
  return state.menuCustomizationDrafts[itemId] ?? [];
}

export function createCustomizationOptionDraft(
  sortOrder: number
): MenuItemCustomizationGroup["options"][number] {
  return {
    id: globalThis.crypto.randomUUID(),
    label: "New option",
    description: undefined,
    priceDeltaCents: 0,
    default: false,
    available: true,
    sortOrder,
    displayStyle: undefined
  };
}

export function createCustomizationGroupDraft(sortOrder: number): MenuItemCustomizationGroup {
  return {
    id: globalThis.crypto.randomUUID(),
    sourceGroupId: undefined,
    label: "New group",
    description: undefined,
    selectionType: "single",
    required: false,
    minSelections: 0,
    maxSelections: 1,
    sortOrder,
    displayStyle: undefined,
    options: [createCustomizationOptionDraft(0)]
  };
}

export function sanitizeCustomizationGroupsForSubmit(
  groups: readonly MenuItemCustomizationGroup[]
) {
  return groups.map((group) => ({
    id: group.id,
    sourceGroupId: group.sourceGroupId,
    label: group.label,
    description: group.description,
    selectionType: group.selectionType,
    required: group.required,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    sortOrder: group.sortOrder,
    displayStyle: group.displayStyle,
    options: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      priceDeltaCents: option.priceDeltaCents,
      default: option.default,
      available: option.available,
      sortOrder: option.sortOrder,
      displayStyle: option.displayStyle
    }))
  }));
}

export function updateCustomizationDraftFromInput(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return false;
  }

  const itemId = target.dataset.customizationItemId;
  const groupIndexValue = target.dataset.customizationGroupIndex;
  const field = target.dataset.customizationField;
  if (!itemId || !groupIndexValue || !field) {
    return false;
  }

  const groupIndex = Number.parseInt(groupIndexValue, 10);
  if (!Number.isFinite(groupIndex)) {
    return false;
  }

  const draft = ensureMenuCustomizationDraft(itemId);
  const group = draft[groupIndex];
  if (!group) {
    return false;
  }

  const optionIndexValue = target.dataset.customizationOptionIndex;
  if (optionIndexValue !== undefined) {
    const optionIndex = Number.parseInt(optionIndexValue, 10);
    if (!Number.isFinite(optionIndex)) {
      return false;
    }
    const option = group.options[optionIndex];
    if (!option) {
      return false;
    }

    if (field === "label") {
      option.label = target.value;
    } else if (field === "priceDeltaCents") {
      option.priceDeltaCents = parseIntegerOrFallback(target.value, option.priceDeltaCents);
    } else if (field === "default" && target instanceof HTMLInputElement) {
      option.default = target.checked;
    } else if (field === "available" && target instanceof HTMLInputElement) {
      option.available = target.checked;
    } else if (field === "sortOrder") {
      option.sortOrder = parseIntegerOrFallback(target.value, option.sortOrder ?? optionIndex);
    }
    return true;
  }

  if (field === "label") {
    group.label = target.value;
  } else if (field === "selectionType") {
    group.selectionType = target.value === "single" ? "single" : "multiple";
  } else if (field === "required" && target instanceof HTMLInputElement) {
    group.required = target.checked;
  } else if (field === "sortOrder") {
    group.sortOrder = parseIntegerOrFallback(target.value, group.sortOrder ?? groupIndex);
  }
  return true;
}
