import { adminStoreConfigUpdateSchema } from "@lattelink/contracts-catalog";
import { z } from "zod";

export type StoreSettingsFormInput = {
  storeName?: string;
  locationName?: string;
  hours?: string;
  pickupInstructions?: string;
  taxRateBasisPoints?: string | number;
};

export type StoreSettingsUpdate = z.output<typeof adminStoreConfigUpdateSchema>;

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalBasisPoints(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(10_000, Math.trunc(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(10_000, Math.trunc(parsed)));
  }
  return undefined;
}

export function normalizeStoreSettingsForm(input: StoreSettingsFormInput | unknown): StoreSettingsUpdate {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const taxRateBasisPoints = normalizeOptionalBasisPoints(value.taxRateBasisPoints);
  return adminStoreConfigUpdateSchema.parse({
    storeName: textValue(value.storeName),
    locationName: textValue(value.locationName),
    hours: textValue(value.hours),
    pickupInstructions: textValue(value.pickupInstructions),
    ...(taxRateBasisPoints === undefined ? {} : { taxRateBasisPoints })
  });
}

export function getStoreSettingsScopeKey(
  operatorUserId: string | null,
  locationId: string | "all" | null,
  capabilities: readonly string[] = [],
  sessionGeneration = 0
) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}:${[...capabilities].sort().join(",")}:${sessionGeneration}`;
}
