import {
  buildDefaultCustomizationInput,
  describeCustomizationSelection,
  EMPTY_MENU_ITEM_CUSTOMIZATION,
  normalizeCustomizationInput,
  priceMenuItemCustomization,
  resolveMenuItemCustomization,
  type CustomizationGroupSelectionSnapshot,
  type MenuItemCustomizationGroup,
  type MenuItemCustomizationInput
} from "@lattelink/contracts-catalog";

export type CartCustomization = MenuItemCustomizationInput;
export type CartCustomizationGroupSelection = CustomizationGroupSelectionSnapshot;

export type CartItemInput = {
  menuItemId: string;
  itemName: string;
  basePriceCents: number;
  customizationGroups: MenuItemCustomizationGroup[];
  customization?: CartCustomization;
  quantity?: number;
};

export type CartItem = {
  lineId: string;
  menuItemId: string;
  itemName: string;
  basePriceCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
  quantity: number;
  customization: CartCustomization;
  customizationSelections: CartCustomizationGroupSelection[];
};

export type CartPricingSummary = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export const DEFAULT_CUSTOMIZATION: CartCustomization = EMPTY_MENU_ITEM_CUSTOMIZATION;

export function normalizeCustomization(input: unknown): CartCustomization {
  return normalizeCustomizationInput(input);
}

export function buildDefaultCustomization(groups: MenuItemCustomizationGroup[]): CartCustomization {
  return buildDefaultCustomizationInput(groups);
}

export function isCustomizationOptionSelected(
  customization: CartCustomization,
  groupId: string,
  optionId: string
): boolean {
  return customization.selectedOptions.some(
    (selection) => selection.groupId === groupId && selection.optionId === optionId
  );
}

export function resolveCartCustomization(
  groups: MenuItemCustomizationGroup[],
  customization: CartCustomization | undefined
) {
  return resolveMenuItemCustomization({
    groups,
    selection: customization ?? DEFAULT_CUSTOMIZATION
  });
}

export function getCustomizationDeltaCents(
  groups: MenuItemCustomizationGroup[],
  customization: CartCustomization | undefined
): number {
  return resolveCartCustomization(groups, customization).customizationDeltaCents;
}

export function getUnitPriceCents(
  basePriceCents: number,
  groups: MenuItemCustomizationGroup[],
  customization: CartCustomization | undefined
): number {
  return priceMenuItemCustomization({
    basePriceCents,
    groups,
    selection: customization ?? DEFAULT_CUSTOMIZATION
  }).unitPriceCents;
}

type CustomizationDescribeOptions = {
  includeNotes?: boolean;
  fallback?: string;
};

export function describeCustomization(
  input: Pick<CartItem, "customization" | "customizationSelections">,
  options: CustomizationDescribeOptions = {}
): string {
  return describeCustomizationSelection({
    selection: input.customization,
    groupSelections: input.customizationSelections,
    includeNotes: options.includeNotes,
    fallback: options.fallback
  });
}

export function toCartLineId(input: CartItemInput): string {
  const customization = normalizeCustomization(input.customization ?? DEFAULT_CUSTOMIZATION);
  const optionMarker =
    customization.selectedOptions.length > 0
      ? customization.selectedOptions.map((selection) => `${selection.groupId}:${selection.optionId}`).join(",")
      : "-";
  const noteMarker = customization.notes.length > 0 ? customization.notes : "-";

  return [input.menuItemId, optionMarker, noteMarker].join("|");
}

function createInvalidCustomizationError(itemName: string, issues: Array<{ message: string }>) {
  const issueSummary = issues.map((issue) => issue.message).join(" ");
  return new Error(`Invalid customization for ${itemName}: ${issueSummary}`);
}

export function createCartItem(input: CartItemInput): CartItem {
  const customization = normalizeCustomization(input.customization ?? DEFAULT_CUSTOMIZATION);
  const quantity = Math.max(1, input.quantity ?? 1);
  const priced = priceMenuItemCustomization({
    basePriceCents: input.basePriceCents,
    quantity,
    groups: input.customizationGroups,
    selection: customization
  });

  if (!priced.valid) {
    throw createInvalidCustomizationError(input.itemName, priced.issues);
  }

  return {
    lineId: toCartLineId({
      ...input,
      customization,
      quantity
    }),
    menuItemId: input.menuItemId,
    itemName: input.itemName,
    basePriceCents: input.basePriceCents,
    unitPriceCents: priced.unitPriceCents,
    lineTotalCents: priced.lineTotalCents,
    quantity,
    customization,
    customizationSelections: priced.groupSelections
  };
}

export function addCartItem(items: CartItem[], input: CartItemInput): CartItem[] {
  const lineId = toCartLineId(input);
  const quantity = Math.max(1, input.quantity ?? 1);
  const existing = items.find((entry) => entry.lineId === lineId);
  if (!existing) {
    return [...items, createCartItem(input)];
  }

  const nextQuantity = existing.quantity + quantity;
  return items.map((entry) =>
    entry.lineId === lineId
      ? {
          ...entry,
          quantity: nextQuantity,
          lineTotalCents: entry.unitPriceCents * nextQuantity
        }
      : entry
  );
}

export function setCartItemQuantity(items: CartItem[], lineId: string, quantity: number): CartItem[] {
  if (quantity <= 0) {
    return items.filter((entry) => entry.lineId !== lineId);
  }

  return items.map((entry) =>
    entry.lineId === lineId
      ? {
          ...entry,
          quantity,
          lineTotalCents: entry.unitPriceCents * quantity
        }
      : entry
  );
}

export function removeCartItem(items: CartItem[], lineId: string): CartItem[] {
  return items.filter((entry) => entry.lineId !== lineId);
}

export function calculateSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.lineTotalCents, 0);
}

export function calculateItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function calculateTaxCents(subtotalCents: number, taxRateBasisPoints: number): number {
  return Math.round((subtotalCents * taxRateBasisPoints) / 10_000);
}

export function buildPricingSummary(subtotalCents: number, taxRateBasisPoints: number): CartPricingSummary {
  const taxCents = calculateTaxCents(subtotalCents, taxRateBasisPoints);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents
  };
}
