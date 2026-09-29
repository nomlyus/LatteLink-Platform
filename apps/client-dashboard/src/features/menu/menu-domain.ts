import {
  adminMenuItemUpdateSchema,
  adminModifierGroupCreateSchema,
  type AdminModifierGroupCreate,
  type AdminMenuItemUpdate
} from "@lattelink/contracts-catalog";
import type { OperatorMenuItem, OperatorModifierGroup } from "../../model";

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
