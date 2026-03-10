export const SIZE_PRICE_DELTA_CENTS = {
  Regular: 0,
  Large: 100
} as const;

export const MILK_PRICE_DELTA_CENTS = {
  Whole: 0,
  Oat: 75,
  Almond: 75
} as const;

export const EXTRA_SHOT_PRICE_DELTA_CENTS = 125;

export type CartDrinkSize = keyof typeof SIZE_PRICE_DELTA_CENTS;
export type CartMilkOption = keyof typeof MILK_PRICE_DELTA_CENTS;

export type CartCustomization = {
  size: CartDrinkSize;
  milk: CartMilkOption;
  extraShot: boolean;
  notes?: string;
};

export type CartItemInput = {
  menuItemId: string;
  name: string;
  basePriceCents: number;
  customization: CartCustomization;
  quantity?: number;
};

export type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  basePriceCents: number;
  unitPriceCents: number;
  quantity: number;
  customization: CartCustomization;
};

export type CartPricingSummary = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export const DEFAULT_CUSTOMIZATION: CartCustomization = {
  size: "Regular",
  milk: "Whole",
  extraShot: false,
  notes: ""
};

export function normalizeCustomization(input: CartCustomization): CartCustomization {
  return {
    ...input,
    notes: input.notes?.trim() ?? ""
  };
}

export function getCustomizationDeltaCents(customization: CartCustomization): number {
  return (
    SIZE_PRICE_DELTA_CENTS[customization.size] +
    MILK_PRICE_DELTA_CENTS[customization.milk] +
    (customization.extraShot ? EXTRA_SHOT_PRICE_DELTA_CENTS : 0)
  );
}

export function getUnitPriceCents(basePriceCents: number, customization: CartCustomization): number {
  return basePriceCents + getCustomizationDeltaCents(customization);
}

export function toCartLineId(input: CartItemInput): string {
  const customization = normalizeCustomization(input.customization);
  const noteMarker = customization.notes && customization.notes.length > 0 ? customization.notes : "-";

  return [
    input.menuItemId,
    customization.size,
    customization.milk,
    customization.extraShot ? "extra-shot" : "no-extra-shot",
    noteMarker
  ].join("|");
}

export function createCartItem(input: CartItemInput): CartItem {
  const customization = normalizeCustomization(input.customization);
  const quantity = Math.max(1, input.quantity ?? 1);

  return {
    lineId: toCartLineId(input),
    menuItemId: input.menuItemId,
    name: input.name,
    basePriceCents: input.basePriceCents,
    unitPriceCents: getUnitPriceCents(input.basePriceCents, customization),
    quantity,
    customization
  };
}

export function addCartItem(items: CartItem[], input: CartItemInput): CartItem[] {
  const lineId = toCartLineId(input);
  const quantity = Math.max(1, input.quantity ?? 1);
  const existing = items.find((entry) => entry.lineId === lineId);
  if (!existing) {
    return [...items, createCartItem(input)];
  }

  return items.map((entry) =>
    entry.lineId === lineId ? { ...entry, quantity: entry.quantity + quantity } : entry
  );
}

export function setCartItemQuantity(items: CartItem[], lineId: string, quantity: number): CartItem[] {
  if (quantity <= 0) {
    return items.filter((entry) => entry.lineId !== lineId);
  }

  return items.map((entry) => (entry.lineId === lineId ? { ...entry, quantity } : entry));
}

export function removeCartItem(items: CartItem[], lineId: string): CartItem[] {
  return items.filter((entry) => entry.lineId !== lineId);
}

export function calculateSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
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

export function describeCustomization(customization: CartCustomization): string {
  const parts = [`${customization.size}`, `${customization.milk} milk`];
  if (customization.extraShot) {
    parts.push("extra shot");
  }

  if (customization.notes && customization.notes.length > 0) {
    parts.push(`note: ${customization.notes}`);
  }

  return parts.join(" · ");
}
